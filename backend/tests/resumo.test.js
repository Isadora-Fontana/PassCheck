import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import request from './helpers/auth.js';
import { createApp } from './helpers/auth.js';
import { readConfig } from './helpers/config.js';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { seedDevelopment } from '../src/db/seeds/development.js';
import { createEventosService } from '../src/services/eventos.js';
import { memoryDatabase, receipt, snapshot, temporaryDirectory, confirm } from './helpers/database.js';
import { eventosMock, portoesMock } from '../../frontend/src/mocks/eventos.js';
import { ingressosMock } from '../../frontend/src/mocks/ingressos.js';

function setup(t, options) {
  const database = memoryDatabase(t, options);
  const logs = [];
  const app = createApp({ config: readConfig({}), database, logger: { error: (message) => logs.push(message) } });
  const get = (id = 1) => request(app).get(`/eventos/${id}/resumo`);
  const post = (body) => request(app).post('/sincronizacao').send(body).expect(200);
  return { database, app, get, post, logs };
}

function item(id, idLocal = String(id), dataHora = '2026-11-20T22:03:27Z') {
  return { idLocal, ingressoId: id, codigo: ingressosMock.find((ticket) => ticket.id === id).codigo, dataHora };
}

function batch(items, fields = {}) {
  return { eventoId: 1, portaoId: 1, dispositivo: 'resumo-device-A', validacoes: items, ...fields };
}

function assertCounts(summary, total, entries, byGate) {
  assert.equal(summary.totalIngressos, total);
  assert.equal(summary.entradas, entries);
  assert.equal(summary.restantes, total - entries);
  assert.deepEqual(summary.portoes.map((gate) => gate.entradas), byGate);
  assert.ok(summary.entradas <= summary.totalIngressos && summary.restantes >= 0);
  assert.equal(summary.portoes.reduce((sum, gate) => sum + gate.entradas, 0), summary.entradas);
}

test('resumo: três eventos reais, valores iniciais dos mocks e portões sem entradas', async (t) => {
  const { get, database } = setup(t);
  const before = snapshot(database);
  for (const event of eventosMock) {
    const response = await get(event.id).expect(200).expect('Cache-Control', 'no-store').expect('Content-Type', /json/);
    const tickets = ingressosMock.filter((ticket) => ticket.eventoId === event.id);
    assert.deepEqual(response.body, {
      evento: event.nome,
      totalIngressos: tickets.length,
      entradas: tickets.filter((ticket) => ticket.utilizado).length,
      restantes: tickets.filter((ticket) => !ticket.utilizado).length,
      portoes: portoesMock.filter((gate) => gate.eventoId === event.id)
        .map((gate) => ({ id: gate.id, nome: gate.nome, entradas: tickets.filter((ticket) => ticket.portaoId === gate.id && ticket.utilizado).length })),
    });
  }
  assert.deepEqual(snapshot(database), before);
  assert.deepEqual(database.pragma('foreign_key_check'), []);
});

test('resumo: confirmações 4 e 12 mantêm origem sintética e horário de leitura desconhecido', async (t) => {
  const { get, database } = setup(t);
  const rows = database.prepare(`SELECT v.ingresso_id, v.data_hora_cliente, r.dispositivo
    FROM validacoes v JOIN recebimentos r ON r.id = v.recebimento_id ORDER BY v.ingresso_id`).all();
  assert.deepEqual(rows, [4, 12].map((id) => ({ ingresso_id: id, data_hora_cliente: null, dispositivo: 'seed:frontend:1838a5a' })));
  assertCounts((await get().expect(200)).body, 12, 2, [1, 0, 1]);
  assert.deepEqual(database.prepare(`SELECT v.ingresso_id, v.data_hora_cliente, r.dispositivo
    FROM validacoes v JOIN recebimentos r ON r.id = v.recebimento_id ORDER BY v.ingresso_id`).all(), rows);
});

test('resumo: evento inexistente retorna 404 e ID inválido retorna 400', async (t) => {
  const { get } = setup(t);
  for (const id of [999, Number.MAX_SAFE_INTEGER]) {
    assert.deepEqual((await get(id).expect(404)).body, { erro: 'EVENTO_NAO_ENCONTRADO', mensagem: 'Evento não encontrado.' });
  }
  for (const id of ['0', '-1', '1.1', 'abc', '1e0', '+1', '9007199254740992', '1%0A', '%201', '1%20', "1%27OR%201=1"]) {
    assert.equal((await get(id).expect(400)).body.erro, 'PARAMETRO_INVALIDO');
  }
  assertCounts((await get('001').expect(200)).body, 12, 2, [1, 0, 1]);
});

test('resumo: evento sem ingressos preserva portões; evento sem portões devolve array vazio', async (t) => {
  const { database, get } = setup(t, { seed: false });
  const event = eventosMock[0];
  database.prepare('INSERT INTO eventos (id,nome,data,local) VALUES (?,?,?,?)').run(event.id, event.nome, event.data, event.local);
  assert.deepEqual((await get().expect(200)).body, { evento: event.nome, totalIngressos: 0, entradas: 0, restantes: 0, portoes: [] });
  database.prepare('INSERT INTO portoes (id,evento_id,nome) VALUES (?,?,?)').run(1, 1, 'Portão A');
  assert.deepEqual((await get().expect(200)).body, { evento: event.nome, totalIngressos: 0, entradas: 0, restantes: 0,
    portoes: [{ id: 1, nome: 'Portão A', entradas: 0 }] });
});

test('resumo: nome e cadastros vêm do banco, sem dependência dos mocks em runtime', async (t) => {
  const { database, get } = setup(t);
  database.prepare('UPDATE eventos SET nome=? WHERE id=?').run('Festival atualizado', 1);
  database.prepare('INSERT INTO portoes (id,evento_id,nome) VALUES (?,?,?)').run(99, 1, 'Portão de teste vazio');
  const result = (await get().expect(200)).body;
  assert.equal(result.evento, 'Festival atualizado');
  assertCounts(result, 12, 2, [1, 0, 1, 0]);
  assert.deepEqual(result.portoes.at(-1), { id: 99, nome: 'Portão de teste vazio', entradas: 0 });
});

test('resumo: confirmação incrementa uma entrada; reenvio, conflito e rejeição não incrementam', async (t) => {
  const { database, get, post } = setup(t);
  const body = batch([item(1)]);
  assert.equal((await post(body)).body.resultados[0].status, 'CONFIRMADA');
  const expected = (await get().expect(200)).body;
  assertCounts(expected, 12, 3, [2, 0, 1]);
  assert.equal((await post(body)).body.resultados[0].status, 'JA_PROCESSADA');
  assert.deepEqual((await get().expect(200)).body, expected);
  assert.equal((await post({ ...body, dispositivo: 'resumo-device-B' })).body.resultados[0].status, 'CONFLITO');
  assert.deepEqual((await get().expect(200)).body, expected);
  const invalid = batch([{ ...item(2), ingressoId: 999 }]);
  assert.equal((await post(invalid)).body.resultados[0].status, 'REJEITADA');
  assert.deepEqual((await get().expect(200)).body, expected);
  assert.equal((await post(batch([item(2, '1')]))).body.resultados[0].motivo, 'IDEMPOTENCIA_DIVERGENTE');
  assert.deepEqual((await get().expect(200)).body, expected);
  assert.deepEqual(database.pragma('foreign_key_check'), []);
  assert.equal(database.pragma('integrity_check', { simple: true }), 'ok');
});

test('resumo: lote parcialmente confirmado conta só confirmações e não vaza entre eventos', async (t) => {
  const { get, post } = setup(t);
  const other = (await get(2).expect(200)).body;
  const body = batch([item(2), item(4), item(6)]);
  assert.deepEqual((await post(body)).body.resultados.map((result) => result.status), ['CONFIRMADA', 'CONFLITO', 'REJEITADA']);
  assertCounts((await get().expect(200)).body, 12, 3, [2, 0, 1]);
  await post(body);
  assertCounts((await get().expect(200)).body, 12, 3, [2, 0, 1]);
  assert.deepEqual((await get(2).expect(200)).body, other);
  await post(batch([item(13)], { eventoId: 2, portaoId: 4 }));
  assertCounts((await get(2).expect(200)).body, 6, 1, [1, 0]);
  assertCounts((await get().expect(200)).body, 12, 3, [2, 0, 1]);
});

test('resumo: horários válidos antigos e futuros não filtram confirmações', async (t) => {
  const { get, post } = setup(t);
  await post(batch([item(1, '1', '0001-01-01T00:00:00Z'), item(2, '2', '9999-12-31T23:59:59.999Z')]));
  assertCounts((await get().expect(200)).body, 12, 4, [3, 0, 1]);
});

test('resumo: evento totalmente confirmado tem entradas iguais ao total e restantes zero', async (t) => {
  const { get, post } = setup(t);
  for (const gate of portoesMock.filter((gate) => gate.eventoId === 1)) {
    const items = ingressosMock.filter((ticket) => ticket.portaoId === gate.id && !ticket.utilizado).map((ticket) => item(ticket.id));
    await post(batch(items, { portaoId: gate.id }));
  }
  assertCounts((await get().expect(200)).body, 12, 12, [5, 4, 3]);
});

test('resumo: recibo CONFIRMADA isolado não conta como validação nem é alterado', async (t) => {
  const { get, database } = setup(t);
  receipt(database);
  const before = snapshot(database);
  assertCounts((await get().expect(200)).body, 12, 2, [1, 0, 1]);
  assert.deepEqual(snapshot(database), before);
});

test('resumo: falha técnica no meio do lote conta somente commits anteriores', async (t) => {
  const { get, app, database } = setup(t);
  database.exec(`CREATE TEMP TRIGGER falha_resumo BEFORE INSERT ON validacoes WHEN NEW.ingresso_id=2
    BEGIN SELECT RAISE(ABORT, 'Falha controlada'); END`);
  await request(app).post('/sincronizacao').send(batch([item(1), item(2), item(3)])).expect(500);
  assertCounts((await get().expect(200)).body, 12, 3, [2, 0, 1]);
  assert.equal(database.prepare('SELECT count(*) n FROM validacoes').get().n, 3);
  assert.deepEqual(database.pragma('foreign_key_check'), []);
});

test('resumo: contagens inconsistentes geram erro sem limitar artificialmente valores', () => {
  const base = { evento: 'Teste', totalIngressos: 1, entradas: 1, portoes: [{ id: 1, nome: 'A', entradas: 1 }] };
  const bad = [
    { ...base, entradas: 2 }, { ...base, totalIngressos: -1 }, { ...base, entradas: 0 },
    { ...base, totalIngressos: Number.MAX_SAFE_INTEGER + 1 },
    { ...base, portoes: [{ id: 1, nome: 'A', entradas: -1 }] },
  ];
  for (const result of bad) {
    const before = structuredClone(result);
    const service = createEventosService({ obterResumo: () => result });
    assert.throws(() => service.obterResumo(1), { status: 500, code: 'INDICADORES_INCONSISTENTES' });
    assert.deepEqual(result, before);
  }
});

test('resumo: inconsistência de vínculo é registrada, retorna 500 e preserva dados', async (t) => {
  const { get, database, logs } = setup(t);
  // Corrupção controlada somente no banco isolado: portão com confirmação passa a outro evento.
  database.pragma('foreign_keys = OFF');
  database.prepare('UPDATE portoes SET evento_id=2 WHERE id=1').run();
  database.pragma('foreign_keys = ON');
  const before = snapshot(database);
  assert.ok(database.pragma('foreign_key_check').length > 0);
  const response = await get().expect(500).expect('Cache-Control', 'no-store');
  assert.deepEqual(response.body, { erro: 'INDICADORES_INCONSISTENTES', mensagem: 'Não foi possível obter indicadores consistentes.' });
  assert.deepEqual(logs, ['INDICADORES_INCONSISTENTES: resumo não emitido; dados preservados.']);
  assert.deepEqual(snapshot(database), before);
});

test('resumo: CORS, erro SQL centralizado, métodos e prefixo preservados', async (t) => {
  const { app, database, logs } = setup(t);
  await request(app).get('/eventos/1/resumo').set('Origin', 'http://localhost:5173')
    .expect(200).expect('Access-Control-Allow-Origin', 'http://localhost:5173').expect('Cache-Control', 'no-store');
  await request(app).get('/eventos/1/resumo').set('Origin', 'https://evil.example').expect(403);
  await request(app).get('/api/eventos/1/resumo').expect(404);
  await request(app).post('/eventos/1/resumo').send({}).expect(404);
  database.exec('ALTER TABLE validacoes RENAME TO validacoes_indisponiveis');
  assert.deepEqual((await request(app).get('/eventos/1/resumo').expect(500)).body,
    { erro: 'ERRO_INTERNO', mensagem: 'Erro interno do servidor.' });
  assert.deepEqual(logs, ['Erro interno ao processar requisição.']);
});

test('resumo: conexão independente não enxerga escrita sem commit e rollback não altera totais', async (t) => {
  const path = join(temporaryDirectory(t), 'resumo-isolamento.sqlite');
  const writer = openDatabase(path);
  let reader;
  try {
    migrate(writer); seedDevelopment(writer, 'development');
    reader = openDatabase(path);
    const app = createApp({ config: readConfig({}), database: reader });
    writer.exec('BEGIN IMMEDIATE');
    confirm(writer, 1);
    assertCounts((await request(app).get('/eventos/1/resumo').expect(200)).body, 12, 2, [1, 0, 1]);
    writer.exec('ROLLBACK');
    assertCounts((await request(app).get('/eventos/1/resumo').expect(200)).body, 12, 2, [1, 0, 1]);
    confirm(writer, 1);
    assertCounts((await request(app).get('/eventos/1/resumo').expect(200)).body, 12, 3, [2, 0, 1]);
    assert.deepEqual(writer.pragma('foreign_key_check'), []);
    assert.equal(writer.pragma('integrity_check', { simple: true }), 'ok');
  } finally {
    if (writer.inTransaction) writer.exec('ROLLBACK');
    reader?.close(); writer.close();
  }
});
