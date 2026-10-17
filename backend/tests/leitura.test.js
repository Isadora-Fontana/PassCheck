import assert from 'node:assert/strict';
import test from 'node:test';
import request from './helpers/auth.js';
import { eventosMock, portoesMock } from '../../frontend/src/mocks/eventos.js';
import { ingressosMock } from '../../frontend/src/mocks/ingressos.js';
import { createApp } from './helpers/auth.js';
import { readConfig } from './helpers/config.js';
import { memoryDatabase, snapshot, confirm } from './helpers/database.js';

function setup(t, options) {
  const database = memoryDatabase(t, options);
  const logs = [];
  const app = createApp({ config: readConfig({}), database, logger: { error: (message) => logs.push(message) } });
  return { app, database, logs };
}

function insertEvent(database) {
  database.prepare('INSERT INTO eventos (id, nome, data, local) VALUES (@id, @nome, @data, @local)').run(eventosMock[0]);
}

test('GET /eventos retorna array direto fiel aos mocks, IDs numéricos e datas sem horário', async (t) => {
  const { app } = setup(t);
  const response = await request(app).get('/eventos').expect(200).expect('Content-Type', /json/);
  assert.deepEqual(response.body, eventosMock);
  for (const event of response.body) {
    assert.equal(typeof event.id, 'number');
    assert.match(event.data, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('GET /eventos retorna [] quando o banco migrado não possui eventos', async (t) => {
  const { app } = setup(t, { seed: false });
  const response = await request(app).get('/eventos').expect(200);
  assert.deepEqual(response.body, []);
});

test('leitura consulta o estado atual do SQLite, sem usar mocks ou cache de dados', async (t) => {
  const { app, database } = setup(t);
  database.prepare('UPDATE eventos SET nome = ? WHERE id = ?').run('Evento fictício atualizado no teste', 1);
  const events = await request(app).get('/eventos').expect(200);
  assert.equal(events.body[0].nome, 'Evento fictício atualizado no teste');
  confirm(database, 1);
  const tickets = await request(app).get('/eventos/1/portoes/1/ingressos').expect(200);
  assert.equal(tickets.body.find((ticket) => ticket.id === 1).utilizado, true);
});

test('listagem de portões filtra cada evento e mantém todos os campos do contrato', async (t) => {
  const { app } = setup(t);
  for (const event of eventosMock) {
    const response = await request(app).get(`/eventos/${event.id}/portoes`).expect(200);
    assert.deepEqual(response.body, portoesMock.filter((gate) => gate.eventoId === event.id));
    assert(response.body.every((gate) => typeof gate.id === 'number' && typeof gate.eventoId === 'number'));
  }
});

test('evento inexistente retorna 404 em ambas as consultas subordinadas', async (t) => {
  const { app } = setup(t);
  for (const path of ['/eventos/999/portoes', '/eventos/999/portoes/1/ingressos']) {
    const response = await request(app).get(path).expect(404);
    assert.deepEqual(response.body, { erro: 'EVENTO_NAO_ENCONTRADO', mensagem: 'Evento não encontrado.' });
  }
});

test('IDs inválidos são rejeitados com 400 em todos os parâmetros', async (t) => {
  const { app, database } = setup(t);
  const before = snapshot(database);
  const invalid = ['0', '-1', '1.5', '1abc', 'abc', '1e2', '0x1', '+1', ' 1 ', 'NaN', 'Infinity', '9007199254740992', '1 OR 1=1', "1'; DROP TABLE eventos;--"];
  for (const id of invalid) {
    const encoded = encodeURIComponent(id);
    for (const path of [
      `/eventos/${encoded}/portoes`,
      `/eventos/${encoded}/portoes/1/ingressos`,
      `/eventos/1/portoes/${encoded}/ingressos`,
    ]) {
      const response = await request(app).get(path).expect(400);
      assert.equal(response.body.erro, 'PARAMETRO_INVALIDO');
      assert.deepEqual(Object.keys(response.body).sort(), ['erro', 'mensagem']);
    }
  }
  assert.deepEqual(snapshot(database), before);
});

test('URLs com escape inválido retornam 400 sem expor erro de decodificação', async (t) => {
  const { app } = setup(t);
  for (const path of ['/eventos/%E0%A4%A/portoes', '/eventos/1/portoes/%ZZ/ingressos']) {
    const response = await request(app).get(path).expect(400);
    assert.deepEqual(response.body, { erro: 'PARAMETRO_INVALIDO', mensagem: 'Parâmetro de URL inválido.' });
  }
});

test('zeros à esquerda são normalizados e inteiro seguro inexistente retorna 404', async (t) => {
  const { app } = setup(t);
  const response = await request(app).get('/eventos/01/portoes/01/ingressos').expect(200);
  assert.deepEqual(response.body, ingressosMock.filter((ticket) => ticket.eventoId === 1 && ticket.portaoId === 1));
  await request(app).get('/eventos/9007199254740991/portoes').expect(404);
});

test('evento existente sem portões retorna 200 com []', async (t) => {
  const { app, database } = setup(t, { seed: false });
  insertEvent(database);
  const response = await request(app).get('/eventos/1/portoes').expect(200);
  assert.deepEqual(response.body, []);
});

test('portão inexistente e portão de outro evento retornam o mesmo 404 sem dados', async (t) => {
  const { app } = setup(t);
  for (const path of ['/eventos/1/portoes/999/ingressos', '/eventos/1/portoes/4/ingressos', '/eventos/2/portoes/1/ingressos']) {
    const response = await request(app).get(path).expect(404);
    assert.deepEqual(response.body, { erro: 'PORTAO_NAO_ENCONTRADO', mensagem: 'Portão não encontrado neste evento.' });
  }
});

test('portão existente sem ingressos retorna 200 com []', async (t) => {
  const { app, database } = setup(t, { seed: false });
  insertEvent(database);
  const gate = portoesMock[0];
  database.prepare('INSERT INTO portoes (id, evento_id, nome) VALUES (?, ?, ?)').run(gate.id, gate.eventoId, gate.nome);
  const response = await request(app).get('/eventos/1/portoes/1/ingressos').expect(200);
  assert.deepEqual(response.body, []);
});

test('GET de ingressos inclui utilizados e disponíveis como booleanos, sem campos extras', async (t) => {
  const { app } = setup(t);
  const response = await request(app).get('/eventos/1/portoes/1/ingressos').expect(200);
  assert.equal(response.body.length, 5);
  assert.equal(response.body.find((ticket) => ticket.id === 1).utilizado, false);
  assert.equal(response.body.find((ticket) => ticket.id === 4).utilizado, true);
  for (const ticket of response.body) {
    assert.equal(typeof ticket.utilizado, 'boolean');
    assert.deepEqual(Object.keys(ticket).sort(), ['codigo', 'eventoId', 'id', 'portaoId', 'utilizado']);
    for (const field of ['id', 'eventoId', 'portaoId']) assert.equal(typeof ticket[field], 'number');
  }
});

test('seis consultas recuperam exatamente os 22 ingressos sem vazamento ou duplicação', async (t) => {
  const { app, database } = setup(t);
  const before = snapshot(database);
  const combined = [];
  for (const gate of portoesMock) {
    const response = await request(app).get(`/eventos/${gate.eventoId}/portoes/${gate.id}/ingressos`).expect(200);
    assert.deepEqual(response.body, ingressosMock.filter((ticket) => ticket.eventoId === gate.eventoId && ticket.portaoId === gate.id));
    combined.push(...response.body);
  }
  assert.equal(combined.length, 22);
  assert.equal(new Set(combined.map((ticket) => ticket.id)).size, 22);
  assert.equal(new Set(combined.map((ticket) => ticket.codigo)).size, 22);
  assert.deepEqual(combined.sort((left, right) => left.id - right.id), ingressosMock);
  assert.deepEqual(combined.filter((ticket) => ticket.utilizado).map((ticket) => ticket.id), [4, 12]);
  assert.deepEqual(snapshot(database), before);
});

test('queries adicionais não permitem alterar o escopo definido pelo caminho', async (t) => {
  const { app } = setup(t);
  const response = await request(app).get('/eventos/1/portoes/1/ingressos?eventoId=2&portaoId=4&utilizado=0').expect(200);
  assert.deepEqual(response.body, ingressosMock.filter((ticket) => ticket.eventoId === 1 && ticket.portaoId === 1));
});

test('novas rotas preservam CORS e no-store', async (t) => {
  const { app } = setup(t);
  for (const path of ['/eventos', '/eventos/1/portoes', '/eventos/1/portoes/1/ingressos']) {
    await request(app).get(path).set('Origin', 'http://localhost:5173')
      .expect(200).expect('Access-Control-Allow-Origin', 'http://localhost:5173').expect('Cache-Control', 'no-store');
    const denied = await request(app).get(path).set('Origin', 'https://other.example').expect(403);
    assert.equal(denied.body.erro, 'ORIGEM_NAO_PERMITIDA');
  }
});

test('falhas SQL nas leituras passam pelo middleware central e não expõem detalhes', async (t) => {
  const { app, database, logs } = setup(t);
  // Exclusivamente na conexão isolada deste teste; simula indisponibilidade.
  database.close();
  for (const path of ['/eventos', '/eventos/1/portoes', '/eventos/1/portoes/1/ingressos']) {
    const response = await request(app).get(path).expect(500);
    assert.deepEqual(response.body, { erro: 'ERRO_INTERNO', mensagem: 'Erro interno do servidor.' });
  }
  assert.equal(logs.length, 3);
});
