import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { memoryDatabase, snapshot, temporaryDirectory } from './helpers/database.js';

test('migrações criam o modelo e repetir não modifica dados nem histórico', (t) => {
  const database = memoryDatabase(t);
  const before = snapshot(database);
  const history = database.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
  assert.deepEqual(history.map((row) => row.version), [1, 2, 3, 4]);
  assert.deepEqual(migrate(database), { applied: [], currentVersion: 4 });
  assert.deepEqual(snapshot(database), before);
  assert.deepEqual(database.prepare('SELECT * FROM schema_migrations ORDER BY version').all(), history);
  assert.deepEqual(database.pragma('foreign_key_check'), []);
  assert.equal(database.pragma('integrity_check', { simple: true }), 'ok');
});

test('falha de migração reverte DDL, dados e histórico do lote inteiro', (t) => {
  const directory = temporaryDirectory(t);
  writeFileSync(join(directory, '001_initial.sql'), 'CREATE TABLE probe (id INTEGER PRIMARY KEY); INSERT INTO probe VALUES (1);');
  writeFileSync(join(directory, '002_failure.sql'), 'CREATE TABLE partial (id INTEGER); INSERT INTO probe VALUES (1);');
  const database = openDatabase(':memory:');
  t.after(() => database.close());
  database.exec('CREATE TABLE existing (id INTEGER); INSERT INTO existing VALUES (42)');
  assert.throws(() => migrate(database, directory), { code: 'SQLITE_CONSTRAINT_PRIMARYKEY' });
  assert.deepEqual(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all(), [{ name: 'existing' }]);
  assert.deepEqual(database.prepare('SELECT * FROM existing').all(), [{ id: 42 }]);
});

test('migração nova com falha preserva versões e dados já confirmados', (t) => {
  const directory = temporaryDirectory(t);
  writeFileSync(join(directory, '001_initial.sql'), 'CREATE TABLE probe (id INTEGER PRIMARY KEY); INSERT INTO probe VALUES (1);');
  const database = openDatabase(':memory:');
  t.after(() => database.close());
  migrate(database, directory);
  const history = database.prepare('SELECT * FROM schema_migrations').all();
  writeFileSync(join(directory, '002_failure.sql'), 'UPDATE probe SET id = 2; CREATE TABLE partial (id INTEGER); INSERT INTO missing VALUES (1);');
  assert.throws(() => migrate(database, directory));
  assert.deepEqual(database.prepare('SELECT * FROM probe').all(), [{ id: 1 }]);
  assert.deepEqual(database.prepare('SELECT * FROM schema_migrations').all(), history);
  assert.equal(database.prepare("SELECT 1 FROM sqlite_master WHERE name = 'partial'").get(), undefined);
});

test('checksum detecta alteração de migração aplicada; CRLF e LF são equivalentes', (t) => {
  const directory = temporaryDirectory(t);
  const file = join(directory, '001_initial.sql');
  writeFileSync(file, 'CREATE TABLE probe (id INTEGER);\n');
  const database = openDatabase(':memory:');
  t.after(() => database.close());
  migrate(database, directory);
  writeFileSync(file, readFileSync(file, 'utf8').replace(/\n/g, '\r\n'));
  assert.equal(migrate(database, directory).applied.length, 0);
  writeFileSync(file, 'CREATE TABLE probe (id INTEGER, changed TEXT);');
  assert.throws(() => migrate(database, directory), /Histórico de migrações divergente/);
  assert.equal(database.prepare('PRAGMA table_info(probe)').all().length, 1);
});

test('versões duplicadas, lacunas e histórico mais novo são recusados', (t) => {
  const directory = temporaryDirectory(t);
  writeFileSync(join(directory, '001_initial.sql'), 'CREATE TABLE probe (id INTEGER);');
  writeFileSync(join(directory, '001_duplicate.sql'), 'CREATE TABLE other (id INTEGER);');
  const database = openDatabase(':memory:');
  t.after(() => database.close());
  assert.throws(() => migrate(database, directory), /versões únicas/);
  const current = memoryDatabase(t);
  const oldDirectory = temporaryDirectory(t);
  writeFileSync(join(oldDirectory, '001_initial.sql'), 'SELECT 1;');
  assert.throws(() => migrate(current, oldDirectory), /Histórico de migrações divergente/);
  const gapDirectory = temporaryDirectory(t);
  writeFileSync(join(gapDirectory, '002_gap.sql'), 'SELECT 1;');
  assert.throws(() => migrate(database, gapDirectory), /versões únicas/);
});

test('migração não adota tabela existente nem sobrescreve dados', (t) => {
  const database = openDatabase(':memory:');
  t.after(() => database.close());
  database.exec("CREATE TABLE eventos (id INTEGER, nome TEXT); INSERT INTO eventos VALUES (1, 'Preexistente')");
  assert.throws(() => migrate(database), /already exists/);
  assert.deepEqual(database.prepare('SELECT * FROM eventos').all(), [{ id: 1, nome: 'Preexistente' }]);
  assert.equal(database.prepare("SELECT 1 FROM sqlite_master WHERE name = 'schema_migrations'").get(), undefined);
});

test('migração exige chaves estrangeiras ativas', (t) => {
  const database = openDatabase(':memory:');
  t.after(() => database.close());
  database.pragma('foreign_keys = OFF');
  assert.throws(() => migrate(database), /foreign_keys/);
});
