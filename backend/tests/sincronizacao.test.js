import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import request from './helpers/auth.js';
import { createApp, fixtureIdentity, principal } from './helpers/auth.js';
import { readConfig } from './helpers/config.js';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { createSincronizacaoRepository } from '../src/repositories/sincronizacao.js';
import { createSincronizacaoService } from '../src/services/sincronizacao.js';
import { memoryDatabase, snapshot, temporaryDirectory } from './helpers/database.js';
import { ingressosMock } from '../../frontend/src/mocks/ingressos.js';

function item(id = 1, idLocal = String(id)) {
  const ticket = ingressosMock.find((ticket) => ticket.id === id);
  return { idLocal, ingressoId: id, codigo: ticket.codigo, dataHora: '2026-11-20T22:03:27Z' };
}

function batch(validacoes = [item()], fields = {}) {
  return { eventoId: 1, portaoId: 1, dispositivo: '971b6382-28ad-4f06-9d71-97ef1ada8df0', validacoes, ...fields };
}

function setup(t) {
  const database = memoryDatabase(t);
  const logs = [];
  const app = createApp({ config: readConfig({}), database, logger: { error: (message) => logs.push(message) } });
  const post = (body) => request(app).post('/sincronizacao').set('Content-Type', 'application/json').send(JSON.stringify(body));
  return { database, app, post, logs };
}

function audit(database) {
  return database.prepare('SELECT * FROM auditoria_divergencias ORDER BY id').all();
}

function assertIntegrity(database) {
  assert.deepEqual(database.pragma('foreign_key_check'), []);
  assert.equal(database.pragma('integrity_check', { simple: true }), 'ok');
  assert.equal(database.prepare(`SELECT count(*) AS n FROM ingressos i
    WHERE i.utilizado <> EXISTS(SELECT 1 FROM validacoes v WHERE v.ingresso_id = i.id)`).get().n, 0);
  assert.equal(database.prepare(`SELECT count(*) AS n FROM recebimentos r WHERE
    (r.status = 'CONFIRMADA') <> EXISTS(SELECT 1 FROM validacoes v WHERE v.recebimento_id = r.id)`).get().n, 0);
}

test('T01/T23: confirmação fecha recibo, validação e uso com conteúdo canônico', async (t) => {
  const { database, post } = setup(t);
  const result = (await post(batch()).expect(200)).body;
  assert.deepEqual(result, { resultados: [{ idLocal: '1', status: 'CONFIRMADA', validacaoId: 3 }] });
  const receipt = database.prepare('SELECT * FROM recebimentos WHERE id = 3').get();
  assert.equal(receipt.conteudo_normalizado, '{"eventoId":1,"portaoId":1,"ingressoId":1,"codigo":"PC-A7X9K2","dataHora":"2026-11-20T22:03:27.000Z"}');
  const validation = database.prepare('SELECT * FROM validacoes WHERE id = 3').get();
  assert.equal(validation.recebimento_id, receipt.id);
  assert.equal(validation.data_hora_cliente, '2026-11-20T22:03:27.000Z');
  assert.ok(Math.abs(Date.now() - Date.parse(validation.data_hora_servidor)) < 10000);
  assertIntegrity(database);
});

test('T02: dez reenvios recuperam uma confirmação e o mesmo ID', async (t) => {
  const { database, post } = setup(t);
  await post(batch()).expect(200);
  const before = snapshot(database);
  for (let n = 0; n < 10; n++) {
    const response = await post(batch()).expect(200);
    assert.deepEqual(response.body.resultados, [{ idLocal: '1', status: 'JA_PROCESSADA', resultadoOriginal: 'CONFIRMADA', validacaoId: 3 }]);
  }
  assert.deepEqual(snapshot(database), before);
  assert.deepEqual(audit(database), []);
});

test('T03/T04: normalização recupera original e alterações auditam hashes sem sobrescrever', async (t) => {
  const { database, post } = setup(t);
  await post(batch()).expect(200);
  const before = snapshot(database);
  const response = await post({ validacoes: [{ dataHora: '2026-11-20T22:03:27.000Z', codigo: item().codigo, ingressoId: 1, idLocal: '1' }], dispositivo: batch().dispositivo, portaoId: 1, eventoId: 1 }).expect(200);
  assert.equal(response.body.resultados[0].status, 'JA_PROCESSADA');
  const changes = [batch(undefined, { eventoId: 2 }), batch(undefined, { portaoId: 2 }),
    batch([{ ...item(), ingressoId: 2 }]), batch([{ ...item(), codigo: item(2).codigo }]),
    batch([{ ...item(), dataHora: '2026-11-20T22:03:28Z' }])];
  for (const body of changes) {
    const result = await post(body).expect(200);
    assert.deepEqual(result.body.resultados, [{ idLocal: '1', status: 'REJEITADA', motivo: 'IDEMPOTENCIA_DIVERGENTE' }]);
  }
  const rows = audit(database);
  assert.equal(rows.length, changes.length);
  const original = before.recebimentos.at(-1).conteudo_normalizado;
  for (const [index, row] of rows.entries()) {
    const body = changes[index];
    const value = body.validacoes[0];
    const canonical = JSON.stringify({ eventoId: body.eventoId, portaoId: body.portaoId, ingressoId: value.ingressoId,
      codigo: value.codigo, dataHora: new Date(value.dataHora).toISOString() });
    assert.equal(row.hash_original, createHash('sha256').update(original).digest('hex'));
    assert.equal(row.hash_apresentado, createHash('sha256').update(canonical).digest('hex'));
    assert.equal(row.recebimento_id, 3);
    assert.equal(row.motivo, 'IDEMPOTENCIA_DIVERGENTE');
    assert.match(row.correlacao_id, /^[a-f0-9-]{36}$/);
    assert.ok(Math.abs(Date.now() - Date.parse(row.data_hora_servidor)) < 10000);
    assert.deepEqual(Object.keys(row), ['id', 'recebimento_id', 'correlacao_id', 'motivo', 'hash_original', 'hash_apresentado', 'data_hora_servidor']);
  }
  assert.deepEqual(snapshot(database), before);
  assert.equal((await post(batch()).expect(200)).body.resultados[0].validacaoId, 3);
});

test('T05/T10: nova chave para o mesmo ingresso conflita e lote misto preserva ordem', async (t) => {
  const { database, post } = setup(t);
  const body = batch([item(2, '18'), item(4, '19'), item(6, '20'), item(2, '21')]);
  const expected = [
    { idLocal: '18', status: 'CONFIRMADA', validacaoId: 3 },
    { idLocal: '19', status: 'CONFLITO', motivo: 'INGRESSO_JA_UTILIZADO' },
    { idLocal: '20', status: 'REJEITADA', motivo: 'PORTAO_INCOMPATIVEL' },
    { idLocal: '21', status: 'CONFLITO', motivo: 'INGRESSO_JA_UTILIZADO' },
  ];
  assert.deepEqual((await post(body).expect(200)).body.resultados, expected);
  const before = snapshot(database);
  assert.deepEqual((await post(body).expect(200)).body.resultados,
    expected.map(({ status, ...result }) => ({ ...result, status: 'JA_PROCESSADA', resultadoOriginal: status })));
  assert.deepEqual(snapshot(database), before);
  assertIntegrity(database);
});

test('T08: recursos inexistentes, vínculos e código divergentes geram recibos de rejeição', async (t) => {
  const { database, post } = setup(t);
  const cases = [
    [batch(undefined, { eventoId: 999 }), 'EVENTO_INEXISTENTE'],
    [batch(undefined, { portaoId: 999 }), 'PORTAO_INEXISTENTE'],
    [batch(undefined, { portaoId: 4 }), 'PORTAO_INCOMPATIVEL'],
    [batch([{ ...item(), ingressoId: 999 }]), 'INGRESSO_INEXISTENTE'],
    [batch([{ ...item(), codigo: item(2).codigo }]), 'CODIGO_INCOMPATIVEL'],
    [batch([{ ...item(), codigo: item().codigo.toLowerCase() }]), 'CODIGO_INCOMPATIVEL'],
    [batch([item(13)]), 'EVENTO_INCOMPATIVEL'],
    [batch([item(6)]), 'PORTAO_INCOMPATIVEL'],
  ];
  for (const [index, [body, motivo]] of cases.entries()) {
    body.validacoes[0].idLocal = String(index + 1);
    assert.deepEqual((await post(body).expect(200)).body.resultados, [{ idLocal: String(index + 1), status: 'REJEITADA', motivo }]);
  }
  assert.equal(database.prepare("SELECT count(*) AS n FROM recebimentos WHERE status='REJEITADA'").get().n, cases.length);
  assert.equal(database.prepare('SELECT count(*) AS n FROM validacoes').get().n, 2);
  assertIntegrity(database);
});

test('T09: dois utilizados dos mocks conflitam, preservando os 22 ingressos e seed', async (t) => {
  const { database, post } = setup(t);
  const before = snapshot(database);
  for (const id of [4, 12]) {
    const body = batch([item(id)], { portaoId: id === 4 ? 1 : 3 });
    assert.equal((await post(body).expect(200)).body.resultados[0].status, 'CONFLITO');
  }
  const after = snapshot(database);
  assert.deepEqual(after.ingressos, before.ingressos);
  assert.deepEqual(after.validacoes, before.validacoes);
  assert.deepEqual(after.recebimentos.slice(0, 2), before.recebimentos);
  assert.equal(after.ingressos.length, 22);
});

test('T11: rejeição histórica não é reavaliada após corrigir o cadastro', async (t) => {
  const { database, post } = setup(t);
  const body = batch([item()], { eventoId: 999 });
  await post(body).expect(200);
  database.prepare('INSERT INTO eventos (id,nome,data,local) SELECT 999,nome,data,local FROM eventos WHERE id=1').run();
  const result = (await post(body).expect(200)).body.resultados[0];
  assert.deepEqual(result, { idLocal: '1', status: 'JA_PROCESSADA', resultadoOriginal: 'REJEITADA', motivo: 'EVENTO_INEXISTENTE' });
  assertIntegrity(database);
});

test('T14: falha no segundo item preserva primeiro commit e permite reenvio seguro', async (t) => {
  const { database, post, logs } = setup(t);
  database.exec(`CREATE TEMP TRIGGER teste_falha BEFORE INSERT ON validacoes WHEN NEW.ingresso_id = 2
    BEGIN SELECT RAISE(ABORT, 'falha interna sensível'); END`);
  const body = batch([item(1), item(2), item(3)]);
  const failure = await post(body).expect(500);
  assert.deepEqual(failure.body, { erro: 'ERRO_INTERNO', mensagem: 'Erro interno do servidor.' });
  assert.equal(database.prepare('SELECT count(*) AS n FROM validacoes').get().n, 3);
  assert.equal(database.prepare('SELECT count(*) AS n FROM recebimentos').get().n, 3);
  assert.deepEqual(logs, ['Erro interno ao processar requisição.']);
  database.exec('DROP TRIGGER teste_falha');
  assert.deepEqual((await post(body).expect(200)).body.resultados.map((r) => r.status), ['JA_PROCESSADA', 'CONFIRMADA', 'CONFIRMADA']);
  assertIntegrity(database);
});

test('T15: rollback após recibo, após trigger e antes de commit não deixa gravação parcial', (t) => {
  const database = memoryDatabase(t);
  const before = snapshot(database);
  const body = batch([{ ...item(), dataHora: '2026-11-20T22:03:27.000Z' }]);
  for (const stage of ['recibo', 'validacao', 'commit']) {
    const repository = createSincronizacaoRepository(database);
    if (stage === 'commit') {
      repository.transacao = (callback) => database.transaction(() => { callback(); throw new Error('Falha antes de commit'); }).immediate();
    } else {
      const method = stage === 'recibo' ? 'inserirRecibo' : 'inserirValidacao';
      const original = repository[method];
      repository[method] = (...args) => {
        original(...args);
        if (stage === 'validacao') assert.equal(database.prepare('SELECT utilizado FROM ingressos WHERE id=1').get().utilizado, 1);
        throw new Error('Falha controlada');
      };
    }
    assert.throws(() => createSincronizacaoService(repository, fixtureIdentity(database)).sincronizar(body, randomUUID(), principal), /Falha/);
    assert.deepEqual(snapshot(database), before);
    assert.equal(database.inTransaction, false);
    assertIntegrity(database);
  }
});

test('T18: schema estrito rejeita tipos, extras, duplicação e limites sem gravar', async (t) => {
  const { database, post, logs } = setup(t);
  const before = snapshot(database);
  const cases = [null, [], {}, batch([]), batch([null]), batch([1]), batch(['item']), batch([{}]),
    { ...batch(), extra: true }, batch([{ ...item(), extra: true }]), batch([item(), item()])];
  for (const field of ['eventoId', 'portaoId']) {
    for (const value of ['1', 0, -1, 1.1, Number.MAX_SAFE_INTEGER + 1, null]) cases.push(batch(undefined, { [field]: value }));
  }
  for (const value of ['1', 0, -1, 1.1, Number.MAX_SAFE_INTEGER + 1, null]) cases.push(batch([{ ...item(), ingressoId: value }]));
  for (const value of [1, '', '0', '01', '-1', '+1', '1.0', '1e1', ' 1', '1\n', '9007199254740992']) cases.push(batch([{ ...item(), idLocal: value }]));
  for (const value of ['', 'device space', 'device\n', 'á', 'x'.repeat(129), 'seed:frontend:1838a5a', null]) cases.push(batch(undefined, { dispositivo: value }));
  for (const value of ['', ' x', 'x ', 'x\n', '\u0001', '\u007f', 'x'.repeat(129), null]) cases.push(batch([{ ...item(), codigo: value }]));
  for (const value of cases) await post(value).expect(400);
  assert.deepEqual(snapshot(database), before);
  assert.deepEqual(audit(database), []);
  assert.equal(logs.length, cases.length);
  assert.ok(logs.every((message) => message === 'Requisição rejeitada por formato ou limite inválido.'));
});

test('T19: 100 itens aceitos; 101 e corpo acima de 102400 bytes rejeitados antes de gravar', async (t) => {
  const { database, app, post } = setup(t);
  const items = Array.from({ length: 101 }, (_, index) => item(1, String(index + 1)));
  const before = snapshot(database);
  assert.equal((await post(batch(items)).expect(413)).body.erro, 'LOTE_MUITO_GRANDE');
  const text = JSON.stringify(batch());
  await request(app).post('/sincronizacao').set('Content-Type', 'application/json')
    .send(text + ' '.repeat(102401 - Buffer.byteLength(text))).expect(413);
  assert.deepEqual(snapshot(database), before);
  const boundary = await request(app).post('/sincronizacao').set('Content-Type', 'application/json')
    .send(text + ' '.repeat(102400 - Buffer.byteLength(text))).expect(200);
  assert.equal(boundary.body.resultados[0].status, 'CONFIRMADA');
  const result = (await post(batch(items.slice(0, 100))).expect(200)).body.resultados;
  assert.equal(result.length, 100);
  assert.equal(result[0].status, 'JA_PROCESSADA');
  assert.ok(result.slice(1).every((r) => r.status === 'CONFLITO'));
  assertIntegrity(database);
});

test('T20: datas UTC estritas, normalização e relógios extremos sem precedência', async (t) => {
  const { database, post } = setup(t);
  const invalid = [null, '', '2026-02-29T00:00:00Z', '2026-04-31T00:00:00Z', '2026-11-20T24:00:00Z',
    '2026-11-20T22:00:60Z', '2026-11-20T22:00:00+00:00', '2026-11-20T22:00:00.1Z', '0000-01-01T00:00:00Z',
    '2026-11-20', '2026-13-01T00:00:00Z', '2026-01-00T00:00:00Z', 123];
  for (const dataHora of invalid) await post(batch([{ ...item(), dataHora }])).expect(400);
  const dates = ['0001-01-01T00:00:00Z', '9999-12-31T23:59:59.999Z', '2024-02-29T00:00:00Z'];
  for (const [index, dataHora] of dates.entries()) {
    const response = await post(batch([{ ...item(index + 1), dataHora }])).expect(200);
    assert.equal(response.body.resultados[0].status, 'CONFIRMADA');
  }
  assertIntegrity(database);
});

test('T21/T22: HTTP 400/415/500 e CORS preservam dados e ocultam detalhes', async (t) => {
  const { database, app, post } = setup(t);
  const before = snapshot(database);
  await request(app).post('/sincronizacao').set('Content-Type', 'application/json').send('{"secret":').expect(400);
  for (const type of ['text/plain', 'application/json; charset=utf-16le', 'application/json; charset=iso-8859-1']) {
    const response = await request(app).post('/sincronizacao').set('Content-Type', type).send('{}').expect(415);
    assert.equal(response.body.erro, 'TIPO_DE_CONTEUDO_INVALIDO');
  }
  await request(app).post('/sincronizacao').expect(415);
  await request(app).post('/sincronizacao').set('Content-Type', 'application/json').set('Content-Encoding', 'unknown').send('{}').expect(415);
  await request(app).options('/sincronizacao').set('Origin', 'http://localhost:5173')
    .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'Content-Type')
    .expect(204).expect('Access-Control-Allow-Methods', 'GET,POST').expect('Access-Control-Allow-Origin', 'http://localhost:5173');
  await request(app).options('/sincronizacao').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST').expect(403);
  await request(app).post('/sincronizacao').set('Origin', 'https://evil.example').send(batch()).expect(403);
  await request(app).post('/api/sincronizacao').send(batch()).expect(404);
  assert.deepEqual(snapshot(database), before);
  const result = await post(batch([{ ...item(), codigo: "x'; DROP TABLE ingressos;--" }])).expect(200);
  assert.equal(result.body.resultados[0].motivo, 'CODIGO_INCOMPATIVEL');
  assert.equal(database.prepare('SELECT count(*) AS n FROM ingressos').get().n, 22);
  assertIntegrity(database);
});

test('T23: recibo confirmado órfão falha com 500, sem inventar reconhecimento', async (t) => {
  const { database, post } = setup(t);
  const repository = createSincronizacaoRepository(database);
  repository.inserirRecibo(batch().dispositivo, '1', JSON.stringify({ eventoId: 1, portaoId: 1, ingressoId: 1, codigo: item().codigo, dataHora: '2026-11-20T22:03:27.000Z' }), 'CONFIRMADA', null);
  await post(batch()).expect(500);
  assert.equal(database.prepare('SELECT count(*) AS n FROM validacoes').get().n, 2);
});

test('T24: falha real da auditoria reverte item e não altera recibo/validação originais', async (t) => {
  const { database, post } = setup(t);
  await post(batch()).expect(200);
  const before = snapshot(database);
  database.exec(`CREATE TEMP TRIGGER auditoria_indisponivel BEFORE INSERT ON auditoria_divergencias
    BEGIN SELECT RAISE(ABORT, 'Falha de auditoria'); END`);
  const divergent = batch([item(2, '1')]);
  assert.deepEqual((await post(divergent).expect(500)).body, { erro: 'ERRO_INTERNO', mensagem: 'Erro interno do servidor.' });
  assert.deepEqual(audit(database), []);
  assert.deepEqual(snapshot(database), before);
  database.exec('DROP TRIGGER auditoria_indisponivel');
  assert.equal((await post(divergent).expect(200)).body.resultados[0].motivo, 'IDEMPOTENCIA_DIVERGENTE');
  assert.equal(audit(database).length, 1);
  assert.deepEqual(snapshot(database), before);
  assertIntegrity(database);
});

test('T24: auditoria imutável, FK obrigatória, hashes estritos e correlação por requisição', async (t) => {
  const { database, post } = setup(t);
  await post(batch([item(1), item(2)])).expect(200);
  const divergent = batch([{ ...item(1), dataHora: '2026-11-20T22:03:28Z' }, { ...item(2), dataHora: '2026-11-20T22:03:28Z' }]);
  await post(divergent).expect(200);
  const rows = audit(database);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].correlacao_id, rows[1].correlacao_id);
  const insert = database.prepare(`INSERT INTO auditoria_divergencias
    (recebimento_id, correlacao_id, motivo, hash_original, hash_apresentado) VALUES (?, ?, ?, ?, ?)`);
  assert.throws(() => insert.run(999, randomUUID(), 'IDEMPOTENCIA_DIVERGENTE', 'a'.repeat(64), 'b'.repeat(64)), { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' });
  for (const invalid of ['', 'a'.repeat(63), 'z'.repeat(64)]) {
    assert.throws(() => insert.run(3, randomUUID(), 'IDEMPOTENCIA_DIVERGENTE', invalid, 'b'.repeat(64)), { code: 'SQLITE_CONSTRAINT_CHECK' });
  }
  assert.throws(() => database.exec('UPDATE auditoria_divergencias SET recebimento_id=4'), /AUDITORIA_IMUTAVEL/);
  assert.throws(() => database.exec('DELETE FROM auditoria_divergencias'), /AUDITORIA_IMUTAVEL/);
  assert.throws(() => database.exec("INSERT OR REPLACE INTO auditoria_divergencias SELECT * FROM auditoria_divergencias WHERE id=1"), /AUDITORIA_IMUTAVEL/);
  assert.deepEqual(audit(database), rows);
  await post(divergent).expect(200);
  assert.notEqual(audit(database)[2].correlacao_id, rows[0].correlacao_id);
});

test('migração 003 preserva integralmente modelo 001/002 e dados preexistentes', (t) => {
  const directory = temporaryDirectory(t);
  for (const file of ['001_modelo_central.sql', '002_integridade_confirmacoes.sql']) {
    writeFileSync(join(directory, file), readFileSync(new URL(`../src/db/migrations/${file}`, import.meta.url)));
  }
  const database = openDatabase(':memory:');
  t.after(() => database.close());
  migrate(database, directory);
  database.exec("INSERT INTO eventos VALUES (1, 'Teste', '2026-11-20', 'Campus')");
  const before = snapshot(database);
  const history = database.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
  assert.deepEqual(migrate(database), { applied: ['003_auditoria_divergencias.sql', '004_identidade_acesso.sql'], currentVersion: 4 });
  assert.deepEqual(snapshot(database), before);
  assert.deepEqual(database.prepare('SELECT * FROM schema_migrations WHERE version<3 ORDER BY version').all(), history);
  assert.deepEqual(audit(database), []);
  assertIntegrity(database);
});
