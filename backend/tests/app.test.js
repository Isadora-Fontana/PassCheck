import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { readConfig } from './helpers/config.js';
import { openDatabase } from '../src/db/connection.js';

function setup(t) {
  const database = openDatabase(':memory:');
  t.after(() => { if (database.open) database.close(); });
  const logs = [];
  const app = createApp({
    config: readConfig({}), database,
    logger: { error: (message) => logs.push(message) },
  });
  return { app, database, logs };
}

test('GET /health retorna 200 e verifica uma conexão SQLite real', async (t) => {
  const { app } = setup(t);
  const response = await request(app).get('/health').expect(200).expect('Content-Type', /json/);
  assert.deepEqual(response.body, { status: 'ok', database: 'ok' });
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-powered-by'], undefined);
});

test('rotas fora do escopo continuam ausentes e retornam erro 404 padronizado', async (t) => {
  const { app } = setup(t);
  for (const path of ['/inexistente', '/api/eventos/1/resumo', '/api/eventos', '/admin', '/login']) {
    const response = await request(app).get(path).expect(404);
    assert.deepEqual(response.body, { erro: 'ROTA_NAO_ENCONTRADA', mensagem: 'Rota não encontrada.' });
  }
  await request(app).post('/api/sincronizacao').send({}).expect(404);
  await request(app).post('/eventos').send({}).expect(404);
});

test('origem permitida recebe CORS específico; preflight anuncia GET e POST', async (t) => {
  const { app } = setup(t);
  await request(app).get('/health').set('Origin', 'http://localhost:5173')
    .expect(200).expect('Access-Control-Allow-Origin', 'http://localhost:5173');
  const response = await request(app).options('/health')
    .set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'GET')
    .expect(204).expect('Access-Control-Allow-Methods', 'GET,POST');
  assert.equal(response.headers['access-control-allow-credentials'], undefined);
});

test('origem não permitida ou parecida é rejeitada inclusive no preflight', async (t) => {
  const { app } = setup(t);
  for (const origin of ['http://localhost:5173.evil.example', 'https://other.example', 'null']) {
    const response = await request(app).get('/health').set('Origin', origin).expect(403);
    assert.equal(response.body.erro, 'ORIGEM_NAO_PERMITIDA');
    assert.equal(response.headers['access-control-allow-origin'], undefined);
  }
  await request(app).options('/health').set('Origin', 'https://other.example')
    .set('Access-Control-Request-Method', 'GET').expect(403);
});

test('JSON malformado retorna 400 sem ecoar o corpo', async (t) => {
  const { app } = setup(t);
  const response = await request(app).post('/health').set('Content-Type', 'application/json')
    .send('{"sensitive":"test-secret"').expect(400);
  assert.deepEqual(response.body, { erro: 'JSON_INVALIDO', mensagem: 'Corpo JSON inválido.' });
  assert(!response.text.includes('test-secret'));
});

test('corpo acima de 100 KB retorna 413', async (t) => {
  const { app } = setup(t);
  const response = await request(app).post('/health').send({ content: 'a'.repeat(110 * 1024) }).expect(413);
  assert.equal(response.body.erro, 'CORPO_MUITO_GRANDE');
});

test('falha real do banco retorna 500 genérico, nunca health positivo', async (t) => {
  const { app, database, logs } = setup(t);
  database.close();
  const response = await request(app).get('/health').expect(500);
  assert.deepEqual(response.body, { erro: 'ERRO_INTERNO', mensagem: 'Erro interno do servidor.' });
  assert.deepEqual(logs, ['Erro interno ao processar requisição.']);
});
