import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { readConfig as realReadConfig } from '../src/config.js';
import { readConfig, testEnvironment } from './helpers/config.js';
import { memoryDatabase, snapshot } from './helpers/database.js';
import { hashSenha, verificarSenha } from '../src/services/senhas.js';
import { createTokens } from '../src/services/tokens.js';
import { provisionar } from '../src/services/provisionamento.js';
import { createIdentidadeService } from '../src/services/identidade.js';
import { createIdentidadeRepository } from '../src/repositories/identidade.js';
import { createSincronizacaoService } from '../src/services/sincronizacao.js';
import { createSincronizacaoRepository } from '../src/repositories/sincronizacao.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { temporaryDirectory } from './helpers/database.js';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';

const senha = randomBytes(24).toString('base64url');
const senhaHash = await hashSenha(senha);
const config = readConfig();
const tokens = createTokens(config);
const payload = (fields = {}) => ({ eventoId: 1, portaoId: 1, dispositivo: 'auth-device',
  validacoes: [{ idLocal: '17', ingressoId: 1, codigo: 'PC-A7X9K2', dataHora: '2026-11-20T22:03:27Z' }], ...fields });

async function setup(t) {
  const database = memoryDatabase(t);
  for (const [id, usuario, papel] of [[1, 'admin', 'ADMINISTRADOR'], [2, 'operador', 'OPERADOR'],
    [3, 'outro', 'OPERADOR'], [4, 'sem-acesso', 'OPERADOR']]) {
    database.prepare('INSERT INTO usuarios (id, usuario, senha_hash, papel) VALUES (?, ?, ?, ?)').run(id, usuario, senhaHash, papel);
  }
  database.exec(`INSERT INTO usuarios_eventos VALUES (2, 1), (3, 2);
    INSERT INTO usuarios_portoes VALUES (2, 1, 1), (3, 2, 4);
    INSERT INTO instalacoes (dispositivo, usuario_id) VALUES ('auth-device', 2), ('admin-device', 1), ('outro-device', 3)`);
  const logs = [];
  const app = createApp({ config, database, logger: { error: (message) => logs.push(message) } });
  const jwt = {};
  for (const id of [1, 2, 3, 4]) jwt[id] = await tokens.emitir({ id, versao_token: 0 });
  const get = (path, id = 2) => request(app).get(path).set('Authorization', `Bearer ${jwt[id]}`);
  const post = (path, body, id = 2) => request(app).post(path).set('Authorization', `Bearer ${jwt[id]}`).send(body);
  return { database, app, logs, jwt, get, post };
}

test('auth: segredo obrigatório, canônico e TTL limitado sem expor valores', () => {
  for (const env of [{}, { JWT_SECRET: 'curto' }, { JWT_SECRET: 'a'.repeat(44) + '=' },
    { ...testEnvironment, JWT_TTL_SECONDS: '59' }, { ...testEnvironment, JWT_TTL_SECONDS: '3601' }]) {
    assert.throws(() => realReadConfig(env), /Configuração inválida/);
  }
  assert.equal(config.jwtTtlSeconds, 900);
});

test('auth: senha scrypt com salts distintos, custo seguro e verificação real', async () => {
  const otherHash = await hashSenha(senha);
  assert.ok(senhaHash !== otherHash);
  assert.match(senhaHash, /^scrypt\$131072\$8\$1\$/);
  assert.ok(!senhaHash.includes(senha));
  assert.equal(await verificarSenha(senha, senhaHash), true);
  assert.equal(await verificarSenha('senha-incorreta', senhaHash), false);
  assert.equal(await verificarSenha(senha, 'hash-corrompido'), false);
});

test('auth: login válido normaliza usuário, entrega JWT verificável e não expõe hash', async (t) => {
  const { app, logs } = await setup(t);
  const response = await request(app).post('/auth/login').send({ usuario: ' OPERADOR ', senha }).expect(200);
  assert.deepEqual(response.body.usuario, { id: 2, usuario: 'operador', papel: 'OPERADOR' });
  assert.deepEqual(Object.keys(response.body).sort(), ['accessToken', 'expiresIn', 'tokenType', 'usuario']);
  assert.equal(response.body.expiresIn, 900);
  assert.equal(response.headers['cache-control'], 'no-store');
  const principal = await tokens.verificar(`Bearer ${response.body.accessToken}`);
  assert.deepEqual(principal, { id: 2, versao_token: 0 });
  assert.ok(!response.text.includes(senhaHash) && !response.text.includes(senha));
  assert.deepEqual(logs, []);
});

test('auth: senha errada, usuário ausente e inativo recebem o mesmo 401', async (t) => {
  const { app, database, logs } = await setup(t);
  database.prepare('UPDATE usuarios SET ativo = 0 WHERE id = 3').run();
  const results = [];
  for (const body of [{ usuario: 'operador', senha: 'senha-errada-longa' }, { usuario: 'nao-existe', senha }, { usuario: 'outro', senha }]) {
    const r = await request(app).post('/auth/login').send(body).expect(401).expect('WWW-Authenticate', 'Bearer');
    results.push(r.body);
  }
  assert.deepEqual(results, Array(3).fill({ erro: 'CREDENCIAIS_INVALIDAS', mensagem: 'Credenciais inválidas.' }));
  assert.deepEqual(logs, []);
});

test('auth: login estrito rejeita campos extras, entrada SQL e mídia incorreta', async (t) => {
  const { app, database } = await setup(t);
  for (const body of [{ usuario: 'operador', senha, papel: 'ADMINISTRADOR' }, { usuario: "' OR 1=1 --", senha },
    { usuario: 'operador', senha: 'curta' }, { usuario: 'operador', senha: 'a'.repeat(129) }]) {
    await request(app).post('/auth/login').send(body).expect(400);
  }
  await request(app).post('/auth/login').type('text').send('{}').expect(415);
  assert.equal(database.prepare('SELECT count(*) n FROM usuarios').get().n, 4);
});

test('auth: limite de login retorna 429 e Retry-After sem derivação ilimitada', async (t) => {
  const { app } = await setup(t);
  for (let i = 0; i < 10; i++) await request(app).post('/auth/login').send({}).expect(400);
  const response = await request(app).post('/auth/login').send({ usuario: 'operador', senha }).expect(429);
  assert.ok(Number(response.headers['retry-after']) > 0);
});

test('auth: somente duas derivações de senha simultâneas por processo', async (t) => {
  const { app } = await setup(t);
  const responses = await Promise.all(Array.from({ length: 3 }, () =>
    request(app).post('/auth/login').send({ usuario: 'operador', senha })));
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 200, 429]);
  assert.equal(responses.find((r) => r.status === 429).headers['retry-after'], '1');
  await request(app).post('/auth/login').send({ usuario: 'operador', senha }).expect(200);
});

test('auth: JWT ausente e inválido bloqueiam todas as rotas antes de consultar dados', async (t) => {
  const { app, database } = await setup(t);
  const before = snapshot(database);
  for (const path of ['/eventos', '/eventos/1/portoes', '/eventos/1/portoes/1/ingressos', '/eventos/1/resumo', '/auth/me']) {
    for (const authorization of ['', 'Bearer invalido', 'Basic senha']) {
      await request(app).get(path).set('Authorization', authorization).expect(401).expect('WWW-Authenticate', 'Bearer');
    }
  }
  await request(app).post('/sincronizacao').type('text').send('corpo inválido').expect(401);
  await request(app).post('/auth/instalacoes').send({ dispositivo: 'intruso' }).expect(401);
  assert.deepEqual(snapshot(database), before);
});

test('auth: JWT expirado, assinatura, algoritmo, audience e claims incorretos são recusados', async (t) => {
  const { app } = await setup(t);
  const now = Math.floor(Date.now() / 1000);
  async function signed({ alg = 'HS256', aud = 'passcheck-pwa', sub = '2', exp = now + 60,
    iat = now, ver = 0, key = config.jwtSecret } = {}) {
    return new SignJWT({ ver }).setProtectedHeader({ alg, typ: 'JWT' }).setIssuer('passcheck-backend')
      .setAudience(aud).setSubject(sub).setIssuedAt(iat).setExpirationTime(exp).setJti(randomUUID())
      .sign(Buffer.from(key, 'base64url'));
  }
  for (const options of [{ exp: now - 1, iat: now - 100 }, { key: randomBytes(32).toString('base64url') },
    { alg: 'HS384', key: randomBytes(48).toString('base64url') }, { aud: 'outra-api' }, { sub: '02' }, { ver: '0' },
    { iat: now + 20 }, { exp: now + 7200 }]) {
    const token = await signed(options);
    await request(app).get('/eventos').set('Authorization', `Bearer ${token}`).expect(401);
  }
});

test('auth: operador só lista seu evento; administrador lista todos; sem concessão lista vazia', async (t) => {
  const { get } = await setup(t);
  assert.deepEqual((await get('/eventos').expect(200)).body.map((e) => e.id), [1]);
  assert.deepEqual((await get('/eventos', 3).expect(200)).body.map((e) => e.id), [2]);
  assert.deepEqual((await get('/eventos', 4).expect(200)).body, []);
  assert.equal((await get('/eventos', 1).expect(200)).body.length, 3);
});

test('auth: evento de outro operador, resumo e IDs manipulados não revelam recursos', async (t) => {
  const { get } = await setup(t);
  for (const path of ['/eventos/2/portoes', '/eventos/2/portoes/4/ingressos', '/eventos/2/resumo', '/eventos/999/resumo']) {
    assert.equal((await get(path).expect(403)).body.erro, 'ACESSO_NEGADO');
  }
  await get('/eventos/999/resumo', 1).expect(404);
  await get('/eventos/abc/resumo').expect(400);
});

test('auth: preparação pode baixar todos os portões e os 12 ingressos do evento autorizado', async (t) => {
  const { get } = await setup(t);
  const gates = (await get('/eventos/1/portoes').expect(200)).body;
  assert.deepEqual(gates.map((p) => p.id), [1, 2, 3]);
  const tickets = [];
  for (const gate of gates) tickets.push(...(await get(`/eventos/1/portoes/${gate.id}/ingressos`).expect(200)).body);
  assert.equal(tickets.length, 12);
  const me = (await get('/auth/me').expect(200)).body;
  assert.deepEqual(me, { usuario: { id: 2, usuario: 'operador', papel: 'OPERADOR' }, acessoGlobal: false,
    eventos: [{ eventoId: 1, portoesSincronizacao: [1] }] });
  assert.equal((await get('/auth/me', 1).expect(200)).body.acessoGlobal, true);
});

test('auth: portão não concedido nega sincronização e preserva todos os dados', async (t) => {
  const { database, post } = await setup(t);
  const before = snapshot(database);
  await post('/sincronizacao', payload({ portaoId: 2 })).expect(403);
  await post('/sincronizacao', payload({ eventoId: 2, portaoId: 4 })).expect(403);
  await post('/sincronizacao', payload(), 4).expect(403);
  assert.deepEqual(snapshot(database), before);
  assert.equal(database.prepare('SELECT count(*) n FROM auditoria_divergencias').get().n, 0);
});

test('auth: UUID não autentica; instalação desconhecida, alheia ou revogada não sincroniza', async (t) => {
  const { post, database } = await setup(t);
  const before = snapshot(database);
  await post('/sincronizacao', payload({ dispositivo: 'desconhecido' })).expect(403);
  await post('/sincronizacao', payload({ dispositivo: 'admin-device' })).expect(403);
  await post('/sincronizacao', payload(), 1).expect(403);
  database.prepare("UPDATE instalacoes SET ativo = 0 WHERE dispositivo = 'auth-device'").run();
  await post('/sincronizacao', payload()).expect(403);
  assert.deepEqual(snapshot(database), before);
});

test('auth: registro de instalação exige proprietário, não adota legados nem namespace de seed', async (t) => {
  const { post, database } = await setup(t);
  const body = { dispositivo: randomUUID() };
  assert.deepEqual((await post('/auth/instalacoes', body).expect(200)).body, body);
  await post('/auth/instalacoes', body).expect(200);
  await post('/auth/instalacoes', body, 1).expect(403);
  await post('/auth/instalacoes', { dispositivo: 'seed:frontend:1838a5a' }).expect(400);
  database.prepare(`INSERT INTO recebimentos (dispositivo, id_local, conteudo_normalizado, status, motivo)
    VALUES ('legado', '1', '{}', 'REJEITADA', 'TESTE')`).run();
  await post('/auth/instalacoes', { dispositivo: 'legado' }).expect(403);
  assert.equal(database.prepare("SELECT count(*) n FROM instalacoes WHERE dispositivo = 'legado'").get().n, 0);
  database.prepare('UPDATE instalacoes SET ativo = 0 WHERE dispositivo = ?').run(body.dispositivo);
  await post('/auth/instalacoes', body).expect(403);
});

test('auth: reenvio idempotente autorizado mantém confirmação e acesso alheio não revela recibo', async (t) => {
  const { post, database } = await setup(t);
  const first = (await post('/sincronizacao', payload()).expect(200)).body.resultados[0];
  const replay = (await post('/sincronizacao', payload()).expect(200)).body.resultados[0];
  assert.deepEqual(replay, { idLocal: '17', status: 'JA_PROCESSADA', resultadoOriginal: 'CONFIRMADA', validacaoId: first.validacaoId });
  const before = snapshot(database);
  await post('/sincronizacao', payload(), 3).expect(403);
  await post('/sincronizacao', payload(), 1).expect(403);
  assert.deepEqual(snapshot(database), before);
  assert.equal(database.prepare('SELECT count(*) n FROM auditoria_divergencias').get().n, 0);
});

test('auth: revogação de evento e portão vale imediatamente, inclusive para recibo já confirmado', async (t) => {
  const { post, get, database } = await setup(t);
  await post('/sincronizacao', payload()).expect(200);
  const before = snapshot(database);
  database.exec('DELETE FROM usuarios_portoes WHERE usuario_id = 2');
  await post('/sincronizacao', payload()).expect(403);
  await get('/eventos/1/portoes/2/ingressos').expect(200);
  database.exec('DELETE FROM usuarios_eventos WHERE usuario_id = 2');
  await get('/eventos/1/resumo').expect(403);
  assert.deepEqual(snapshot(database), before);
});

test('auth: logout revoga todos os JWTs e novo login recupera reenvio sem perder dados', async (t) => {
  const { app, post, get, database } = await setup(t);
  await post('/sincronizacao', payload()).expect(200);
  const before = snapshot(database);
  const second = await tokens.emitir({ id: 2, versao_token: 0 });
  await post('/auth/logout', {}).expect(204);
  await get('/eventos').expect(401);
  await request(app).get('/auth/me').set('Authorization', `Bearer ${second}`).expect(401);
  await post('/sincronizacao', payload()).expect(401);
  const login = await request(app).post('/auth/login').send({ usuario: 'operador', senha }).expect(200);
  const replay = await request(app).post('/sincronizacao').set('Authorization', `Bearer ${login.body.accessToken}`).send(payload()).expect(200);
  assert.equal(replay.body.resultados[0].status, 'JA_PROCESSADA');
  assert.deepEqual(snapshot(database), before);
});

test('auth: alteração de ativo, papel ou senha invalida tokens antigos mesmo após reativação', async (t) => {
  const { get, database } = await setup(t);
  database.exec('UPDATE usuarios SET ativo = 0 WHERE id = 2; UPDATE usuarios SET ativo = 1 WHERE id = 2');
  await get('/eventos').expect(401);
  database.prepare("UPDATE usuarios SET papel = 'OPERADOR' WHERE id = 1").run();
  await get('/eventos', 1).expect(401);
  database.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = 3').run('hash-invalido-controlado');
  await get('/eventos', 3).expect(401);
  assert.equal(database.prepare('SELECT versao_token FROM usuarios WHERE id = 2').get().versao_token, 2);
});

test('auth: autorização é reavaliada dentro de cada transação antes de consultar recibos', async (t) => {
  const { database } = await setup(t);
  const identity = createIdentidadeService(createIdentidadeRepository(database), tokens, config);
  const repo = createSincronizacaoRepository(database);
  const transact = repo.transacao;
  let count = 0;
  let receiptsRead = 0;
  const read = repo.buscarRecibo;
  repo.buscarRecibo = (...args) => { receiptsRead++; return read(...args); };
  repo.transacao = (fn) => {
    if (++count === 2) database.exec('DELETE FROM usuarios_portoes WHERE usuario_id = 2');
    return transact(fn);
  };
  const body = payload();
  body.validacoes[0].dataHora = '2026-11-20T22:03:27.000Z';
  body.validacoes.push({ ...body.validacoes[0], idLocal: '18' });
  assert.throws(() => createSincronizacaoService(repo, identity).sincronizar(body, randomUUID(), { id: 2, versao_token: 0 }), { status: 403 });
  assert.equal(receiptsRead, 1);
  assert.equal(database.prepare("SELECT count(*) n FROM recebimentos WHERE dispositivo = 'auth-device'").get().n, 1);
  assert.equal(database.prepare('SELECT count(*) n FROM validacoes WHERE ingresso_id = 1').get().n, 1);
  assert.equal(database.inTransaction, false);
});

test('auth: vínculos compostos, unicidade e identidade da instalação são protegidos pelo SQLite', async (t) => {
  const { database } = await setup(t);
  assert.throws(() => database.exec('INSERT INTO usuarios_portoes VALUES (2, 1, 4)'), /FOREIGN KEY/);
  assert.throws(() => database.exec('INSERT INTO usuarios_portoes VALUES (4, 1, 1)'), /FOREIGN KEY/);
  assert.throws(() => database.exec("UPDATE instalacoes SET usuario_id = 1 WHERE dispositivo = 'auth-device'"), /imutavel/);
  assert.throws(() => database.prepare("INSERT INTO usuarios (usuario, senha_hash, papel) VALUES ('operador', ?, 'OPERADOR')").run(senhaHash), /UNIQUE/);
  assert.deepEqual(database.pragma('foreign_key_check'), []);
  assert.equal(database.pragma('integrity_check', { simple: true }), 'ok');
});

test('auth: CORS permite Authorization apenas para origens configuradas', async (t) => {
  const { app } = await setup(t);
  await request(app).options('/sincronizacao').set('Origin', 'http://localhost:5173')
    .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'authorization,content-type')
    .expect(204).expect('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  await request(app).options('/sincronizacao').set('Origin', 'https://intruso.example')
    .set('Access-Control-Request-Method', 'POST').expect(403);
  await request(app).get('/eventos').set('Origin', 'http://localhost:5173').expect(401);
});

test('auth: bootstrap sem conta fixa, operador explícito e rollback de vínculo inválido', async (t) => {
  const database = memoryDatabase(t);
  assert.equal(database.prepare('SELECT count(*) n FROM usuarios').get().n, 0);
  await provisionar(database, 'bootstrap', { usuario: 'primeiro-admin', senha });
  await assert.rejects(provisionar(database, 'bootstrap', { usuario: 'segundo-admin', senha }), /incompatível/);
  const before = snapshot(database);
  await assert.rejects(provisionar(database, 'criar-operador', { usuario: 'op-invalido', senha,
    eventos: [{ eventoId: 1, portoes: [4] }] }), /FOREIGN KEY/);
  assert.equal(database.prepare('SELECT count(*) n FROM usuarios').get().n, 1);
  const op = await provisionar(database, 'criar-operador', { usuario: 'operador-cli', senha,
    eventos: [{ eventoId: 1, portoes: [1] }] });
  assert.equal(op.papel, 'OPERADOR');
  assert.deepEqual(database.prepare('SELECT usuario_id, evento_id, portao_id FROM usuarios_portoes').all(),
    [{ usuario_id: op.id, evento_id: 1, portao_id: 1 }]);
  assert.deepEqual(snapshot(database), before);
});

test('auth: upgrade 001–003 para 004 preserva dados, auditoria e checksums sem criar contas', (t) => {
  const directory = temporaryDirectory(t);
  for (const name of ['001_modelo_central.sql', '002_integridade_confirmacoes.sql', '003_auditoria_divergencias.sql']) {
    writeFileSync(join(directory, name), readFileSync(new URL('../src/db/migrations/' + name, import.meta.url)));
  }
  const database = openDatabase(':memory:');
  t.after(() => database.close());
  migrate(database, directory);
  database.exec(`INSERT INTO eventos VALUES (1, 'Festival UNIVAG', '2026-11-20', 'Campus UNIVAG');
    INSERT INTO portoes VALUES (1, 1, 'Portão A');
    INSERT INTO ingressos (id, codigo, evento_id, portao_id) VALUES (1, 'PC-A7X9K2', 1, 1);
    INSERT INTO recebimentos (id, dispositivo, id_local, conteudo_normalizado, status)
      VALUES (1, 'legado-upgrade', '17', '{}', 'CONFIRMADA');
    INSERT INTO validacoes (ingresso_id, recebimento_id) VALUES (1, 1)`);
  database.prepare(`INSERT INTO auditoria_divergencias
    (recebimento_id, correlacao_id, motivo, hash_original, hash_apresentado)
    VALUES (1, ?, 'IDEMPOTENCIA_DIVERGENTE', ?, ?)`).run(randomUUID(), 'a'.repeat(64), 'b'.repeat(64));
  const before = snapshot(database);
  const audit = database.prepare('SELECT * FROM auditoria_divergencias').all();
  const history = database.prepare('SELECT * FROM schema_migrations').all();
  assert.deepEqual(migrate(database), { applied: ['004_identidade_acesso.sql'], currentVersion: 4 });
  assert.deepEqual(snapshot(database), before);
  assert.deepEqual(database.prepare('SELECT * FROM auditoria_divergencias').all(), audit);
  assert.deepEqual(database.prepare('SELECT * FROM schema_migrations WHERE version <= 3').all(), history);
  assert.equal(database.prepare('SELECT count(*) n FROM usuarios').get().n, 0);
  assert.deepEqual(database.pragma('foreign_key_check'), []);
  assert.equal(database.pragma('integrity_check', { simple: true }), 'ok');
});
