import assert from 'node:assert/strict';
import test from 'node:test';
import { databaseAccess } from '../src/db/access.js';
import { createIdentidadeRepository } from '../src/repositories/identidade.js';
import { createAdministracaoRepository } from '../src/repositories/administracao.js';
import { memoryDatabase } from './helpers/database.js';
import { readConfig } from './helpers/config.js';

test('IO assíncrono SQLite: autorização compartilha transação; outra requisição só lê após rollback', async (t) => {
  const database = memoryDatabase(t);
  database.exec("INSERT INTO usuarios(usuario,senha_hash,papel) VALUES ('teste','hash-ficticio','ADMINISTRADOR')");
  const identity = createIdentidadeRepository(database);
  const admin = createAdministracaoRepository(database);
  const changed = Promise.withResolvers();
  const finish = Promise.withResolvers();
  const writing = admin.transacao(async () => {
    database.exec('UPDATE usuarios SET ativo=0 WHERE id=1');
    assert.equal((await identity.porId(1)).ativo, 0);
    changed.resolve();
    await finish.promise;
    throw new Error('rollback requested');
  });
  const rejected = assert.rejects(writing, /rollback requested/);
  await changed.promise;
  let readFinished = false;
  const reading = Promise.resolve(identity.porId(1)).then((row) => { readFinished = true; return row; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(readFinished, false, 'não deve observar escrita de outra transação');
  finish.resolve();
  await rejected;
  assert.equal((await reading).ativo, 1);
  assert.equal(database.inTransaction, false);
});

test('IO assíncrono SQLite: fila libera após falha e impede commits intercalados', async (t) => {
  const database = memoryDatabase(t);
  const admin = createAdministracaoRepository(database);
  const order = [];
  const first = admin.transacao(async () => {
    await admin.criarEvento({ nome: 'Descartado', data: '2026-11-20', local: 'Campus' });
    order.push('first-write');
    await new Promise((resolve) => setImmediate(resolve));
    throw new Error('rollback requested');
  });
  const second = admin.transacao(async () => {
    order.push('second-start');
    return admin.criarEvento({ nome: 'Persistido', data: '2026-11-20', local: 'Campus' });
  });
  await assert.rejects(first, /rollback requested/);
  assert.equal((await second).nome, 'Persistido');
  assert.deepEqual(order, ['first-write', 'second-start']);
  assert.equal(database.prepare("SELECT count(*) n FROM eventos WHERE nome='Descartado'").get().n, 0);
});

test('PostgreSQL: repositórios distintos usam client da transação e isolam requisições concorrentes', async () => {
  const queries = [];
  let id = 0;
  const database = { dialect: 'postgres',
    query() { assert.fail('consulta escapou da transação'); },
    async transaction(callback) {
      const clientId = ++id;
      return callback({ async query(sql) {
        queries.push({ clientId, sql });
        return { rows: [{ id: clientId, ativo: 1, versao_token: 0 }] };
      } });
    },
  };
  const admin = createAdministracaoRepository(database);
  const identity = createIdentidadeRepository(database);
  const run = () => admin.transacao(async () => {
    const first = await identity.porId(1);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal((await identity.porId(1)).id, first.id);
    return first.id;
  });
  assert.deepEqual(await Promise.all([run(), run()]), [1, 2]);
  assert.equal(queries.filter(({ sql }) => sql.startsWith('LOCK TABLE')).length, 2);
  for (const clientId of [1, 2]) assert.ok(queries.find((row) => row.clientId === clientId).sql.startsWith('LOCK TABLE'));
});

test('transação concluída recusa consulta de tarefa assíncrona que escapou do callback', async (t) => {
  const database = memoryDatabase(t);
  const access = databaseAccess(database);
  const finish = Promise.withResolvers();
  let late;
  await access.transaction(async () => {
    late = finish.promise.then(() => access.sqlite(() => database.prepare('SELECT 1').get()));
  });
  const rejected = assert.rejects(late, /fora do tempo de vida/);
  finish.resolve();
  await rejected;
});

test('seleção do motor é explícita; configuração PostgreSQL inválida falha sem fallback', () => {
  assert.equal(readConfig({ DATABASE_URL: 'postgres://ignored' }).databaseEngine, 'sqlite');
  assert.throws(() => readConfig({ DATABASE_ENGINE: 'invalid' }), /DATABASE_ENGINE/);
  assert.throws(() => readConfig({ DATABASE_ENGINE: 'postgres' }), /DATABASE_URL/);
  const pg = readConfig({ DATABASE_ENGINE: 'postgres', DATABASE_URL: 'postgres://test:test-only@localhost/test_db',
    NODE_ENV: 'test', PG_SSL_MODE: 'disable' });
  assert.equal(pg.databaseEngine, 'postgres');
  assert.equal(pg.postgres.schema, 'passcheck');
});

test('PostgreSQL: leitura mantém snapshot, sem lock de escrita, e recusa promoção para escritor', async () => {
  const calls = [];
  const database = { dialect: 'postgres', transaction: async (fn, options) => {
    assert.equal(options.readOnly, true);
    return fn({ query: async (sql) => { calls.push(sql); return { rows: [{ id: 1 }] }; } });
  } };
  const identity = createIdentidadeRepository(database);
  await identity.leitura(async () => {
    assert.equal((await identity.porId(1)).id, 1);
    await assert.rejects(identity.transacao(() => {}), /somente leitura/);
  });
  assert.equal(calls.length, 1);
  assert.ok(!calls[0].startsWith('LOCK'));
});
