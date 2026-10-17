import assert from 'node:assert/strict';
import test from 'node:test';
import { readConfig } from './helpers/config.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { backendDirectory } from '../src/config.js';
import { startServer } from '../src/server.js';

const execute = promisify(execFile);
const testConfig = () => ({ ...readConfig({ DATABASE_PATH: ':memory:' }), port: 0 });

test('servidor inicia em porta livre, responde HTTP e encerra o banco', async (t) => {
  const running = await startServer(testConfig());
  t.after(() => running.close());
  const response = await fetch(`http://127.0.0.1:${running.server.address().port}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', database: 'ok' });
  await running.close();
  assert.equal(running.server.listening, false);
  assert.equal(running.database.open, false);
});

test('porta ocupada causa falha de inicialização e preserva o servidor existente', async (t) => {
  const running = await startServer(testConfig());
  t.after(() => running.close());
  await assert.rejects(
    startServer({ ...testConfig(), port: running.server.address().port }),
    { code: 'EADDRINUSE' },
  );
  const response = await fetch(`http://127.0.0.1:${running.server.address().port}/health`);
  assert.equal(response.status, 200);
});

test('processo falha antes de abrir banco ou porta quando ambiente é inválido', async () => {
  await assert.rejects(execute(process.execPath, [resolve(backendDirectory, 'src/server.js')], {
    cwd: backendDirectory,
    env: { ...process.env, PORT: 'invalid-private-value', DATABASE_PATH: ':memory:', NODE_ENV: 'test' },
    timeout: 10000,
  }), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /Configuração inválida.*PORT/);
    assert(!error.stderr.includes('invalid-private-value'));
    assert.equal(error.stdout, '');
    return true;
  });
});
