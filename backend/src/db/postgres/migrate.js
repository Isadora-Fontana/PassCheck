import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseTaskError } from '../errors.js';

export const postgresMigrationsDirectory = fileURLToPath(new URL('./migrations/', import.meta.url));

export function readPostgresMigrations(directory = postgresMigrationsDirectory) {
  const migrations = readdirSync(directory).filter((name) => name.endsWith('.sql')).map((name) => {
    const match = /^(\d{3,})_[a-z0-9_]+\.sql$/.exec(name);
    if (!match) throw new DatabaseTaskError('Nome de migração inválido; use NNN_descricao.sql.');
    const sql = readFileSync(join(directory, name), 'utf8').replace(/\r\n/g, '\n');
    return { version: Number(match[1]), name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  }).sort((a, b) => a.version - b.version);
  if (!migrations.length || migrations.some((migration, index) => migration.version !== index + 1)) {
    throw new DatabaseTaskError('Migrações devem ter versões únicas e consecutivas, iniciando em 001.');
  }
  return migrations;
}

async function verifyHistory(tx, migrations) {
  const { rows } = await tx.query('SELECT version, name, checksum FROM schema_migrations ORDER BY version');
  for (const [index, row] of rows.entries()) {
    const migration = migrations[index];
    if (!migration || row.version !== migration.version || row.name !== migration.name || row.checksum !== migration.checksum) {
      throw new DatabaseTaskError('Histórico de migrações divergente. Preserve os arquivos já aplicados e investigue antes de continuar.');
    }
  }
  return rows.length;
}

export async function assertPostgresMigrationsCurrent(tx, directory = postgresMigrationsDirectory) {
  const migrations = readPostgresMigrations(directory);
  const { rows } = await tx.query("SELECT to_regclass('schema_migrations') AS history");
  if (!rows[0].history) throw new DatabaseTaskError('Banco sem migrações PostgreSQL.');
  if (await verifyHistory(tx, migrations) !== migrations.length) throw new DatabaseTaskError('Há migrações PostgreSQL pendentes.');
}

export async function migratePostgres(database, directory = postgresMigrationsDirectory) {
  const migrations = readPostgresMigrations(directory);
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(database.schema)) throw new DatabaseTaskError('Schema PostgreSQL inválido.');
  return database.transaction(async (tx) => {
    // Um lock transacional antes do DDL serializa dois executores de migrations.
    await tx.query('SELECT pg_advisory_xact_lock(724109, hashtext($1))', [database.schema]);
    const { rows } = await tx.query('SELECT 1 FROM pg_namespace WHERE nspname = $1', [database.schema]);
    if (!rows.length) {
      await tx.query(`CREATE SCHEMA "${database.schema}"`);
      await tx.query(`REVOKE ALL ON SCHEMA "${database.schema}" FROM PUBLIC`);
    }
    await tx.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY CHECK (version > 0), name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL CHECK (length(checksum) = 64),
      applied_at TEXT NOT NULL DEFAULT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )`);
    const pending = migrations.slice(await verifyHistory(tx, migrations));
    for (const migration of pending) {
      await tx.query(migration.sql);
      await tx.query('INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
        [migration.version, migration.name, migration.checksum]);
    }
    return { applied: pending.map(({ name }) => name), currentVersion: migrations.at(-1).version };
  });
}
