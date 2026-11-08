import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { createLoginLimit, normalizeLoginIp, loginLimitKey } from '../src/services/login-limit.js';
import { limitarLogin } from '../src/middleware/autenticacao.js';
import { errorHandler } from '../src/middleware/errors.js';

test('limite de login: IPv4 mapeado e endereços IPv6 da mesma /64 compartilham chave', () => {
  const secret = randomBytes(32).toString('base64url');
  for (const ip of ['192.0.2.1', '::ffff:192.0.2.1', '::FFFF:c000:0201']) {
    assert.equal(normalizeLoginIp(ip), '192.0.2.1');
    assert.equal(loginLimitKey(ip, secret), loginLimitKey('192.0.2.1', secret));
  }
  assert.equal(normalizeLoginIp('2001:0DB8:0001:0002::1'), normalizeLoginIp('2001:db8:1:2:ffff:ffff:ffff:ffff'));
  assert.notEqual(normalizeLoginIp('2001:db8:1:2::1'), normalizeLoginIp('2001:db8:1:3::1'));
  assert.equal(normalizeLoginIp('spoof,192.0.2.1'), 'unknown');
  assert.equal(normalizeLoginIp(undefined), 'unknown');
  assert.equal(normalizeLoginIp('fe80::1%eth0'), 'unknown');
  assert.match(loginLimitKey('192.0.2.1', secret), /^[a-f0-9]{64}$/);
  assert.notEqual(loginLimitKey('192.0.2.1', secret), loginLimitKey('192.0.2.1', randomBytes(32).toString('base64url')));
});

test('limite SQLite conserva dez tentativas por janela e isola outra origem', async () => {
  const consume = createLoginLimit({ dialect: 'sqlite' }, randomBytes(32).toString('base64url'));
  for (let i = 0; i < 10; i++) assert.equal((await consume('192.0.2.1')).allowed, true);
  const denied = await consume('::ffff:192.0.2.1');
  assert.equal(denied.allowed, false); assert.ok(denied.retryAfter > 0 && denied.retryAfter <= 900);
  assert.equal((await consume('192.0.2.2')).allowed, true);
});

test('limite de login falha fechado quando PostgreSQL está indisponível', async () => {
  const app = express();
  const database = { dialect: 'postgres', schema: 'test', async transaction() { throw new Error('sensitive database detail'); } };
  app.post('/login', limitarLogin({ database, secret: randomBytes(32).toString('base64url') }), (_req, res) => res.sendStatus(204));
  app.use(errorHandler({ error() {} }));
  const response = await request(app).post('/login');
  assert.equal(response.status, 503); assert.equal(response.headers['retry-after'], '1');
  assert.equal(response.body.erro, 'BANCO_INDISPONIVEL');
  assert.ok(!response.text.includes('sensitive'));
});
