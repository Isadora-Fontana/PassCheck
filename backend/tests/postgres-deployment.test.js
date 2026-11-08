import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { seedDevelopment } from '../src/db/seeds/development.js';
import { backupDatabase } from '../src/db/backup.js';
import { temporaryDirectory } from './helpers/database.js';
import { readSqliteSnapshot, transferTables } from '../src/db/postgres/import-sqlite.js';
import { inspectSqliteSource, inspectPostgresTarget, compareSqliteBackup, verifyImportedData } from '../src/db/postgres/deployment.js';
import { readPostgresMigrations } from '../src/db/postgres/migrate.js';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function sourceFile(t) {
  const directory = temporaryDirectory(t);
  const path = join(directory, 'source.sqlite');
  const database = openDatabase(path);
  try {
    migrate(database); seedDevelopment(database, 'development');
    database.exec("INSERT INTO usuarios(usuario,senha_hash,papel) VALUES ('fixture-user','test-only-private-hash','ADMINISTRADOR')");
  } finally { database.close(); }
  return { path, directory };
}

test('implantação: relatório da origem mostra contagens sem dados de contas', (t) => {
  const { path } = sourceFile(t);
  const before = readSqliteSnapshot(path);
  const result = inspectSqliteSource(path);
  assert.equal(result.counts.ingressos, 22);
  assert.equal(result.transferCompatible, true);
  assert.equal(result.migrationVersion, 5);
  assert.ok(!JSON.stringify(result).includes('fixture-user'));
  assert.ok(!JSON.stringify(result).includes('test-only-private-hash'));
  assert.deepEqual(readSqliteSnapshot(path), before);
});

test('implantação: detecta resolução histórica cujo administrador foi desativado', (t) => {
  const { path } = sourceFile(t);
  const database = openDatabase(path);
  try {
    database.exec(`INSERT INTO recebimentos(id,dispositivo,id_local,conteudo_normalizado,status,motivo)
      VALUES(9,'device-test','9','{}','CONFLITO','INGRESSO_JA_UTILIZADO');
      INSERT INTO resolucoes_administrativas(recebimento_id,administrador_id,justificativa)
      VALUES(9,1,'Revisão histórica de teste.');
      UPDATE usuarios SET ativo=0 WHERE id=1;`);
  } finally { database.close(); }
  const result = inspectSqliteSource(path);
  assert.equal(result.historicalResolutionsBlocked, 1);
  assert.equal(result.transferCompatible, false);
});

test('implantação: compara backup independente e detecta alteração com contagem igual', async (t) => {
  const { path, directory } = sourceFile(t);
  const copy = await backupDatabase(path, directory);
  assert.equal(compareSqliteBackup(path, copy).matches, true);
  assert.throws(() => compareSqliteBackup(path, path), /independente/);
  const database = openDatabase(copy);
  try { database.exec("UPDATE eventos SET nome='Modificado' WHERE id=1"); } finally { database.close(); }
  const result = compareSqliteBackup(path, copy);
  assert.deepEqual(result.sourceCounts, result.backupCounts);
  assert.equal(result.matches, false);
});

test('implantação: verificação de importação compara todos os campos e proveniência em leitura', async (t) => {
  const { path } = sourceFile(t);
  const source = readSqliteSnapshot(path);
  const target = structuredClone(source.tables);
  let provenance = source.checksum;
  const database = { transaction: async (callback, options) => {
    assert.deepEqual(options, { readOnly: true });
    return callback({ query: async (sql) => {
      assert.match(sql, /^SELECT\s/);
      if (sql.includes('FROM sqlite_import_history')) return { rows: [{ source_migrations: source.sourceMigrations,
        table_counts: source.counts, content_sha256: provenance }] };
      const table = /FROM ([a-z_]+) ORDER BY/.exec(sql)?.[1];
      assert.ok(Object.hasOwn(transferTables, table));
      return { rows: target[table] };
    } });
  } };
  assert.equal((await verifyImportedData(database, path)).matches, true);
  target.usuarios[0].senha_hash = 'changed-test-hash';
  let result = await verifyImportedData(database, path);
  assert.deepEqual(result.mismatchedTables, ['usuarios']);
  assert.equal(result.matches, false);
  assert.ok(!JSON.stringify(result).includes('changed-test-hash'));
  target.usuarios[0].senha_hash = source.tables.usuarios[0].senha_hash;
  provenance = '0'.repeat(64);
  result = await verifyImportedData(database, path);
  assert.equal(result.provenanceMatches, false);
  assert.equal(result.matches, false);
});

test('implantação: preflight reconhece schema ausente sem executar DDL', async () => {
  const database = { schema: 'passcheck', transaction: async (callback, options) => {
    assert.deepEqual(options, { readOnly: true });
    return callback({ query: async (sql) => {
      assert.match(sql, /^SELECT\s/);
      return { rows: sql.includes('current_setting') ? [{ version: '18.6', read_only: true,
        can_create_schema: true, superuser: false, bypass_rls: false }] : [] };
    } });
  } };
  const result = await inspectPostgresTarget(database);
  assert.equal(result.state, 'schema_absent');
  assert.equal(result.readOnly, true);
  assert.equal(result.requiresMigrations, true);
});

test('implantação: destino ocupado e acesso de anon são visíveis, sem ler linhas', async () => {
  const database = { schema: 'passcheck', transaction: async (callback) => callback({ query: async (sql) => {
    assert.match(sql, /^SELECT\s/);
    if (sql.includes('current_setting')) return { rows: [{ version: '18.6', read_only: true, can_create_schema: true, superuser: true, bypass_rls: true }] };
    if (sql.includes('aclexplode')) return { rows: [{ can_use: true, can_create: true, public_usage: true }] };
    if (sql.includes('SELECT rolname')) return { rows: [{ rolname: 'anon' }] };
    if (sql.includes('SELECT c.relname')) return { rows: [...Object.keys(transferTables), 'schema_migrations', 'sqlite_import_history', 'login_limites'].map((relname) => ({ relname, relkind: 'r' })) };
    if (sql.includes('SELECT version')) return { rows: readPostgresMigrations() };
    if (sql.includes('count(*)')) return { rows: [{ total: 1 }] };
    assert.fail('consulta inesperada');
  } }) };
  const result = await inspectPostgresTarget(database);
  assert.equal(result.state, 'target_populated');
  assert.equal(result.publicSchemaUsage, true);
  assert.deepEqual(result.apiRolesWithSchemaUsage, ['anon']);
  assert.equal(result.privilegedConnection, true);
});

test('implantação CLI: destino ausente é informado sem conexão e sem expor dados', (t) => {
  const { path } = sourceFile(t);
  const before = readSqliteSnapshot(path);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../src/db/postgres/deployment-cli.js', import.meta.url)), 'preflight'], {
    encoding: 'utf8', env: { ...process.env, DATABASE_PATH: path, DATABASE_URL: '' },
  });
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.target.state, 'connection_not_configured');
  assert.equal(report.source.counts.usuarios, 1);
  assert.equal(report.mode, 'read_only');
  assert.ok(!result.stdout.includes('test-only-private-hash'));
  assert.deepEqual(readSqliteSnapshot(path), before);
});
