import { testEnvironment } from './helpers/config.js';
import { fixtureIdentity, fixtureToken } from './helpers/auth.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { eventosMock, portoesMock } from '../../frontend/src/mocks/eventos.js';
import { ingressosMock } from '../../frontend/src/mocks/ingressos.js';
import { backendDirectory } from '../src/config.js';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { seedDevelopment } from '../src/db/seeds/development.js';
import { snapshot, temporaryDirectory } from './helpers/database.js';

async function availablePort() {
  const probe = createServer();
  return new Promise((resolvePort, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close((error) => error ? reject(error) : resolvePort(port));
    });
  });
}

async function launchApi(databasePath) {
  const port = await availablePort();
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [resolve(backendDirectory, 'src/server.js')], {
    cwd: backendDirectory,
    env: { ...process.env, ...testEnvironment, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port), DATABASE_PATH: databasePath,
      CORS_ORIGINS: 'http://localhost:5173' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  const ended = new Promise((resolveEnd) => child.once('close', resolveEnd));
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await ended;
  };
  try {
    await new Promise((resolveReady, reject) => {
      const timeout = setTimeout(() => reject(new Error('API não iniciou no prazo do teste.')), 10000);
      let stdout = '';
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
        if (stdout.includes(`PassCheck API em ${url}`)) {
          clearTimeout(timeout);
          resolveReady();
        }
      });
      child.once('error', (error) => { clearTimeout(timeout); reject(error); });
      child.once('exit', () => { clearTimeout(timeout); reject(new Error('API encerrou antes de iniciar.')); });
    });
    assert.equal(stderr, '');
    return { url, pid: child.pid, stop, stderr: () => stderr };
  } catch (error) {
    await stop();
    throw error;
  }
}

test('HTTP real dos três GETs e health permanece correto após reiniciar o processo da API', { timeout: 30000 }, async (t) => {
  const directory = temporaryDirectory(t);
  const databasePath = join(directory, 'leitura.sqlite');
  const database = openDatabase(databasePath);
  let before;
  try {
    migrate(database);
    seedDevelopment(database, 'development');
    fixtureIdentity(database);
    before = snapshot(database);
  } finally {
    database.close();
  }

  let running;
  const processIds = [];
  try {
    for (let cycle = 1; cycle <= 2; cycle++) {
      running = await launchApi(databasePath);
      processIds.push(running.pid);
      const get = async (path) => {
        const response = await fetch(running.url + path, { headers: { Authorization: `Bearer ${fixtureToken}` }, signal: AbortSignal.timeout(5000) });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        return response.json();
      };
      assert.deepEqual(await get('/health'), { status: 'ok', database: 'ok' });
      assert.deepEqual(await get('/eventos'), eventosMock);
      const allTickets = [];
      for (const event of eventosMock) {
        const gates = await get(`/eventos/${event.id}/portoes`);
        assert.deepEqual(gates, portoesMock.filter((gate) => gate.eventoId === event.id));
        for (const gate of gates) {
          const tickets = await get(`/eventos/${event.id}/portoes/${gate.id}/ingressos`);
          assert.deepEqual(tickets, ingressosMock.filter((ticket) => ticket.eventoId === event.id && ticket.portaoId === gate.id));
          allTickets.push(...tickets);
        }
      }
      assert.deepEqual(allTickets.sort((left, right) => left.id - right.id), ingressosMock);
      assert.equal(running.stderr(), '');
      t.diagnostic(`Ciclo ${cycle}: processo ${running.pid}, HTTP 200 em health, eventos, 3 consultas de portões e 6 consultas de ingressos; 22 ingressos conferidos.`);
      await running.stop();
    }
  } finally {
    await running?.stop();
  }
  assert.notEqual(processIds[0], processIds[1]);
  const reopened = openDatabase(databasePath);
  try {
    assert.deepEqual(snapshot(reopened), before);
    assert.deepEqual(reopened.pragma('foreign_key_check'), []);
  } finally {
    reopened.close();
  }
});
