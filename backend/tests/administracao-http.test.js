import assert from 'node:assert/strict';
import test from 'node:test';
import { fork } from 'node:child_process';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { seedDevelopment } from '../src/db/seeds/development.js';
import { temporaryDirectory, snapshot } from './helpers/database.js';

async function launch(path) {
  const child = fork(new URL('./helpers/sync-worker.mjs', import.meta.url), ['api', path], {
    execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true,
  });
  let stderr = '';
  child.stdout.resume(); child.stderr.on('data', (chunk) => { stderr += chunk; });
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
      const timer = setTimeout(() => reject(new Error('API não iniciou.')), 12000);
      child.once('message', (message) => { clearTimeout(timer); resolve(message); });
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', () => { clearTimeout(timer); reject(new Error('API encerrou antes de iniciar.')); });
    });
    assert.equal(info.type, 'ready');
    return { ...info, stop, stderr: () => stderr };
  } catch (error) { await stop(); throw error; }
}

async function http(api, method, path, body, expected = 200, type = 'application/json') {
  const response = await fetch(api.url + path, { method,
    headers: { Authorization: `Bearer ${api.token}`, ...(body !== undefined ? { 'Content-Type': type } : {}) },
    ...(body !== undefined ? { body: type === 'text/csv' ? body : JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(12000) });
  if (expected !== null) assert.equal(response.status, expected);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return { status: response.status, body: await response.json(), retryAfter: response.headers.get('retry-after') };
}

function fixture(t) {
  const path = join(temporaryDirectory(t), 'administracao.sqlite');
  const database = openDatabase(path);
  migrate(database); seedDevelopment(database, 'development');
  return { path, database };
}

test('admin HTTP real: seis endpoints, rollback CSV e auditoria persistem em outro processo', { timeout: 30000 }, async (t) => {
  const { path, database } = fixture(t);
  let api;
  try {
    api = await launch(path);
    const firstPid = api.pid;
    const created = await http(api, 'POST', '/eventos', { nome: 'Encontro acadêmico', data: '2026-11-21', local: 'Auditório' }, 201);
    assert.equal(created.body.id, 4);
    const updated = await http(api, 'PATCH', '/eventos/4', { local: 'Auditório central' });
    assert.equal(updated.body.local, 'Auditório central');
    const gate = await http(api, 'POST', '/eventos/4/portoes', { nome: 'Entrada principal' }, 201);
    assert.equal(gate.body.id, 7);
    const imported = await http(api, 'POST', '/eventos/4/ingressos/importar',
      'codigo,eventoId,portaoId\nACADEMICO-001,4,7\nACADEMICO-002,4,7\n', 201, 'text/csv');
    assert.deepEqual(imported.body, { eventoId: 4, importados: 2 });
    const beforeFailure = snapshot(database);
    database.exec("CREATE TRIGGER falhar_importacao BEFORE INSERT ON ingressos WHEN NEW.codigo='HTTP-FALHA-2' BEGIN SELECT RAISE(ABORT,'falha controlada'); END");
    const failed = await http(api, 'POST', '/eventos/4/ingressos/importar',
      'codigo,eventoId,portaoId\nHTTP-FALHA-1,4,7\nHTTP-FALHA-2,4,7', 500, 'text/csv');
    assert.equal(failed.body.erro, 'ERRO_INTERNO');
    assert.deepEqual(snapshot(database), beforeFailure);
    database.exec('DROP TRIGGER falhar_importacao');
    const originalSummary = (await http(api, 'GET', '/eventos/1/resumo')).body;
    const payload = { eventoId: 1, portaoId: 1, dispositivo: 'device-A', validacoes: [
      { idLocal: '801', ingressoId: 4, codigo: 'PC-D9R4L6', dataHora: '2026-11-20T22:03:27Z' },
      { idLocal: '802', ingressoId: 999, codigo: 'INEXISTENTE', dataHora: '2026-11-20T22:03:28Z' },
    ] };
    const sync = await http(api, 'POST', '/sincronizacao', payload);
    assert.deepEqual(sync.body.resultados.map((r) => r.status), ['CONFLITO', 'REJEITADA']);
    const pending = (await http(api, 'GET', '/eventos/1/pendencias')).body;
    assert.equal(pending.pendencias.length, 2);
    const id = pending.pendencias[0].recebimentoId;
    const resolved = (await http(api, 'POST', `/pendencias/${id}/resolver`,
      { justificativa: 'Revisão administrativa; preservada confirmação original.' }, 201)).body;
    const domainSnapshot = snapshot(database);
    assert.equal(resolved.resolucao.administradorId, 1);
    assert.deepEqual((await http(api, 'GET', '/eventos/1/resumo')).body, originalSummary);
    assert.equal(api.stderr().trim(), 'Erro interno ao processar requisição.');
    await api.stop();
    api = await launch(path);
    assert.notEqual(api.pid, firstPid);
    const afterRestart = (await http(api, 'GET', '/eventos/1/pendencias?estado=TODAS')).body;
    assert.deepEqual(afterRestart.pendencias[0].resolucao, resolved.resolucao);
    assert.equal(afterRestart.pendencias[1].statusAdministrativo, 'PENDENTE');
    assert.equal((await http(api, 'GET', '/eventos/4/portoes/7/ingressos')).body.length, 2);
    assert.equal((await http(api, 'POST', '/sincronizacao', payload)).body.resultados[0].resultadoOriginal, 'CONFLITO');
    await http(api, 'POST', `/pendencias/${id}/resolver`, { justificativa: 'Tentativa repetida após reinício.' }, 409);
    await http(api, 'GET', '/health');
    assert.deepEqual(snapshot(database), domainSnapshot);
    assert.deepEqual(database.pragma('foreign_key_check'), []);
    assert.equal(database.pragma('integrity_check', { simple: true }), 'ok');
    assert.equal(api.stderr(), '');
    t.diagnostic(`HTTP real processos ${firstPid}/${api.pid}: POST evento 201 ${JSON.stringify(created.body)}; PATCH 200; portão 201 ${JSON.stringify(gate.body)}; CSV 201 ${JSON.stringify(imported.body)}; CSV com falha 500 e rollback integral. Resolução persistida ${JSON.stringify(resolved)}; GET pendências/health 200; integridade ok.`);
  } finally { await api?.stop(); database.close(); }
});

test('admin: processos independentes serializam CSV duplicado e resolução concorrente', { timeout: 30000 }, async (t) => {
  const { path, database } = fixture(t);
  const apis = [];
  try {
    apis.push(await launch(path)); apis.push(await launch(path));
    assert.notEqual(apis[0].pid, apis[1].pid);
    database.exec('BEGIN IMMEDIATE');
    const importRequests = Promise.all(apis.map((api) => http(api, 'POST', '/eventos/1/ingressos/importar',
      'codigo,eventoId,portaoId\nCONCORRENTE,1,1', null, 'text/csv')));
    await delay(200); database.exec('ROLLBACK');
    const imports = await importRequests;
    assert.deepEqual(imports.map((r) => r.status).sort(), [201, 422]);
    assert.equal(database.prepare("SELECT count(*) n FROM ingressos WHERE codigo='CONCORRENTE'").get().n, 1);
    const id = database.prepare(`INSERT INTO recebimentos (dispositivo, id_local, conteudo_normalizado, status, motivo)
      VALUES ('device-A', '900', '{"eventoId":1}', 'REJEITADA', 'INGRESSO_INEXISTENTE')`).run().lastInsertRowid;
    database.exec('BEGIN IMMEDIATE');
    const resolveRequests = Promise.all(apis.map((api) => http(api, 'POST', `/pendencias/${id}/resolver`,
      { justificativa: 'Revisão concorrente sem nova confirmação.' }, null)));
    await delay(200); database.exec('ROLLBACK');
    const resolutions = await resolveRequests;
    assert.deepEqual(resolutions.map((r) => r.status).sort(), [201, 409]);
    assert.equal(database.prepare('SELECT count(*) n FROM resolucoes_administrativas WHERE recebimento_id=?').get(id).n, 1);
    assert.equal(database.prepare('SELECT count(*) n FROM validacoes').get().n, 2);
    assert.deepEqual(database.pragma('foreign_key_check'), []);
    assert.equal(database.pragma('integrity_check', { simple: true }), 'ok');
    assert.ok(apis.every((api) => api.stderr() === ''));
    t.diagnostic(`Processos ${apis[0].pid}/${apis[1].pid}: CSV concorrente HTTP 201/422, uma inserção; resolução HTTP 201/409, uma auditoria, duas confirmações sintéticas preservadas.`);
  } finally {
    if (database.inTransaction) database.exec('ROLLBACK');
    await Promise.all(apis.map((api) => api.stop())); database.close();
  }
});
