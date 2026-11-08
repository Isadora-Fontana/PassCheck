import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHostingApp } from '../src/hosting.js';
import { provisionar } from '../src/services/provisionamento.js';
import { memoryDatabase, temporaryDirectory } from './helpers/database.js';
import { readConfig } from './helpers/config.js';
import { criarSessao } from '../../frontend/src/sessao.js';

test('cliente real integra login, concessões, leitura, instalação, logout e revogação', async (t) => {
  const database = memoryDatabase(t);
  const senha = 'Teste123!abc';
  await provisionar(database, 'bootstrap', { usuario: 'administrador', senha });
  await provisionar(database, 'criar-operador', { usuario: 'operador', senha, eventos: [{ eventoId: 1, portoes: [1] }] });
  const app = createHostingApp({ config: readConfig(), database });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const base = 'http://127.0.0.1:' + server.address().port + '/api';
  const session = criarSessao({ base });
  await assert.rejects(session.entrar('operador', 'Errada123!'), { status: 401 });
  const me = await session.entrar('operador', senha);
  assert.equal(me.acessoGlobal, false);
  assert.deepEqual(me.eventos, [{ eventoId: 1, portoesSincronizacao: [1] }]);
  const eventos = await session.requisitar('/eventos');
  assert.deepEqual(eventos.map((e) => e.id), [1]);
  const portoes = await session.requisitar('/eventos/1/portoes');
  assert.equal(portoes.length, 3);
  assert(portoes.some((p) => !me.eventos[0].portoesSincronizacao.includes(p.id)));
  const ingressos = await session.requisitar('/eventos/1/portoes/1/ingressos');
  assert(ingressos.length > 0);
  assert(ingressos.every((i) => i.eventoId === 1 && i.portaoId === 1 && typeof i.utilizado === 'boolean'));
  await assert.rejects(session.requisitar('/eventos/2/portoes'), { status: 403 });
  const outraSessao = criarSessao({ base });
  await outraSessao.entrar('operador', senha);
  await session.requisitar('/auth/instalacoes', { method: 'POST', body: { dispositivo: 'integracao-browser' } });
  await session.sair();
  await assert.rejects(outraSessao.requisitar('/eventos'), { status: 401 });
  assert.equal(outraSessao.obterIdentidade(), null);
  await session.entrar('administrador', senha);
  assert.equal((await session.requisitar('/eventos')).length, 3);
  await assert.rejects(session.requisitar('/auth/instalacoes', { method: 'POST', body: { dispositivo: 'integracao-browser' } }), { status: 403 });
});

test('hospedagem entrega PWA e cache correto; API não cai no HTML e arquivos privados não são servidos', async (t) => {
  const directory = temporaryDirectory(t);
  // O helper de limpeza aceita somente arquivos diretos; assets usa arquivo no topo.
  writeFileSync(join(directory, 'index.html'), '<!doctype html><title>PassCheck teste</title>');
  writeFileSync(join(directory, 'sw.js'), '// teste');
  writeFileSync(join(directory, '.env'), 'SEGREDO_FICTICIO=nao-expor');
  const app = createHostingApp({ config: { ...readConfig(), frontendPath: directory }, database: memoryDatabase(t) });
  const { default: request } = await import('supertest');
  await request(app).get('/').expect(200).expect('Cache-Control', 'no-cache').expect('X-Content-Type-Options', 'nosniff');
  await request(app).get('/sw.js').expect(200).expect('Cache-Control', 'no-cache');
  await request(app).get('/.env').expect(404);
  await request(app).get('/api/eventos').expect(401).expect('Content-Type', /json/);
  await request(app).get('/api/inexistente').expect(404).expect('Content-Type', /json/);
  await request(app).get('/api/health').expect(200);
  await request(app).get('/health').expect(200);
});

test('proxy é ignorado por padrão e pode ser habilitado para um único salto restrito', async (t) => {
  const { default: request } = await import('supertest');
  for (const hops of [0, 1]) {
    const app = createHostingApp({ config: readConfig({ TRUST_PROXY_HOPS: String(hops) }), database: memoryDatabase(t), logger: { error() {} } });
    for (let tentativa = 0; tentativa < 10; tentativa++) {
      await request(app).post('/api/auth/login').set('X-Forwarded-For', '198.51.100.1').send({}).expect(400);
    }
    await request(app).post('/api/auth/login').set('X-Forwarded-For', '198.51.100.1').send({}).expect(429);
    await request(app).post('/api/auth/login').set('X-Forwarded-For', '198.51.100.2').send({}).expect(hops ? 400 : 429);
  }
});
