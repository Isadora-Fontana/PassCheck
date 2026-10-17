import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseTaskError } from './errors.js';

const defaultDirectory = fileURLToPath(new URL('./migrations/', import.meta.url));

function readMigrations(directory) {
  const migrations = readdirSync(directory).filter((name) => name.endsWith('.sql')).map((name) => {
    const match = /^(\d{3,})_[a-z0-9_]+\.sql$/.exec(name);
    if (!match) throw new DatabaseTaskError('Nome de migração inválido; use NNN_descricao.sql.');
    const version = Number(match[1]);
    const sql = readFileSync(join(directory, name), 'utf8').replace(/\r\n/g, '\n');
    return { version, name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  }).sort((left, right) => left.version - right.version);

  if (!migrations.length || migrations.some((migration, index) => migration.version !== index + 1)) {
    throw new DatabaseTaskError('Migrações devem ter versões únicas e consecutivas, iniciando em 001.');
  }
  return migrations;
}

function verifyHistory(database, migrations) {
  const applied = database.prepare('SELECT version, name, checksum FROM schema_migrations ORDER BY version').all();
  for (const [index, row] of applied.entries()) {
    const migration = migrations[index];
    if (!migration || row.version !== migration.version || row.name !== migration.name || row.checksum !== migration.checksum) {
      throw new DatabaseTaskError('Histórico de migrações divergente. Preserve os arquivos já aplicados e investigue antes de continuar.');
    }
  }
  return applied.length;
}

export function assertMigrationsCurrent(database, directory = defaultDirectory) {
  const exists = database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
  if (!exists) throw new DatabaseTaskError('Banco sem migrações. Execute npm run db:migrate antes do seed.');
  const migrations = readMigrations(directory);
  if (verifyHistory(database, migrations) !== migrations.length) {
    throw new DatabaseTaskError('Há migrações pendentes. Execute npm run db:migrate antes do seed.');
  }
}

export function migrate(database, directory = defaultDirectory) {
  const migrations = readMigrations(directory);
  if (database.pragma('foreign_keys', { simple: true }) !== 1) {
    throw new DatabaseTaskError('Migração exige foreign_keys habilitado na conexão.');
  }

  // O lote inteiro é atômico: esquema, dados e histórico voltam ao estado anterior
  // se qualquer migração falhar. BEGIN IMMEDIATE serializa dois executores locais.
  return database.transaction(() => {
    database.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY CHECK (version > 0),
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL CHECK (length(checksum) = 64),
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ) STRICT`);
    const appliedCount = verifyHistory(database, migrations);
    const pending = migrations.slice(appliedCount);
    const record = database.prepare('INSERT INTO schema_migrations (version, name, checksum) VALUES (?, ?, ?)');
    for (const migration of pending) {
      database.exec(migration.sql);
      record.run(migration.version, migration.name, migration.checksum);
    }
    if (database.pragma('foreign_key_check').length) {
      throw new DatabaseTaskError('Migração produziria vínculos inválidos. Nenhuma alteração foi confirmada.');
    }
    return { applied: pending.map((migration) => migration.name), currentVersion: migrations.at(-1).version };
  }).immediate();
}
