import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { backupDatabase } from '../src/db/backup.js';
import { temporaryDirectory, snapshot } from './helpers/database.js';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { seedDevelopment } from '../src/db/seeds/development.js';

test('backup consistente inclui WAL, preserva registros e não sobrescreve outro backup', async (t) => {
  const directory = temporaryDirectory(t);
  const database = openDatabase(join(directory, 'source.sqlite'));
  try {
  migrate(database);
  seedDevelopment(database, 'development');
  const before = snapshot(database);
  const first = await backupDatabase(database.name, directory);
  const second = await backupDatabase(database.name, directory);
  assert.notEqual(first, second);
  const copy = new Database(first, { readonly: true, fileMustExist: true });
  try {
    assert.deepEqual(snapshot(copy), before);
    assert.equal(copy.pragma('integrity_check', { simple: true }), 'ok');
  } finally { copy.close(); }
  assert.deepEqual(snapshot(database), before);
  } finally { database.close(); }
});
