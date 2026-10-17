import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { seedDevelopment } from '../src/db/seeds/development.js';
import { snapshot, temporaryDirectory } from './helpers/database.js';

function payload(device = 'device-A', changes = {}) {
  return { eventoId: 1, portaoId: 1, dispositivo: device,
    validacoes: [{ idLocal: '17', ingressoId: 1, codigo: 'PC-A7X9K2', dataHora: '2026-11-20T22:03:27Z', ...changes }] };
}

function nextMessage(child, type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error(`Processo não respondeu: ${type}`)), 12000);
    const onMessage = (message) => { if (message.type === type) done(null, message); };
    const onExit = () => done(new Error('Processo encerrou antes da resposta.'));
    function done(error, value) {
      clearTimeout(timer);
      child.off('message', onMessage); child.off('exit', onExit); child.off('error', done);
      if (error) reject(error); else resolve(value);
    }
    child.on('message', onMessage); child.once('exit', onExit); child.once('error', done);
  });
}

async function worker(mode, databasePath) {
  const child = fork(new URL('./helpers/sync-worker.mjs', import.meta.url), [mode, databasePath], {
    execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true,
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.stdout.resume();
  const ended = new Promise((resolve) => child.once('close', resolve));
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      if (child.connected) child.send('close');
      const timeout = setTimeout(() => child.kill(), 3000);
      try { await ended; } finally { clearTimeout(timeout); }
    } else await ended;
  };
  try {
    const info = await nextMessage(child, 'ready');
    return { ...info, stop, stderr: () => stderr, command(command, response) {
      const pending = nextMessage(child, response);
      child.send(command);
      return pending;
    } };
  } catch (error) { await stop(); throw error; }
}

function fixture(t) {
  const directory = temporaryDirectory(t);
  const path = join(directory, 'sincronizacao.sqlite');
  const database = openDatabase(path);
  migrate(database);
  seedDevelopment(database, 'development');
  return { path, database };
}

async function post(api, body, expected = 200) {
  const response = await fetch(api.url + '/sincronizacao', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.token}` }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });
  assert.equal(response.status, expected);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return { body: await response.json(), retryAfter: response.headers.get('retry-after') };
}

async function compete(t, firstBody, secondBody) {
  const { path, database } = fixture(t);
  const workers = [];
  try {
    workers.push(await worker('api', path));
    workers.push(await worker('api', path));
    workers.push(await worker('lock', path));
    const [first, second, lock] = workers;
    assert.notEqual(first.pid, second.pid);
    await lock.command('lock', 'locked');
    const requests = Promise.all([post(first, firstBody), post(second, secondBody)]);
    await delay(250);
    assert.equal(database.prepare('SELECT count(*) AS n FROM validacoes').get().n, 2);
    await lock.command('release', 'released');
    const results = (await requests).map((r) => r.body.resultados[0]);
    assert.equal(database.prepare('SELECT count(*) AS n FROM validacoes WHERE ingresso_id=1').get().n, 1);
    assert.deepEqual(database.pragma('foreign_key_check'), []);
    for (const child of workers) assert.equal(child.stderr(), '');
    t.diagnostic(`Processos independentes ${first.pid}/${second.pid}, barreira de escrita ${lock.pid}: ${JSON.stringify(results)}`);
    return { results, receipts: database.prepare("SELECT * FROM recebimentos WHERE dispositivo NOT LIKE 'seed:%'").all(),
      audits: database.prepare('SELECT * FROM auditoria_divergencias').all() };
  } finally {
    await Promise.all(workers.map((child) => child.stop()));
    database.close();
  }
}

test('T06: dois processos HTTP disputam ingresso; uma confirmação e um conflito', { timeout: 30000 }, async (t) => {
  const { results, receipts } = await compete(t, payload(), payload('device-B', { dataHora: '2000-01-01T00:00:00Z' }));
  assert.deepEqual(results.map((r) => r.status).sort(), ['CONFIRMADA', 'CONFLITO']);
  assert.equal(receipts.length, 2);
  assert.equal(results.find((r) => r.status === 'CONFLITO').motivo, 'INGRESSO_JA_UTILIZADO');
});

test('T07: mesma chave/conteúdo concorrente recupera confirmação única', { timeout: 30000 }, async (t) => {
  const { results, receipts, audits } = await compete(t, payload(), payload());
  assert.deepEqual(results.map((r) => r.status).sort(), ['CONFIRMADA', 'JA_PROCESSADA']);
  assert.equal(results[0].validacaoId, results[1].validacaoId);
  assert.equal(receipts.length, 1);
  assert.equal(audits.length, 0);
});

test('T07: mesma chave com conteúdo divergente concorrente preserva vencedor e audita', { timeout: 30000 }, async (t) => {
  const { results, receipts, audits } = await compete(t, payload(), payload('device-A', { dataHora: '2000-01-01T00:00:00Z' }));
  assert.deepEqual(results.map((r) => r.status).sort(), ['CONFIRMADA', 'REJEITADA']);
  assert.equal(results.find((r) => r.status === 'REJEITADA').motivo, 'IDEMPOTENCIA_DIVERGENTE');
  assert.equal(receipts.length, 1);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].recebimento_id, receipts[0].id);
});

test('T17: lock em processo independente esgota timeout, retorna 503 e permite reenvio', { timeout: 30000 }, async (t) => {
  const { path, database } = fixture(t);
  let api; let lock;
  try {
    api = await worker('api', path);
    lock = await worker('lock', path);
    await lock.command('lock', 'locked');
    const before = snapshot(database);
    const start = Date.now();
    const response = await post(api, payload(), 503);
    const elapsed = Date.now() - start;
    assert.equal(response.retryAfter, '1');
    assert.deepEqual(response.body, { erro: 'BANCO_INDISPONIVEL', mensagem: 'Não foi possível concluir o lote. Tente novamente.' });
    assert.ok(elapsed >= 4500 && elapsed < 12000, `Espera: ${elapsed} ms`);
    assert.deepEqual(snapshot(database), before);
    await lock.command('release', 'released');
    assert.equal((await post(api, payload())).body.resultados[0].status, 'CONFIRMADA');
    t.diagnostic(`HTTP 503 após ${elapsed} ms com Retry-After: 1; reenvio HTTP 200 após liberar lock.`);
  } finally {
    await api?.stop(); await lock?.stop(); database.close();
  }
});

test('T12/T13/T16/T22/T24: rede, resposta perdida, HTTP real e auditoria após reiniciar', { timeout: 30000 }, async (t) => {
  const { path, database } = fixture(t);
  let api;
  try {
    api = await worker('api', path);
    const firstPid = api.pid;
    const before = snapshot(database);
    const url = api.url;
    await api.stop();
    await assert.rejects(fetch(url + '/sincronizacao', { method: 'POST', body: JSON.stringify(payload()), signal: AbortSignal.timeout(1000) }));
    assert.deepEqual(snapshot(database), before);
    api = await worker('api', path);
    const testedUrl = api.url;
    for (const path of ['/health', '/eventos', '/eventos/1/portoes', '/eventos/1/portoes/1/ingressos']) {
      const response = await fetch(api.url + path, { headers: { Authorization: `Bearer ${api.token}` } });
      assert.equal(response.status, 200);
      await response.json();
    }
    // O cliente perde o corpo depois de receber os headers: o commit já ocorreu.
    await new Promise((resolve, reject) => {
      const req = httpRequest(api.url + '/sincronizacao', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.token}` } }, (res) => {
        try { assert.equal(res.statusCode, 200); res.destroy(); resolve(); } catch (error) { reject(error); }
      });
      req.on('error', reject);
      req.end(JSON.stringify(payload()));
    });
    assert.equal(database.prepare('SELECT count(*) AS n FROM validacoes').get().n, 3);
    const recovered = (await post(api, payload())).body;
    assert.deepEqual(recovered, { resultados: [{ idLocal: '17', status: 'JA_PROCESSADA', resultadoOriginal: 'CONFIRMADA', validacaoId: 3 }] });
    const divergence = (await post(api, payload('device-A', { dataHora: '2026-11-20T22:03:28Z' }))).body;
    assert.equal(divergence.resultados[0].motivo, 'IDEMPOTENCIA_DIVERGENTE');
    const conflict = (await post(api, payload('device-B'))).body;
    assert.equal(conflict.resultados[0].status, 'CONFLITO');
    const rejected = (await post(api, payload('device-C', { ingressoId: 999 }))).body;
    assert.equal(rejected.resultados[0].status, 'REJEITADA');
    const auditBefore = database.prepare('SELECT * FROM auditoria_divergencias').all();
    const snapshotBefore = snapshot(database);
    const secondPid = api.pid;
    await api.stop();
    api = await worker('api', path);
    assert.notEqual(api.pid, secondPid);
    assert.deepEqual((await post(api, payload())).body, recovered);
    assert.equal((await post(api, payload('device-B'))).body.resultados[0].resultadoOriginal, 'CONFLITO');
    assert.equal((await post(api, payload('device-C', { ingressoId: 999 }))).body.resultados[0].resultadoOriginal, 'REJEITADA');
    const reopened = openDatabase(path);
    try {
      assert.deepEqual(reopened.prepare('SELECT * FROM auditoria_divergencias').all(), auditBefore);
      assert.deepEqual(snapshot(reopened), snapshotBefore);
      assert.deepEqual(reopened.pragma('foreign_key_check'), []);
    } finally { reopened.close(); }
    assert.equal(api.stderr(), '');
    t.diagnostic(`HTTP real ${testedUrl}: health e três GETs 200; POST com resposta descartada e reenvio ${JSON.stringify(recovered)}. Processos ${firstPid}/${secondPid}/${api.pid}; ${auditBefore.length} auditoria persistida após reinício.`);
  } finally { await api?.stop(); database.close(); }
});
