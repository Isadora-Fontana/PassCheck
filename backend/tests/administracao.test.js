import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { createTokens } from '../src/services/tokens.js';
import { createAdministracaoService } from '../src/services/administracao.js';
import { createAdministracaoRepository } from '../src/repositories/administracao.js';
import { fixtureIdentity, fixtureToken, principal } from './helpers/auth.js';
import { readConfig } from './helpers/config.js';
import { memoryDatabase, snapshot, temporaryDirectory } from './helpers/database.js';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';

const config = readConfig();
const operatorToken = await createTokens(config).emitir({ id: 2, versao_token: 0 });
const secondAdminToken = await createTokens(config).emitir({ id: 3, versao_token: 0 });
const header = 'codigo,eventoId,portaoId\n';
const event = { nome: 'Encontro acadêmico', data: '2026-11-21', local: 'Auditório' };
const decision = { justificativa: 'Duplicidade revisada; mantida a confirmação original.' };

function setup(t) {
  const database = memoryDatabase(t);
  const identity = fixtureIdentity(database);
  database.exec(`INSERT INTO usuarios (id, usuario, senha_hash, papel)
    SELECT 2, 'operador-admin-test', senha_hash, 'OPERADOR' FROM usuarios WHERE id=1;
    INSERT INTO usuarios (id, usuario, senha_hash, papel)
    SELECT 3, 'segundo-admin-test', senha_hash, 'ADMINISTRADOR' FROM usuarios WHERE id=1;
    INSERT INTO usuarios_eventos VALUES (2, 1);
    INSERT INTO usuarios_portoes VALUES (2, 1, 1)`);
  const logs = [];
  const app = createApp({ config, database, logger: { error: (message) => logs.push(message) } });
  const call = (method, path, token = fixtureToken) => request(app)[method](path).set('Authorization', `Bearer ${token}`);
  const csv = (text, eventoId = 1) => call('post', `/eventos/${eventoId}/ingressos/importar`).set('Content-Type', 'text/csv; charset=utf-8').send(text);
  const sync = (idLocal, ingressoId = 4, fields = {}) => {
    const codigo = database.prepare('SELECT codigo FROM ingressos WHERE id = ?').get(ingressoId)?.codigo ?? 'INEXISTENTE';
    return call('post', '/sincronizacao').send({ eventoId: 1, portaoId: 1, dispositivo: 'device-A',
      validacoes: [{ idLocal, ingressoId, codigo, dataHora: '2026-11-20T22:03:27Z' }], ...fields });
  };
  const receiptId = (idLocal) => database.prepare("SELECT id FROM recebimentos WHERE dispositivo='device-A' AND id_local=?").get(idLocal).id;
  return { database, app, logs, call, csv, sync, receiptId, identity };
}

function integrity(database) {
  assert.deepEqual(database.pragma('foreign_key_check'), []);
  assert.equal(database.pragma('integrity_check', { simple: true }), 'ok');
}

test('admin: seis endpoints negam anônimo e operador antes do corpo ou dos recursos', async (t) => {
  const { app, call, database } = setup(t);
  const before = snapshot(database);
  for (const [method, path] of [['post', '/eventos'], ['patch', '/eventos/1'], ['post', '/eventos/1/portoes'],
    ['post', '/eventos/1/ingressos/importar'], ['get', '/eventos/1/pendencias'], ['post', '/pendencias/1/resolver']]) {
    await request(app)[method](path).set('Content-Type', 'application/json').send('{invalido').expect(401);
    await call(method, path, operatorToken).set('Content-Type', 'application/json').send('{invalido').expect(403);
  }
  assert.deepEqual(snapshot(database), before);
  assert.equal(database.prepare('SELECT count(*) n FROM resolucoes_administrativas').get().n, 0);
});

test('admin: revogação é verificada novamente dentro da transação de escrita', async (t) => {
  const { database, identity } = setup(t);
  const repository = createAdministracaoRepository(database);
  const original = repository.transacao;
  repository.transacao = (fn) => {
    database.exec('UPDATE usuarios SET ativo = 0 WHERE id = 1');
    return original(fn);
  };
  const before = snapshot(database);
  await assert.rejects(() => createAdministracaoService(repository, identity).criarEvento(principal, event), { status: 401 });
  assert.deepEqual(snapshot(database), before);
});

test('admin: cadastra evento com ID numérico e mantém o formato do GET', async (t) => {
  const { call, database } = setup(t);
  const created = await call('post', '/eventos').send({ ...event, nome: '  Encontro acadêmico  ' }).expect(201);
  assert.deepEqual(created.body, { id: 4, ...event });
  assert.equal(created.headers['cache-control'], 'no-store');
  assert.deepEqual((await call('get', '/eventos').expect(200)).body.at(-1), created.body);
  assert.equal(database.prepare('SELECT count(*) n FROM ingressos').get().n, 22);
  assert.deepEqual((await call('get', '/eventos', operatorToken).expect(200)).body.map((row) => row.id), [1]);
});

test('admin: Zod recusa datas irreais, nomes vazios, tipos, controles e campos desconhecidos', async (t) => {
  const { call, database } = setup(t);
  const before = snapshot(database);
  for (const body of [{ ...event, nome: '  ' }, { ...event, nome: 'a'.repeat(201) }, { ...event, local: '' },
    { ...event, local: 'a'.repeat(301) }, { ...event, data: '2026-02-29' }, { ...event, data: '2026-04-31' },
    { ...event, data: '0000-01-01' }, { ...event, data: '2026-11-21T00:00:00Z' }, { ...event, nome: 1 },
    { ...event, local: 'a\u0000b' }, { ...event, id: 123 }, { ...event, data: null }]) {
    await call('post', '/eventos').send(body).expect(400);
  }
  assert.deepEqual(snapshot(database), before);
  await call('post', '/eventos').send({ ...event, data: '2028-02-29' }).expect(201);
});

test('admin: PATCH parcial preserva IDs, ingressos e confirmações existentes', async (t) => {
  const { call, database } = setup(t);
  const before = snapshot(database);
  const summary = (await call('get', '/eventos/1/resumo')).body;
  const changed = await call('patch', '/eventos/1').send({ local: 'Auditório atualizado', data: '2026-11-21' }).expect(200);
  assert.deepEqual(changed.body, { ...before.eventos[0], local: 'Auditório atualizado', data: '2026-11-21' });
  const expected = { ...before, eventos: before.eventos.map((e) => e.id === 1 ? changed.body : e) };
  assert.deepEqual(snapshot(database), expected);
  assert.deepEqual((await call('get', '/eventos/1/resumo')).body, summary);
  for (const body of [{}, { id: 2 }, { utilizado: false }, { data: '2026-02-30' }, { nome: null }]) {
    await call('patch', '/eventos/1').send(body).expect(400);
  }
  await call('patch', '/eventos/999').send({ nome: 'Ausente' }).expect(404);
  integrity(database);
});

test('admin: cria portão somente em evento existente sem aceitar mudança de vínculo pelo corpo', async (t) => {
  const { call, database } = setup(t);
  const gate = await call('post', '/eventos/1/portoes').send({ nome: '  Portão adicional  ' }).expect(201);
  assert.deepEqual(gate.body, { id: 7, eventoId: 1, nome: 'Portão adicional' });
  await call('post', '/eventos/999/portoes').send({ nome: 'Ausente' }).expect(404);
  await call('post', '/eventos/1/portoes').send({ nome: 'X', eventoId: 2 }).expect(400);
  await call('post', '/eventos/1/portoes').send({ nome: ' ' }).expect(400);
  assert.equal((await call('get', '/eventos/1/portoes', operatorToken)).body.length, 4);
  assert.equal(database.prepare('SELECT count(*) n FROM portoes').get().n, 7);
});

test('admin: IDs inválidos, JSON/mídia e CORS PATCH seguem o tratamento central', async (t) => {
  const { call, app } = setup(t);
  for (const id of ['0', '-1', 'abc', '1.5', '9007199254740992', '1%0A']) {
    await call('patch', `/eventos/${id}`).send({ nome: 'Teste' }).expect(400);
    await call('post', `/pendencias/${id}/resolver`).send(decision).expect(400);
  }
  await call('post', '/eventos').type('text').send('{}').expect(415);
  await call('post', '/eventos').type('json').send('{invalido').expect(400);
  await call('post', '/eventos').send({ nome: 'a'.repeat(102401) }).expect(413);
  await request(app).options('/eventos/1').set('Origin', 'http://localhost:5173')
    .set('Access-Control-Request-Method', 'PATCH').expect(204).expect('Access-Control-Allow-Methods', 'GET,POST,PATCH');
  await call('patch', '/eventos/1').set('Origin', 'https://intruso.example').send({ nome: 'Outro' }).expect(403);
  for (const path of ['/eventos/1', '/eventos/1/portoes/1', '/eventos/1/ingressos/1']) await call('delete', path).expect(404);
});

test('CSV: importa integralmente e cria ingressos disponíveis sem afetar confirmações', async (t) => {
  const { csv, database, call } = setup(t);
  const before = snapshot(database);
  const response = await csv(header + 'CSV-001,1,1\nCSV-002,1,2\n').expect(201);
  assert.deepEqual(response.body, { eventoId: 1, importados: 2 });
  assert.deepEqual(database.prepare("SELECT codigo, evento_id, portao_id, utilizado FROM ingressos WHERE codigo LIKE 'CSV-%' ORDER BY id").all(),
    [{ codigo: 'CSV-001', evento_id: 1, portao_id: 1, utilizado: 0 }, { codigo: 'CSV-002', evento_id: 1, portao_id: 2, utilizado: 0 }]);
  assert.deepEqual(snapshot(database).validacoes, before.validacoes);
  const summary = (await call('get', '/eventos/1/resumo')).body;
  assert.equal(summary.totalIngressos, 14); assert.equal(summary.entradas, 2);
  integrity(database);
});

test('CSV: aceita UTF-8, BOM, CRLF, aspas escapadas e preserva caixa literal', async (t) => {
  const { csv, database } = setup(t);
  await csv('\uFEFFcodigo,eventoId,portaoId\r\n"QR,á","1","1"\r\n"QR""aspas",1,1\r\nabc,1,1\r\nABC,1,1').expect(201);
  assert.deepEqual(database.prepare('SELECT codigo FROM ingressos WHERE id > 22 ORDER BY id').all().map((r) => r.codigo),
    ['QR,á', 'QR"aspas', 'abc', 'ABC']);
});

test('CSV: vazio, cabeçalho e UTF-8 inválidos não importam', async (t) => {
  const { csv, database } = setup(t);
  const before = snapshot(database);
  for (const text of ['', header, 'codigo;eventoId;portaoId\nX;1;1', 'eventoId,codigo,portaoId\n1,X,1',
    'codigo,eventoId,portaoId,utilizado\nX,1,1,1', ' codigo,eventoId,portaoId\nX,1,1']) await csv(text).expect(400);
  const invalid = Buffer.concat([Buffer.from(header), Buffer.from([0xc3, 0x28]), Buffer.from(',1,1')]);
  assert.equal((await csv(invalid).expect(400)).body.erro, 'CSV_CODIFICACAO_INVALIDA');
  assert.deepEqual(snapshot(database), before);
});

test('CSV: exige mídia UTF-8 não comprimida e evento existente', async (t) => {
  const { csv, call, database } = setup(t);
  const before = snapshot(database);
  for (const type of ['application/json', 'multipart/form-data', 'text/plain', 'text/csv; charset=iso-8859-1']) {
    await call('post', '/eventos/1/ingressos/importar').set('Content-Type', type).send('abc').expect(415);
  }
  await call('post', '/eventos/1/ingressos/importar').set('Content-Type', 'text/csv')
    .set('Content-Encoding', 'gzip').send('abc').expect(415);
  await csv(header + 'NOVO,999,1', 999).expect(404);
  assert.deepEqual(snapshot(database), before);
});

test('CSV: informa todas as linhas inválidas e motivos sem ecoar códigos', async (t) => {
  const { csv, database } = setup(t);
  const before = snapshot(database);
  const response = await csv(header + 'UNICO,1,1\nDUP,1,1\nDUP,1,1\nOUTRO,2,4\nZERO,01,0\nINSEGURO,9007199254740992,1\nFALTA,1\n"aberta,1,1\n').expect(422);
  assert.deepEqual(response.body.linhas.map((r) => r.linha), [3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(response.body.linhas[0].motivos, ['CODIGO_DUPLICADO_NO_ARQUIVO']);
  assert.deepEqual(response.body.linhas[2].motivos, ['EVENTO_INCOMPATIVEL', 'PORTAO_INCOMPATIVEL']);
  assert.ok(!response.text.includes('UNICO') && !response.text.includes('INSEGURO'));
  assert.deepEqual(snapshot(database), before);
});

test('CSV: rejeita linhas vazias, colunas extras, controles e aspas malformadas', async (t) => {
  const { csv, database } = setup(t);
  const before = snapshot(database);
  for (const line of [' X,1,1', 'X ,1,1', ',1,1', 'X\u0000,1,1', 'a'.repeat(129) + ',1,1',
    'X,1,1,0', '"X"resto,1,1', 'X"Y,1,1', '"linha\nsegunda",1,1', 'X,1,1\r', 'X,1,1\n\n']) {
    await csv(header + line).expect(422);
  }
  assert.deepEqual(snapshot(database), before);
});

test('CSV: duplicidades globais disponíveis ou confirmadas rejeitam todo o arquivo sem sobrescrita', async (t) => {
  const { csv, database } = setup(t);
  const before = snapshot(database);
  for (const id of [1, 4, 12, 13]) {
    const ticket = database.prepare('SELECT codigo FROM ingressos WHERE id = ?').get(id);
    const response = await csv(header + `NAO-IMPORTAR,1,1\n${ticket.codigo},1,1`).expect(422);
    assert.deepEqual(response.body.linhas, [{ linha: 3, motivos: ['CODIGO_JA_CADASTRADO'] }]);
  }
  assert.deepEqual(snapshot(database), before);
  integrity(database);
});

test('CSV: aceita 1000 registros, rejeita 1001 ou mais de 102400 bytes', async (t) => {
  const { csv, database } = setup(t);
  const rows = Array.from({ length: 1000 }, (_, i) => `LIMITE-${i},1,1`);
  await csv(header + [...rows, 'EXTRA,1,1'].join('\n')).expect(413);
  await csv(header + 'a'.repeat(102401)).expect(413);
  assert.equal(database.prepare('SELECT count(*) n FROM ingressos').get().n, 22);
  assert.equal((await csv(header + rows.join('\n')).expect(201)).body.importados, 1000);
  integrity(database);
});

test('CSV: falha real após primeira inserção reverte o lote inteiro', async (t) => {
  const { csv, database, logs } = setup(t);
  database.exec(`CREATE TRIGGER teste_importacao BEFORE INSERT ON ingressos
    WHEN NEW.codigo = 'FALHA-2' BEGIN SELECT RAISE(ABORT, 'falha SQL controlada'); END`);
  const before = snapshot(database);
  const response = await csv(header + 'FALHA-1,1,1\nFALHA-2,1,1').expect(500);
  assert.deepEqual(response.body, { erro: 'ERRO_INTERNO', mensagem: 'Erro interno do servidor.' });
  assert.deepEqual(snapshot(database), before);
  assert.deepEqual(logs, ['Erro interno ao processar requisição.']);
  assert.equal(database.inTransaction, false);
  database.exec('DROP TRIGGER teste_importacao');
  await csv(header + 'FALHA-1,1,1\nFALHA-2,1,1').expect(201);
  integrity(database);
  t.diagnostic('CSV: falha na segunda inserção, zero ingressos do lote persistidos; repetição após remover falha importou 2.');
});

test('pendências: lista conflitos e rejeições pelo evento declarado, sem QR ou confirmações', async (t) => {
  const { call, sync, database } = setup(t);
  await sync('17').expect(200);
  await sync('18', 999).expect(200);
  await sync('19', 999, { eventoId: 2, portaoId: 4 }).expect(200);
  const listed = (await call('get', '/eventos/1/pendencias').expect(200)).body;
  assert.equal(listed.pendencias.length, 2);
  assert.deepEqual(listed.pendencias.map((p) => p.statusOriginal), ['CONFLITO', 'REJEITADA']);
  assert.ok(listed.pendencias.every((p) => p.eventoId === 1 && p.resolucao === null && p.statusAdministrativo === 'PENDENTE'));
  assert.ok(!JSON.stringify(listed).includes('codigo'));
  assert.equal((await call('get', '/eventos/2/pendencias')).body.pendencias.length, 1);
  assert.deepEqual((await call('get', '/eventos/3/pendencias')).body, { pendencias: [], proximoCursor: null });
  await call('get', '/eventos/999/pendencias').expect(404);
  assert.equal(database.prepare('SELECT count(*) n FROM validacoes').get().n, 2);
});

test('pendências: paginação por cursor e filtros estritos sem repetição ou vazamento', async (t) => {
  const { call, sync } = setup(t);
  for (const id of ['17', '18', '19']) await sync(id, 999).expect(200);
  const ids = [];
  let cursor = 0;
  do {
    const response = (await call('get', `/eventos/1/pendencias?estado=TODAS&limite=1&apos=${cursor}`).expect(200)).body;
    ids.push(response.pendencias[0].recebimentoId);
    cursor = response.proximoCursor;
  } while (cursor !== null);
  assert.equal(new Set(ids).size, 3);
  for (const query of ['estado=errado', 'limite=0', 'limite=101', 'apos=-1', 'apos=9007199254740992', 'limite=1&limite=2', 'extra=1']) {
    await call('get', `/eventos/1/pendencias?${query}`).expect(400);
  }
});

test('resolução: registra administrador autenticado, justificativa e horário do servidor', async (t) => {
  const { call, sync, receiptId, database } = setup(t);
  await sync('17').expect(200);
  const id = receiptId('17');
  const before = snapshot(database);
  const start = Date.now();
  const resolved = await call('post', `/pendencias/${id}/resolver`, secondAdminToken).send(decision).expect(201);
  assert.equal(resolved.body.statusOriginal, 'CONFLITO');
  assert.equal(resolved.body.statusAdministrativo, 'RESOLVIDA');
  assert.equal(resolved.body.resolucao.administradorId, 3);
  assert.equal(resolved.body.resolucao.justificativa, decision.justificativa);
  assert.ok(Date.parse(resolved.body.resolucao.dataHora) >= start && Date.parse(resolved.body.resolucao.dataHora) <= Date.now());
  assert.equal((await call('get', '/eventos/1/pendencias')).body.pendencias.length, 0);
  const listed = (await call('get', '/eventos/1/pendencias?estado=RESOLVIDA')).body.pendencias[0];
  assert.deepEqual(listed.resolucao, resolved.body.resolucao);
  assert.deepEqual(snapshot(database), before);
  t.diagnostic(`Auditoria: ${JSON.stringify(resolved.body)}`);
});

test('resolução: rejeita corpo vazio, justificativa inválida e tentativa de falsificar administrador/horário', async (t) => {
  const { call, sync, receiptId, database } = setup(t);
  await sync('17').expect(200);
  for (const body of [{}, { justificativa: 'curta' }, { justificativa: 'a'.repeat(1001) },
    { justificativa: 'texto com\nquebra' }, { ...decision, administradorId: 3 }, { ...decision, dataHora: '2020-01-01T00:00:00Z' }]) {
    await call('post', `/pendencias/${receiptId('17')}/resolver`).send(body).expect(400);
  }
  assert.equal(database.prepare('SELECT count(*) n FROM resolucoes_administrativas').get().n, 0);
});

test('resolução: inexistente, confirmação e duplicada retornam 404/409 sem reescrever decisão', async (t) => {
  const { call, sync, receiptId, database } = setup(t);
  await call('post', '/pendencias/999/resolver').send(decision).expect(404);
  assert.equal((await call('post', '/pendencias/1/resolver').send(decision).expect(409)).body.erro, 'RECIBO_NAO_RESOLVIVEL');
  await sync('17', 999).expect(200);
  const id = receiptId('17');
  await call('post', `/pendencias/${id}/resolver`).send(decision).expect(201);
  const before = database.prepare('SELECT * FROM resolucoes_administrativas').all();
  for (const body of [decision, { justificativa: 'Tentativa de alterar decisão anterior.' }]) {
    assert.equal((await call('post', `/pendencias/${id}/resolver`).send(body).expect(409)).body.erro, 'PENDENCIA_JA_RESOLVIDA');
  }
  assert.deepEqual(database.prepare('SELECT * FROM resolucoes_administrativas').all(), before);
});

test('resolução: dashboard e reenvio continuam baseados no resultado original', async (t) => {
  const { call, sync, receiptId, database } = setup(t);
  const summary = (await call('get', '/eventos/1/resumo')).body;
  for (const [local, ticket] of [['17', 4], ['18', 999]]) {
    const original = (await sync(local, ticket).expect(200)).body.resultados[0];
    await call('post', `/pendencias/${receiptId(local)}/resolver`).send(decision).expect(201);
    const replay = (await sync(local, ticket).expect(200)).body.resultados[0];
    assert.deepEqual(replay, { idLocal: local, status: 'JA_PROCESSADA', resultadoOriginal: original.status, motivo: original.motivo });
  }
  assert.deepEqual((await call('get', '/eventos/1/resumo')).body, summary);
  assert.equal(database.prepare('SELECT count(*) n FROM validacoes').get().n, 2);
  integrity(database);
});

test('resolução: imutável inclusive REPLACE, sem adulterar recibos ou validações', async (t) => {
  const { call, sync, receiptId, database } = setup(t);
  await sync('17').expect(200);
  await call('post', `/pendencias/${receiptId('17')}/resolver`).send(decision).expect(201);
  const row = database.prepare('SELECT * FROM resolucoes_administrativas').get();
  const before = snapshot(database);
  assert.throws(() => database.exec('DELETE FROM resolucoes_administrativas'), /RESOLUCAO_IMUTAVEL/);
  assert.throws(() => database.exec("UPDATE resolucoes_administrativas SET justificativa = 'Reescrever histórico'"), /RESOLUCAO_IMUTAVEL/);
  assert.throws(() => database.prepare(`INSERT OR REPLACE INTO resolucoes_administrativas (recebimento_id, administrador_id, justificativa)
    VALUES (?, 1, ?)`).run(row.recebimento_id, decision.justificativa), /RESOLUCAO_IMUTAVEL/);
  assert.throws(() => database.exec('DELETE FROM recebimentos'), /RECIBO_IMUTAVEL/);
  assert.throws(() => database.exec('UPDATE validacoes SET data_hora_cliente = NULL'), /CONFIRMACAO_IMUTAVEL/);
  assert.deepEqual(snapshot(database), before);
  assert.deepEqual(database.prepare('SELECT * FROM resolucoes_administrativas').get(), row);
  integrity(database);
});

test('resolução: banco exige recibo elegível, administrador ativo e referências válidas', async (t) => {
  const { sync, receiptId, database } = setup(t);
  await sync('17').expect(200);
  const insert = database.prepare('INSERT INTO resolucoes_administrativas (recebimento_id, administrador_id, justificativa) VALUES (?, ?, ?)');
  for (const [recibo, admin] of [[1, 1], [999, 1], [receiptId('17'), 999], [receiptId('17'), 2]]) {
    assert.throws(() => insert.run(recibo, admin, decision.justificativa), /RESOLUCAO_NAO_PERMITIDA/);
  }
  database.exec('UPDATE usuarios SET ativo = 0 WHERE id = 3');
  assert.throws(() => insert.run(receiptId('17'), 3, decision.justificativa), /RESOLUCAO_NAO_PERMITIDA/);
  assert.equal(database.prepare('SELECT count(*) n FROM resolucoes_administrativas').get().n, 0);
  integrity(database);
});

test('resolução: falha de auditoria reverte a decisão e permite nova tentativa', async (t) => {
  const { call, sync, receiptId, database } = setup(t);
  await sync('17').expect(200);
  const before = snapshot(database);
  database.exec("CREATE TRIGGER teste_auditoria AFTER INSERT ON resolucoes_administrativas BEGIN SELECT RAISE(ABORT, 'Falha depois da insercao'); END");
  await call('post', `/pendencias/${receiptId('17')}/resolver`).send(decision).expect(500);
  assert.equal(database.prepare('SELECT count(*) n FROM resolucoes_administrativas').get().n, 0);
  assert.deepEqual(snapshot(database), before);
  database.exec('DROP TRIGGER teste_auditoria');
  await call('post', `/pendencias/${receiptId('17')}/resolver`).send(decision).expect(201);
  integrity(database);
});

test('admin: banco ocupado produz 503 sem confirmação falsa', async (t) => {
  const { database, identity } = setup(t);
  const repository = createAdministracaoRepository(database);
  repository.transacao = () => { throw Object.assign(new Error('detalhe interno'), { code: 'SQLITE_BUSY' }); };
  const before = snapshot(database);
  await assert.rejects(() => createAdministracaoService(repository, identity).criarEvento(principal, event), { status: 503, code: 'BANCO_INDISPONIVEL' });
  assert.deepEqual(snapshot(database), before);
});

test('migração 005: upgrade preserva modelo anterior, usuários, permissões e histórico', (t) => {
  const directory = temporaryDirectory(t);
  for (const file of ['001_modelo_central.sql', '002_integridade_confirmacoes.sql', '003_auditoria_divergencias.sql', '004_identidade_acesso.sql']) {
    writeFileSync(join(directory, file), readFileSync(new URL(`../src/db/migrations/${file}`, import.meta.url)));
  }
  const database = openDatabase(':memory:');
  t.after(() => database.close());
  migrate(database, directory); fixtureIdentity(database);
  database.exec(`INSERT INTO eventos VALUES (1, 'Festival UNIVAG', '2026-11-20', 'Campus UNIVAG');
    INSERT INTO usuarios_eventos VALUES (1, 1);
    INSERT INTO recebimentos (dispositivo, id_local, conteudo_normalizado, status, motivo)
      VALUES ('device-A', '17', '{"eventoId":1}', 'REJEITADA', 'INGRESSO_INEXISTENTE')`);
  const before = snapshot(database);
  const users = database.prepare('SELECT * FROM usuarios').all();
  const history = database.prepare('SELECT * FROM schema_migrations').all();
  assert.deepEqual(migrate(database), { applied: ['005_resolucoes_administrativas.sql'], currentVersion: 5 });
  assert.deepEqual(snapshot(database), before);
  assert.deepEqual(database.prepare('SELECT * FROM usuarios').all(), users);
  assert.deepEqual(database.prepare('SELECT * FROM schema_migrations WHERE version <= 4').all(), history);
  assert.deepEqual(database.prepare('SELECT * FROM usuarios_eventos').all(), [{ usuario_id: 1, evento_id: 1 }]);
  assert.equal(database.prepare('SELECT count(*) n FROM resolucoes_administrativas').get().n, 0);
  integrity(database);
});
