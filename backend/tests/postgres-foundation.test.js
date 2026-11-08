import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { temporaryDirectory } from './helpers/database.js';
import { readPostgresConfig } from '../src/db/postgres/config.js';
import { openPostgres, safeInteger } from '../src/db/postgres/connection.js';
import { readPostgresMigrations, migratePostgres } from '../src/db/postgres/migrate.js';
import { seedPostgresDevelopment } from '../src/db/postgres/seed.js';
import { importSqlite, readSqliteSnapshot } from '../src/db/postgres/import-sqlite.js';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { seedDevelopment } from '../src/db/seeds/development.js';

const environment = { NODE_ENV: 'test', DATABASE_URL: 'postgresql://test:test-only@localhost/test_db', PG_SSL_MODE: 'disable' };

function fakeDriver({ fail = () => false, connectFailure = false } = {}) {
  const calls = [];
  const releases = [];
  let ends = 0;
  let pool;
  let options;
  class Pool extends EventEmitter {
    constructor(received) { super(); options = received; pool = this; }
    async connect() {
      if (connectFailure) throw new Error('connection failed');
      const id = releases.length;
      return {
        async query(sql, values) {
          calls.push({ id, sql, values });
          if (fail(sql)) throw new Error('simulated failure');
          return { rows: [{ ok: 1 }] };
        },
        release(discard) { releases.push({ id, discard }); },
      };
    }
    async end() { ends++; }
  }
  return { driver: { Pool, types: { getTypeParser: () => (value) => value } }, calls, releases,
    get ends() { return ends; }, get pool() { return pool; }, get options() { return options; } };
}

test('PostgreSQL: configuração exige URL explícita e não exibe credenciais', () => {
  for (const DATABASE_URL of [undefined, '', 'sqlite://test/test', 'postgres://user@localhost/db',
    'postgres://user:private-test-value@localhost/db?sslmode=no-verify']) {
    assert.throws(() => readPostgresConfig({ ...environment, DATABASE_URL }), (error) => {
      assert.equal(error.message, 'Configuração PostgreSQL inválida. Verifique: DATABASE_URL.');
      assert.ok(!error.message.includes('private-test-value'));
      return true;
    });
  }
});

test('PostgreSQL: hook recebe pool uma vez e falha no hook fecha a conexão', async () => {
  const fake = fakeDriver(); let calls = 0;
  const database = await openPostgres(readPostgresConfig(environment), { driver: fake.driver,
    onPool(pool) { calls++; assert.equal(pool, fake.pool); } });
  await database.query('SELECT 1'); await database.close(); assert.equal(calls, 1);
  const failure = fakeDriver();
  await assert.rejects(openPostgres(readPostgresConfig(environment), { driver: failure.driver,
    onPool() { throw new Error('hook failed'); } }), /hook failed/);
  assert.equal(failure.ends, 1);
});

test('PostgreSQL: TLS remoto obrigatório, schema privado e limites de pool', () => {
  const remote = { DATABASE_URL: 'postgres://test:test-only@db.example.invalid/db' };
  assert.deepEqual(readPostgresConfig(remote).ssl, { rejectUnauthorized: true });
  assert.equal(readPostgresConfig(remote).max, 5);
  for (const changes of [{ PG_SSL_MODE: 'disable' }, { PG_SSL_MODE: 'no-verify' }, { PG_POOL_MAX: '0' },
    { PG_POOL_MAX: '51' }, { PG_POOL_MAX: '1.5' }, { DATABASE_SCHEMA: 'public' }, { DATABASE_SCHEMA: 'auth' },
    { DATABASE_SCHEMA: 'x"; DROP SCHEMA public;--' }, { PG_SSL_CA_FILE: 'missing-certificate.pem' }]) {
    assert.throws(() => readPostgresConfig({ ...remote, ...changes }), /Configuração PostgreSQL inválida/);
  }
  assert.throws(() => readPostgresConfig({ ...environment, NODE_ENV: 'production' }), /PG_SSL_MODE/);
  assert.equal(readPostgresConfig(environment).ssl, false);
});

test('PostgreSQL: TLS sem validação exige opção explícita e ambiente de desenvolvimento', () => {
  const remote = { DATABASE_URL: 'postgres://test:test-only@db.example.invalid/db', PG_SSL_MODE: 'require' };
  for (const NODE_ENV of ['development', 'test']) {
    assert.deepEqual(readPostgresConfig({ ...remote, NODE_ENV }).ssl, { rejectUnauthorized: false });
    assert.throws(() => readPostgresConfig({ ...remote, NODE_ENV, PG_SSL_MODE: 'disable' }), /PG_SSL_MODE/);
    assert.throws(() => readPostgresConfig({ ...remote, NODE_ENV, PG_SSL_CA_FILE: 'certificate.pem' }), /PG_SSL_CA_FILE/);
    assert.deepEqual(readPostgresConfig({ ...remote, NODE_ENV, PG_SSL_MODE: undefined }).ssl, { rejectUnauthorized: true });
  }
  for (const NODE_ENV of ['production', undefined, '', 'staging']) {
    assert.throws(() => readPostgresConfig({ ...remote, NODE_ENV }), /PG_SSL_MODE/);
  }
});

test('PostgreSQL: bigint preserva números seguros e recusa arredondamento silencioso', () => {
  assert.equal(safeInteger('9007199254740991'), Number.MAX_SAFE_INTEGER);
  assert.equal(safeInteger('0'), 0);
  for (const value of ['9007199254740992', '1.5', '', 'NaN']) assert.throws(() => safeInteger(value), /intervalo seguro/);
});

test('PostgreSQL: transação aguarda callback e usa o mesmo client até commit', async () => {
  const fake = fakeDriver();
  const database = await openPostgres(readPostgresConfig(environment), { driver: fake.driver });
  fake.calls.length = 0;
  let captured;
  const result = await database.transaction(async (tx) => {
    captured = tx;
    await tx.query('first', [1]);
    await new Promise((resolve) => setImmediate(resolve));
    await tx.query('second', [2]);
    return 42;
  });
  assert.equal(result, 42);
  assert.deepEqual(fake.calls.map(({ sql }) => sql), ['BEGIN',
    "SELECT set_config('search_path', $1, true), set_config('statement_timeout', $2, true), set_config('lock_timeout', $3, true)",
    'first', 'second', 'COMMIT']);
  assert.equal(new Set(fake.calls.map(({ id }) => id)).size, 1);
  assert.throws(() => captured.query('late query'), /encerrada/);
  assert.equal(fake.options.types.getTypeParser(20)('123'), 123);
  await Promise.all([database.close(), database.close()]);
  assert.equal(fake.ends, 1);
  await assert.rejects(database.transaction(() => {}), /encerrada/);
});

test('PostgreSQL: erro após escrita faz rollback e devolve client sem commit', async () => {
  const fake = fakeDriver();
  const database = await openPostgres(readPostgresConfig(environment), { driver: fake.driver });
  fake.calls.length = 0;
  const failure = new Error('application failure');
  await assert.rejects(database.transaction(async (tx) => {
    await tx.query('write');
    throw failure;
  }), (error) => error === failure);
  assert.equal(fake.calls.at(-1).sql, 'ROLLBACK');
  assert.ok(!fake.calls.some(({ sql }) => sql === 'COMMIT'));
  assert.equal(fake.releases.at(-1).discard, false);
  await database.close();
});

test('PostgreSQL: rollback com falha descarta conexão; erro original é preservado', async () => {
  const fake = fakeDriver({ fail: (sql) => sql === 'ROLLBACK' });
  const database = await openPostgres(readPostgresConfig(environment), { driver: fake.driver });
  const failure = new Error('application failure');
  await assert.rejects(database.transaction(() => { throw failure; }), (error) => error === failure);
  assert.equal(fake.releases.at(-1).discard, true);
  await database.close();
});

test('PostgreSQL: falha de abertura fecha pool; erros ociosos não expõem detalhes', async () => {
  for (const options of [{ connectFailure: true }, { fail: (sql) => sql === 'SELECT 1' }]) {
    const fake = fakeDriver(options);
    await assert.rejects(openPostgres(readPostgresConfig(environment), { driver: fake.driver }));
    assert.equal(fake.ends, 1);
  }
  const fake = fakeDriver();
  const logs = [];
  const database = await openPostgres(readPostgresConfig(environment), { driver: fake.driver, logger: { error: (msg) => logs.push(msg) } });
  fake.pool.emit('error', new Error('private-test-value'));
  assert.deepEqual(logs, ['Conexão PostgreSQL ociosa indisponível.']);
  await database.close();
});

test('PostgreSQL: migrations são separadas, consecutivas e checksums ignoram CRLF', (t) => {
  const migrations = readPostgresMigrations();
  assert.deepEqual(migrations.map(({ version }) => version), [1, 2, 3, 4, 5, 6, 7]);
  const directory = temporaryDirectory(t);
  const path = join(directory, '001_probe.sql');
  writeFileSync(path, 'SELECT 1;\n');
  const checksum = readPostgresMigrations(directory)[0].checksum;
  writeFileSync(path, 'SELECT 1;\r\n');
  assert.equal(readPostgresMigrations(directory)[0].checksum, checksum);
  writeFileSync(join(directory, '003_gap.sql'), 'SELECT 3;');
  assert.throws(() => readPostgresMigrations(directory), /consecutivas/);
});

test('PostgreSQL: falha de migration interrompe lote antes de registrar versão', async (t) => {
  const directory = temporaryDirectory(t);
  writeFileSync(join(directory, '001_failure.sql'), 'BAD SQL');
  const calls = [];
  const database = { schema: 'passcheck', transaction: async (fn) => fn({ query: async (sql) => {
    calls.push(sql);
    if (sql === 'BAD SQL') throw new Error('migration failed');
    return { rows: [] };
  } }) };
  await assert.rejects(migratePostgres(database, directory), /migration failed/);
  assert.ok(calls[0].includes('pg_advisory_xact_lock'));
  assert.ok(!calls.some((sql) => sql.startsWith('INSERT INTO schema_migrations')));
});

test('PostgreSQL: seed de produção é recusado antes de conectar/escrever', async () => {
  await assert.rejects(seedPostgresDevelopment({ transaction() { assert.fail('não deveria abrir transação'); } }, 'production'), /somente/);
});

test('transferência: snapshot lê SQLite sem alterar registros, permissões ou histórico', (t) => {
  const path = join(temporaryDirectory(t), 'source.sqlite');
  const source = openDatabase(path);
  try {
    migrate(source);
    seedDevelopment(source, 'development');
    source.exec(`INSERT INTO usuarios (id,usuario,senha_hash,papel,versao_token) VALUES (7,'admin-teste','hash-ficticio','ADMINISTRADOR',4);
      INSERT INTO instalacoes(dispositivo,usuario_id) VALUES ('device-test',7);
      INSERT INTO usuarios_eventos VALUES (7,1); INSERT INTO usuarios_portoes VALUES (7,1,1);`);
  } finally { source.close(); }
  const first = readSqliteSnapshot(path);
  assert.equal(first.counts.usuarios, 1);
  assert.equal(first.counts.validacoes, 2);
  assert.equal(first.tables.usuarios[0].versao_token, 4);
  assert.equal(first.sourceMigrations.length, 5);
  assert.deepEqual(readSqliteSnapshot(path), first);
});

test('transferência: arquivo ausente não é criado; tabelas extras bloqueiam descarte silencioso', (t) => {
  const directory = temporaryDirectory(t);
  assert.throws(() => readSqliteSnapshot(join(directory, 'missing.sqlite')));
  const path = join(directory, 'source.sqlite');
  const source = openDatabase(path);
  try { migrate(source); source.exec('CREATE TABLE dados_adicionais (id INTEGER)'); }
  finally { source.close(); }
  assert.throws(() => readSqliteSnapshot(path), /tabelas inesperadas/);
});

test('transferência: destino com registros é recusado antes de qualquer INSERT', async (t) => {
  const path = join(temporaryDirectory(t), 'source.sqlite');
  const source = openDatabase(path);
  try { migrate(source); seedDevelopment(source, 'development'); } finally { source.close(); }
  const calls = [];
  const database = { transaction: (fn) => fn({ query: async (sql) => {
    calls.push(sql);
    if (sql.includes('to_regclass')) return { rows: [{ history: 'schema_migrations' }] };
    if (sql.includes('SELECT version')) return { rows: readPostgresMigrations() };
    return { rows: sql.startsWith('SELECT 1 FROM eventos') ? [{ exists: 1 }] : [] };
  } }) };
  await assert.rejects(importSqlite(database, path), /Destino PostgreSQL não está vazio/);
  assert.ok(!calls.some((sql) => sql.startsWith('INSERT')));
  assert.equal(readSqliteSnapshot(path).counts.ingressos, 22);
});
