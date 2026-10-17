import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { backendDirectory } from '../src/config.js';
import { readConfig, testEnvironment } from './helpers/config.js';
import { temporaryDirectory, snapshot } from './helpers/database.js';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { seedDevelopment } from '../src/db/seeds/development.js';
import { startServer } from '../src/server.js';

function cli(path, command, body) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [resolve(backendDirectory, 'src/auth-cli.js'), command], {
      cwd: backendDirectory, env: { ...process.env, ...testEnvironment, NODE_ENV: 'test', DATABASE_PATH: path },
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolveResult({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(body));
  });
}

test('auth HTTP real: CLI, login, permissões, reenvio e revogação persistem após reiniciar', { timeout: 30000 }, async (t) => {
  const path = join(temporaryDirectory(t), 'auth-http.sqlite');
  const database = openDatabase(path);
  migrate(database); seedDevelopment(database, 'development');
  const senha = randomBytes(24).toString('base64url');
  let running;
  try {
    const boot = await cli(path, 'bootstrap', { usuario: 'admin-http', senha });
    assert.equal(boot.code, 0); assert.equal(boot.stderr, '');
    assert.ok(!boot.stdout.includes(senha));
    const duplicate = await cli(path, 'bootstrap', { usuario: 'outro-admin', senha });
    assert.equal(duplicate.code, 1);
    assert.ok(!duplicate.stderr.includes(senha));
    const op = await cli(path, 'criar-operador', { usuario: 'operador-http', senha,
      eventos: [{ eventoId: 1, portoes: [1] }] });
    assert.equal(op.code, 0); assert.equal(op.stderr, '');
    const logs = [];
    const config = { ...readConfig({ NODE_ENV: 'test', DATABASE_PATH: path }), port: 0 };
    const start = async () => startServer(config, { logger: { error: (message) => logs.push(message) } });
    running = await start();
    let url = `http://127.0.0.1:${running.server.address().port}`;
    const http = async (method, route, body, token, expected = 200) => {
      const response = await fetch(url + route, { method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
      assert.equal(response.status, expected);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      return response.status === 204 ? null : response.json();
    };
    await http('GET', '/health');
    await http('GET', '/eventos', null, null, 401);
    const login = await http('POST', '/auth/login', { usuario: 'operador-http', senha });
    const token = login.accessToken;
    await http('POST', '/auth/instalacoes', { dispositivo: 'http-auth-install' }, token);
    assert.equal((await http('GET', '/eventos', null, token)).length, 1);
    assert.equal((await http('GET', '/eventos/1/portoes/2/ingressos', null, token)).length, 4);
    const payload = { eventoId: 1, portaoId: 1, dispositivo: 'http-auth-install', validacoes: [
      { idLocal: '17', ingressoId: 1, codigo: 'PC-A7X9K2', dataHora: '2026-11-20T22:03:27Z' },
    ] };
    const confirmed = await http('POST', '/sincronizacao', payload, token);
    assert.equal(confirmed.resultados[0].status, 'CONFIRMADA');
    const before = snapshot(database);
    const denied = await http('POST', '/sincronizacao', { ...payload, portaoId: 2 }, token, 403);
    assert.deepEqual(snapshot(database), before);
    await running.close();
    running = await start(); url = `http://127.0.0.1:${running.server.address().port}`;
    const replay = await http('POST', '/sincronizacao', payload, token);
    assert.equal(replay.resultados[0].status, 'JA_PROCESSADA');
    await http('POST', '/auth/logout', null, token, 204);
    await running.close();
    running = await start(); url = `http://127.0.0.1:${running.server.address().port}`;
    await http('POST', '/sincronizacao', payload, token, 401);
    const renewed = await http('POST', '/auth/login', { usuario: 'operador-http', senha });
    assert.deepEqual(await http('POST', '/sincronizacao', payload, renewed.accessToken), replay);
    assert.deepEqual(snapshot(database), before);
    assert.deepEqual(database.pragma('foreign_key_check'), []);
    assert.equal(database.pragma('integrity_check', { simple: true }), 'ok');
    assert.deepEqual(logs, []);
    t.diagnostic(`HTTP real ${url}: login 200 (JWT omitido), GET sem token 401, portão sem permissão 403 ${JSON.stringify(denied)}; confirmação ${JSON.stringify(confirmed)}; após dois reinícios e novo login ${JSON.stringify(replay)}; integridade ok.`);
  } finally { await running?.close(); database.close(); }
});

test('auth: processo sem JWT_SECRET falha antes de abrir banco ou HTTP', async (t) => {
  const path = join(temporaryDirectory(t), 'must-not-open.sqlite');
  const { existsSync } = await import('node:fs');
  const result = await new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [resolve(backendDirectory, 'src/server.js')], {
      cwd: backendDirectory, env: { ...process.env, JWT_SECRET: '', NODE_ENV: 'test', DATABASE_PATH: path },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolveResult({ code, stdout, stderr }));
  });
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /JWT_SECRET/);
  assert.equal(existsSync(path), false);
});
