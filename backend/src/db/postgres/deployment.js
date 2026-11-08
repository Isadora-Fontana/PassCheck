import { isDeepStrictEqual } from 'node:util';
import { statSync } from 'node:fs';
import { DatabaseTaskError } from '../errors.js';
import { readSqliteSnapshot, transferTables } from './import-sqlite.js';
import { readPostgresMigrations } from './migrate.js';

// Relatórios operacionais contêm apenas contagens/estados, nunca linhas ou segredos.
export function inspectSqliteSource(path) {
  const snapshot = readSqliteSnapshot(path);
  const users = new Map(snapshot.tables.usuarios.map((user) => [user.id, user]));
  const historicalResolutionsBlocked = snapshot.tables.resolucoes_administrativas.filter((resolution) => {
    const user = users.get(resolution.administrador_id);
    return !user || user.ativo !== 1 || user.papel !== 'ADMINISTRADOR';
  }).length;
  return { integrity: 'ok', migrationVersion: snapshot.sourceMigrations.at(-1).version,
    counts: snapshot.counts, historicalResolutionsBlocked,
    transferCompatible: historicalResolutionsBlocked === 0 };
}

export function compareSqliteBackup(sourcePath, backupPath) {
  const sourceFile = statSync(sourcePath);
  const backupFile = statSync(backupPath);
  if (sourceFile.dev === backupFile.dev && sourceFile.ino === backupFile.ino) {
    throw new DatabaseTaskError('Backup deve ser um arquivo independente da origem.');
  }
  const source = readSqliteSnapshot(sourcePath);
  const backup = readSqliteSnapshot(backupPath);
  const after = readSqliteSnapshot(sourcePath);
  const sourceStable = after.checksum === source.checksum && isDeepStrictEqual(after.sourceMigrations, source.sourceMigrations);
  const matches = sourceStable && source.checksum === backup.checksum && isDeepStrictEqual(source.sourceMigrations, backup.sourceMigrations);
  return { matches, sourceStable, sourceCounts: source.counts, backupCounts: backup.counts,
    note: 'A comparação vale para os snapshots lidos; mantenha a origem sem escritores durante o corte.' };
}

export async function inspectPostgresTarget(database) {
  return database.transaction(async (tx) => {
    const { rows: [server] } = await tx.query(`SELECT current_setting('server_version') AS version,
      current_setting('transaction_read_only') = 'on' AS read_only,
      has_database_privilege(current_database(), 'CREATE') AS can_create_schema,
      r.rolsuper AS superuser, r.rolbypassrls AS bypass_rls
      FROM pg_roles r WHERE r.rolname = current_user`);
    const { rows: schemas } = await tx.query(`SELECT
      has_schema_privilege(n.oid, 'USAGE') AS can_use, has_schema_privilege(n.oid, 'CREATE') AS can_create,
      EXISTS (SELECT 1 FROM aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a
        WHERE a.grantee = 0 AND a.privilege_type = 'USAGE') AS public_usage
      FROM pg_namespace n WHERE n.nspname = $1`, [database.schema]);
    const result = { connection: 'ok', serverVersion: server.version, readOnly: server.read_only,
      schema: database.schema, canCreateSchema: server.can_create_schema,
      privilegedConnection: server.superuser || server.bypass_rls,
      dataApiExposure: 'verify_in_dashboard' };
    if (!schemas.length) return { ...result, state: 'schema_absent', requiresMigrations: true };

    const { rows: apiRoles } = await tx.query(`SELECT rolname FROM pg_roles
      WHERE rolname IN ('anon', 'authenticated') AND has_schema_privilege(oid, $1, 'USAGE') ORDER BY rolname`, [database.schema]);
    const { rows: objects } = await tx.query(`SELECT c.relname, c.relkind FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname=$1 ORDER BY c.relname`, [database.schema]);
    const { rows: [functions] } = await tx.query(`SELECT count(*) AS total FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1`, [database.schema]);
    const permissions = { canUseSchema: schemas[0].can_use, canCreateObjects: schemas[0].can_create,
      publicSchemaUsage: schemas[0].public_usage, apiRolesWithSchemaUsage: apiRoles.map((row) => row.rolname) };
    if (!objects.length && functions.total === 0) {
      return { ...result, ...permissions, state: 'schema_empty', requiresMigrations: true };
    }
    const expected = new Set([...Object.keys(transferTables), 'schema_migrations', 'sqlite_import_history', 'login_limites']);
    const actual = objects.filter((row) => ['r', 'p', 'v', 'm', 'f'].includes(row.relkind));
    const missing = [...expected].filter((name) => !actual.some((row) => row.relname === name && row.relkind === 'r'));
    const unexpected = actual.filter((row) => !expected.has(row.relname)).map((row) => row.relname);
    if (missing.length || unexpected.length) {
      return { ...result, ...permissions, state: 'schema_incompatible', missing, unexpected };
    }
    const { rows: history } = await tx.query('SELECT version, name, checksum FROM schema_migrations ORDER BY version');
    const migrations = readPostgresMigrations();
    const historyMatches = history.length === migrations.length && history.every((row, index) => {
      const migration = migrations[index];
      return row.version === migration.version && row.name === migration.name && row.checksum === migration.checksum;
    });
    const counts = {};
    for (const table of [...Object.keys(transferTables), 'sqlite_import_history']) {
      counts[table] = (await tx.query(`SELECT count(*) AS total FROM ${table}`)).rows[0].total;
    }
    return { ...result, ...permissions, historyMatches, counts,
      state: !historyMatches ? 'history_divergent'
        : Object.values(counts).some((count) => count > 0) ? 'target_populated' : 'empty_with_current_history' };
  }, { readOnly: true });
}

export async function verifyImportedData(database, path) {
  const source = readSqliteSnapshot(path);
  const result = await database.transaction(async (tx) => {
    const mismatchedTables = [];
    const counts = {};
    for (const [table, definition] of Object.entries(transferTables)) {
      const order = table === 'usuarios_portoes' ? 'usuario_id, evento_id, portao_id'
        : table === 'usuarios_eventos' ? 'usuario_id, evento_id' : table === 'instalacoes' ? 'dispositivo COLLATE "C"' : 'id';
      const { rows } = await tx.query(`SELECT ${definition.split(' ').join(', ')} FROM ${table} ORDER BY ${order}`);
      counts[table] = rows.length;
      if (!isDeepStrictEqual(rows, source.tables[table])) mismatchedTables.push(table);
    }
    const { rows: history } = await tx.query('SELECT source_migrations, table_counts, content_sha256 FROM sqlite_import_history WHERE id=1');
    const provenanceMatches = history.length === 1 && history[0].content_sha256 === source.checksum
      && isDeepStrictEqual(history[0].source_migrations, source.sourceMigrations)
      && isDeepStrictEqual(history[0].table_counts, source.counts);
    return { counts, mismatchedTables, provenanceMatches };
  }, { readOnly: true });
  const after = readSqliteSnapshot(path);
  const sourceStable = after.checksum === source.checksum && isDeepStrictEqual(after.sourceMigrations, source.sourceMigrations);
  return { ...result, sourceStable, matches: sourceStable && result.provenanceMatches && !result.mismatchedTables.length };
}
