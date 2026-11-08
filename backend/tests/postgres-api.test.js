import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { isolatedPostgres, postgresTestsEnabled } from './helpers/postgres.js';
import { migratePostgres } from '../src/db/postgres/migrate.js';
import { seedPostgresDevelopment } from '../src/db/postgres/seed.js';
import { provisionar } from '../src/services/provisionamento.js';
import { assertPostgresReady } from '../src/db/postgres/readiness.js';

async function worker(t, schema, secret) {
  const child = fork(new URL('./helpers/postgres-worker.mjs', import.meta.url), [], {
    env: { ...process.env, DATABASE_SCHEMA: schema, JWT_SECRET: secret, PG_LOCK_TIMEOUT_MS: '150' },
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  let stopped = false;
  const stop = async () => {
    if (stopped || child.exitCode !== null) return;
    stopped = true;
    const done = once(child, 'exit');
    if (child.connected) child.send('close');
    else child.kill();
    const timeout = setTimeout(() => child.kill(), 5000);
    try { await done; } finally { clearTimeout(timeout); }
  };
  t.after(stop);
  const ready = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error('API de teste não iniciou.')); }, 15000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', () => { clearTimeout(timeout); reject(new Error('API de teste encerrou antes de iniciar.')); });
    child.once('message', (message) => {
      clearTimeout(timeout);
      if (message.type === 'ready') resolve(message); else reject(new Error('API de teste recusou inicialização.'));
    });
  });
  return { stop, async call(path, { token, method = 'GET', body, csv } = {}) {
    const response = await fetch(`http://127.0.0.1:${ready.port}${path}`, {
      method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}), ...(csv ? { 'Content-Type': 'text/csv' } : {}) },
      body: csv ?? (body ? JSON.stringify(body) : undefined), signal: AbortSignal.timeout(15000),
    });
    return { status: response.status, headers: response.headers,
      body: response.status === 204 ? undefined : await response.json() };
  } };
}

test('PostgreSQL HTTP real: dois processos preservam contratos, autorização e concorrência', {
  skip: !postgresTestsEnabled && 'Exige TEST_DATABASE_URL e PASSCHECK_PG_TEST_WRITE=1.', timeout: 90000,
}, async (t) => {
  const database = await isolatedPostgres(t);
  await migratePostgres(database);
  await seedPostgresDevelopment(database, 'development');
  await assertPostgresReady(database);
  const senha = 'Teste@123';
  const bootstrap = await Promise.allSettled([
    provisionar(database, 'bootstrap', { usuario: 'admin-teste', senha }),
    provisionar(database, 'bootstrap', { usuario: 'admin-teste', senha }),
  ]);
  assert.equal(bootstrap.filter(({ status }) => status === 'fulfilled').length, 1);
  await provisionar(database, 'criar-operador', { usuario: 'operador-teste', senha, eventos: [{ eventoId: 1, portoes: [1] }] });
  const secret = randomBytes(32).toString('base64url');
  const a = await worker(t, database.schema, secret);
  const b = await worker(t, database.schema, secret);
  // Encerra servidores antes do cleanup do schema registrado no helper.
  try {
    const login = await a.call('/auth/login', { method: 'POST', body: { usuario: 'admin-teste', senha } });
    assert.equal(login.status, 200);
    const token = login.body.accessToken;
    const operator = await a.call('/auth/login', { method: 'POST', body: { usuario: 'operador-teste', senha } });
    assert.equal(operator.status, 200);
    const operatorToken = operator.body.accessToken;
    for (const dispositivo of ['pg-device-a', 'pg-device-b']) {
      assert.equal((await a.call('/auth/instalacoes', { method: 'POST', token, body: { dispositivo } })).status, 200);
    }
    const send = (api, body) => api.call('/sincronizacao', { method: 'POST', token, body });
    const batch = (id, dispositivo = 'pg-device-a', idLocal = String(id)) => ({
      dispositivo, eventoId: 1, portaoId: 1,
      validacoes: [{ idLocal, ingressoId: id, codigo: ['PC-A7X9K2', 'PC-B3M8Q1', 'PC-C5T2W7'][id - 1], dataHora: '2026-11-20T22:03:27.000Z' }],
    });
    await t.test('health, readiness, leitura, camelCase, autorização e segredo inválido', async () => {
      assert.equal((await a.call('/ready')).status, 200);
      assert.equal((await a.call('/health')).status, 200);
      assert.equal((await a.call('/eventos')).status, 401);
      assert.equal((await a.call('/eventos', { token })).body.length, 3);
      assert.equal((await a.call('/eventos', { token: operatorToken })).body.length, 1);
      assert.equal((await a.call('/eventos/2/resumo', { token: operatorToken })).status, 403);
      const summary = (await a.call('/eventos/1/resumo', { token })).body;
      assert.equal(summary.totalIngressos, 12);
      assert.equal(summary.entradas, 2);
      const tickets = (await a.call('/eventos/1/portoes/1/ingressos', { token })).body;
      assert.equal(tickets[0].eventoId, 1);
      assert.equal(tickets[0].utilizado, false);
      assert.equal((await a.call('/auth/login', { method: 'POST', body: { usuario: 'admin-teste', senha: 'Errada@123' } })).status, 401);
    });
    await t.test('disputa pelo ingresso: uma confirmação e um conflito', async () => {
      const responses = await Promise.all([send(a, batch(1)), send(b, batch(1, 'pg-device-b'))]);
      assert.deepEqual(responses.map((r) => r.status), [200, 200]);
      assert.deepEqual(responses.map((r) => r.body.resultados[0].status).sort(), ['CONFIRMADA', 'CONFLITO']);
    });
    await t.test('mesma chave concorrente: confirmação única; divergência é auditada', async () => {
      const responses = await Promise.all([send(a, batch(2)), send(b, batch(2))]);
      assert.deepEqual(responses.map((r) => r.status), [200, 200]);
      assert.deepEqual(responses.map((r) => r.body.resultados[0].status).sort(), ['CONFIRMADA', 'JA_PROCESSADA']);
      assert.equal(responses[0].body.resultados[0].validacaoId, responses[1].body.resultados[0].validacaoId);
      const altered = batch(2); altered.validacoes[0].dataHora = '2026-11-20T22:03:28.000Z';
      assert.equal((await send(b, altered)).body.resultados[0].motivo, 'IDEMPOTENCIA_DIVERGENTE');
      assert.equal((await database.query('SELECT count(*) AS n FROM auditoria_divergencias')).rows[0].n, 1);
    });
    await t.test('CSV concorrente e resolução concorrente têm um único vencedor', async () => {
      const event = await a.call('/eventos', { method: 'POST', token, body: { nome: 'Evento PG', data: '2026-11-21', local: 'Campus' } });
      assert.equal(event.status, 201);
      const id = event.body.id;
      assert.equal((await a.call(`/eventos/${id}`, { method: 'PATCH', token, body: { nome: 'Evento atualizado' } })).status, 200);
      const gate = await a.call(`/eventos/${id}/portoes`, { method: 'POST', token, body: { nome: 'Entrada' } });
      assert.equal(gate.status, 201);
      assert.equal(gate.body.eventoId, id);
      const csv = `codigo,eventoId,portaoId\nPG-CSV-1,${id},${gate.body.id}\n`;
      const imports = await Promise.all([a, b].map((api) => api.call(`/eventos/${id}/ingressos/importar`, { method: 'POST', token, csv })));
      assert.deepEqual(imports.map((r) => r.status).sort(), [201, 422]);
      const pending = await a.call('/eventos/1/pendencias', { token });
      assert.equal(pending.status, 200);
      const receipt = pending.body.pendencias[0].recebimentoId;
      const decisions = await Promise.all([a, b].map((api) => api.call(`/pendencias/${receipt}/resolver`, {
        method: 'POST', token, body: { justificativa: 'Revisão de teste mantendo o histórico.' },
      })));
      assert.deepEqual(decisions.map((r) => r.status).sort(), [201, 409]);
    });
    await t.test('lock esgotado produz 503 e permite reenvio após liberação', async () => {
      const locked = Promise.withResolvers();
      const release = Promise.withResolvers();
      const held = database.transaction(async (tx) => {
        await tx.query('LOCK TABLE eventos IN SHARE ROW EXCLUSIVE MODE');
        locked.resolve(); await release.promise;
      });
      await locked.promise;
      try {
        const response = await send(a, batch(3));
        assert.equal(response.status, 503);
        assert.equal(response.body.erro, 'BANCO_INDISPONIVEL');
        assert.equal(response.headers.get('Retry-After'), '1');
      } finally { release.resolve(); await held; }
      assert.equal((await send(a, batch(3))).body.resultados[0].status, 'CONFIRMADA');
    });
    await t.test('falha de trigger reverte o item inteiro; readiness recusa proteção desativada', async () => {
      await database.query(`CREATE FUNCTION test_reject_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'falha controlada de teste'; END; $$;
        CREATE TRIGGER test_reject_receipt BEFORE INSERT ON recebimentos
        FOR EACH ROW EXECUTE FUNCTION test_reject_receipt()`);
      const before = (await database.query('SELECT count(*) AS n FROM recebimentos')).rows[0].n;
      try {
        const response = await send(a, batch(3, 'pg-device-b', '999'));
        assert.equal(response.status, 500);
        assert.equal(response.body.erro, 'ERRO_INTERNO');
        assert.equal((await database.query('SELECT count(*) AS n FROM recebimentos')).rows[0].n, before);
      } finally {
        await database.query('DROP TRIGGER test_reject_receipt ON recebimentos; DROP FUNCTION test_reject_receipt()');
      }
      await database.query('ALTER TABLE validacoes DISABLE TRIGGER validacoes_marcar_utilizado');
      try { assert.equal((await a.call('/ready')).status, 503); }
      finally { await database.query('ALTER TABLE validacoes ENABLE TRIGGER validacoes_marcar_utilizado'); }
      assert.equal((await a.call('/ready')).status, 200);
    });
    await t.test('logout revoga o token também no outro processo', async () => {
      assert.equal((await a.call('/auth/logout', { method: 'POST', token })).status, 204);
      assert.equal((await b.call('/auth/me', { token })).status, 401);
    });
  } finally { await Promise.all([a.stop(), b.stop()]); }
});
