import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { createVercelHandler, vercelClientIp } from '../src/vercel.js';

const environment = () => ({ VERCEL: '1', NODE_ENV: 'production', DATABASE_ENGINE: 'postgres',
  DATABASE_URL: 'postgresql://runtime:test-only@db.example.invalid/postgres',
  JWT_SECRET: randomBytes(32).toString('base64url'), CORS_ORIGINS: 'https://passcheck.example' });
const logger = { error() {} };

test('Vercel: inicialização concorrente compartilha pool e preserva /api e query string', async () => {
  let opens = 0, ready = 0, attached = 0;
  const pool = {};
  const handler = createVercelHandler({ environment: environment(), logger,
    open: async (config, options) => {
      opens++; assert.equal(config.ssl.rejectUnauthorized, true); assert.equal(config.idleTimeoutMillis, 5000);
      options.onPool(pool); await new Promise((resolve) => setImmediate(resolve)); return { close() { assert.fail('pool encerrado por request'); } };
    }, attachPool: (received) => { attached++; assert.equal(received, pool); }, ready: async () => { ready++; },
    apiFactory: ({ config, loginIp }) => {
      assert.equal(config.trustProxyHops, 0);
      const app = express(); app.get('/probe', (req, res) => res.json({ ip: loginIp(req), value: req.query.value })); return app;
    },
  });
  const results = await Promise.all(Array.from({ length: 4 }, () => request(handler).get('/api/probe?value=ok')
    .set('x-vercel-forwarded-for', '192.0.2.1').set('x-forwarded-for', '198.51.100.10')));
  for (const response of results) { assert.equal(response.status, 200); assert.deepEqual(response.body, { ip: '192.0.2.1', value: 'ok' }); }
  assert.equal(opens, 1); assert.equal(ready, 1); assert.equal(attached, 1);
  assert.equal((await request(handler).get('/probe')).status, 404);
});

test('Vercel: recusa SQLite, TLS inseguro e contexto não hospedado antes de abrir banco', async () => {
  for (const changes of [{ DATABASE_ENGINE: 'sqlite' }, { VERCEL: '' }, { NODE_ENV: 'development' }, { PG_SSL_MODE: 'require' }]) {
    const handler = createVercelHandler({ environment: { ...environment(), ...changes }, logger,
      open() { assert.fail('banco não deveria abrir'); } });
    const response = await request(handler).get('/api/health');
    assert.equal(response.status, 503); assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['retry-after'], '5'); assert.ok(!response.text.includes('test-only'));
  }
});

test('Vercel: readiness falho encerra pool e próxima requisição pode inicializar novamente', async () => {
  let opens = 0, closes = 0;
  const handler = createVercelHandler({ environment: environment(), logger,
    open: async () => { opens++; return { close: async () => { closes++; } }; }, attachPool() {},
    ready: async () => { if (opens === 1) throw new Error('private SQL details'); },
    apiFactory: () => { const app = express(); app.get('/health', (_req, res) => res.sendStatus(200)); return app; },
  });
  const first = await request(handler).get('/api/health'); assert.equal(first.status, 503); assert.ok(!first.text.includes('private'));
  assert.equal((await request(handler).get('/api/health')).status, 200);
  assert.equal(opens, 2); assert.equal(closes, 1);
});

test('Vercel: IP ausente ou lista adulterada não é aceito como identidade do cliente', () => {
  for (const value of [undefined, '', '192.0.2.1, 192.0.2.2', 'not-an-ip', 'fe80::1%eth0']) assert.throws(() => vercelClientIp({ get: () => value }));
});
