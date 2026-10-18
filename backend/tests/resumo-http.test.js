import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { join } from 'node:path';
import test from 'node:test';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { seedDevelopment } from '../src/db/seeds/development.js';
import { snapshot, temporaryDirectory } from './helpers/database.js';

async function launch(databasePath) {
  const child = fork(new URL('./helpers/sync-worker.mjs', import.meta.url), ['api', databasePath], {
    execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true,
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.stdout.resume();
  const ended = new Promise((resolve) => child.once('close', resolve));
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      if (child.connected) child.send('close');
      const timer = setTimeout(() => child.kill(), 3000);
      try { await ended; } finally { clearTimeout(timer); }
    } else await ended;
  };
  try {
    const info = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('API não iniciou no prazo.')), 10000);
      child.once('message', (message) => { clearTimeout(timer); resolve(message); });
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', () => { clearTimeout(timer); reject(new Error('API encerrou antes de iniciar.')); });
    });
    assert.equal(info.type, 'ready');
    return { ...info, stop, stderr: () => stderr };
  } catch (error) { await stop(); throw error; }
}

test('resumo HTTP real e POST persistem após reiniciar em outro processo; GETs preservados', { timeout: 30000 }, async (t) => {
  const path = join(temporaryDirectory(t), 'resumo-http.sqlite');
  const database = openDatabase(path);
  migrate(database); seedDevelopment(database, 'development');
  let api;
  try {
    api = await launch(path);
    const firstPid = api.pid;
    const get = async (path) => {
      const response = await fetch(api.url + path, { headers: { Authorization: `Bearer ${api.token}` }, signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      return response.json();
    };
    const initial = await get('/eventos/1/resumo');
    assert.deepEqual(initial, { evento: 'Festival UNIVAG', totalIngressos: 12, entradas: 2, restantes: 10,
      portoes: [{ id: 1, nome: 'Portão A', entradas: 1 }, { id: 2, nome: 'Portão B', entradas: 0 }, { id: 3, nome: 'Portão C', entradas: 1 }] });
    t.diagnostic(`Processo ${firstPid}, GET ${api.url}/eventos/1/resumo HTTP 200: ${JSON.stringify(initial)}`);
    const payload = { eventoId: 1, portaoId: 1, dispositivo: 'resumo-http', validacoes: [
      { idLocal: '17', ingressoId: 1, codigo: 'PC-A7X9K2', dataHora: '2026-11-20T22:03:27Z' },
    ] };
    const post = async () => {
      const response = await fetch(api.url + '/sincronizacao', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.token}` },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, 200);
      return response.json();
    };
    assert.equal((await post()).resultados[0].status, 'CONFIRMADA');
    const expected = { ...initial, entradas: 3, restantes: 9, portoes: initial.portoes.map((p) => p.id === 1 ? { ...p, entradas: 2 } : p) };
    assert.deepEqual(await get('/eventos/1/resumo'), expected);
    const afterPost = snapshot(database);
    await api.stop();
    api = await launch(path);
    assert.notEqual(api.pid, firstPid);
    assert.deepEqual(await get('/eventos/1/resumo'), expected);
    assert.equal((await post()).resultados[0].status, 'JA_PROCESSADA');
    assert.deepEqual(await get('/eventos/1/resumo'), expected);
    assert.deepEqual(await get('/health'), { status: 'ok', database: 'ok' });
    assert.equal((await get('/eventos')).length, 3);
    assert.equal((await get('/eventos/1/portoes')).length, 3);
    const tickets = await get('/eventos/1/portoes/1/ingressos');
    assert.equal(tickets.length, 5);
    assert.equal(tickets.find((ticket) => ticket.id === 1).utilizado, true);
    assert.deepEqual(snapshot(database), afterPost);
    assert.equal(database.prepare('SELECT count(*) n FROM auditoria_divergencias').get().n, 0);
    assert.deepEqual(database.pragma('foreign_key_check'), []);
    assert.equal(database.pragma('integrity_check', { simple: true }), 'ok');
    assert.equal(api.stderr(), '');
    t.diagnostic(`Processo ${api.pid}, GET ${api.url}/eventos/1/resumo HTTP 200 após reinício/reenvio: ${JSON.stringify(expected)}; health e GETs anteriores 200; integridade ok.`);
  } finally { await api?.stop(); database.close(); }
});
