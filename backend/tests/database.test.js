import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/db/connection.js';

test('SQLite habilita chaves estrangeiras e rejeita referências inválidas', (t) => {
  const database = openDatabase(':memory:');
  t.after(() => database.close());
  assert.equal(database.pragma('foreign_keys', { simple: true }), 1);
  assert.equal(database.pragma('busy_timeout', { simple: true }), 5000);
  database.exec('CREATE TABLE parent (id INTEGER PRIMARY KEY); CREATE TABLE child (parent_id INTEGER REFERENCES parent(id));');
  assert.throws(() => database.prepare('INSERT INTO child VALUES (?)').run(99), { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' });
});

test('banco em arquivo usa WAL e preserva dados ao reabrir', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'passcheck-db-test-'));
  const path = join(directory, 'test.sqlite');
  let database;
  t.after(() => {
    if (database?.open) database.close();
    // Apenas o arquivo temporário criado pelo teste; sem exclusão recursiva.
    unlinkSync(path);
    rmdirSync(directory);
  });
  database = openDatabase(path);
  assert.equal(database.pragma('journal_mode', { simple: true }), 'wal');
  assert.equal(database.prepare("SELECT count(*) AS total FROM sqlite_master WHERE type = 'table'").get().total, 0);
  database.exec('CREATE TABLE persistence_probe (id INTEGER PRIMARY KEY)');
  database.prepare('INSERT INTO persistence_probe VALUES (?)').run(1);
  database.close();
  database = openDatabase(path);
  assert.equal(database.prepare('SELECT id FROM persistence_probe').get().id, 1);
  assert.equal(database.pragma('foreign_keys', { simple: true }), 1);
});
