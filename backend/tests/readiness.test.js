import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { assertDatabaseReady } from '../src/db/readiness.js';
import { readConfig } from './helpers/config.js';
import { memoryDatabase, temporaryDirectory } from './helpers/database.js';

function appFor(database) {
  return createApp({ config: readConfig(), database, logger: { error() {} } });
}

function snapshot(database) {
  const schema = database.prepare('SELECT * FROM sqlite_schema ORDER BY type, name').all();
  const tables = schema.filter((row) => row.type === 'table').map((row) => row.name);
  return { schema, rows: Object.fromEntries(tables.map((name) => [name,
    database.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()])) };
}

async function notReady(app) {
  const response = await request(app).get('/ready').expect(503)
    .expect('Retry-After', '5').expect('Cache-Control', 'no-store');
  assert.deepEqual(response.body, { status: 'not_ready' });
}

test('ready: banco vazio mantém vivacidade, recusa prontidão e não cria tabelas', async (t) => {
  const database = openDatabase(':memory:');
  t.after(() => database.close());
  const app = appFor(database);
  await request(app).get('/health').expect(200);
  await notReady(app);
  assert.deepEqual(database.prepare('SELECT name FROM sqlite_schema').all(), []);
});

test('ready: banco 001–003 não é migrado por requisição; migração explícita libera prontidão', async (t) => {
  const directory = temporaryDirectory(t);
  for (const name of ['001_modelo_central.sql', '002_integridade_confirmacoes.sql', '003_auditoria_divergencias.sql']) {
    writeFileSync(join(directory, name), readFileSync(new URL(`../src/db/migrations/${name}`, import.meta.url)));
  }
  const database = openDatabase(':memory:');
  t.after(() => database.close());
  migrate(database, directory);
  const before = snapshot(database);
  const app = appFor(database);
  await request(app).get('/health').expect(200);
  await notReady(app);
  await notReady(app);
  assert.deepEqual(snapshot(database), before);
  migrate(database);
  await request(app).get('/ready').expect(200);
  assert.equal(database.prepare('SELECT count(*) AS n FROM usuarios').get().n, 0);
});

test('ready: banco atualizado responde 200 sem mudar schema, dados ou histórico', async (t) => {
  const database = memoryDatabase(t);
  const before = snapshot(database);
  database.pragma('query_only = ON');
  const response = await request(appFor(database)).get('/ready').expect(200).expect('Cache-Control', 'no-store');
  assert.deepEqual(response.body, { status: 'ready', database: 'ok' });
  assert.deepEqual(snapshot(database), before);
});

test('ready: checksum divergente, lacuna e versão futura recusam prontidão sem reparar histórico', async (t) => {
  for (const sql of [
    "UPDATE schema_migrations SET checksum = replace(hex(zeroblob(32)), '0', 'a') WHERE version = 1",
    'DELETE FROM schema_migrations WHERE version = 2',
    "INSERT INTO schema_migrations (version, name, checksum) VALUES (6, '006_futura.sql', hex(zeroblob(32)))",
  ]) {
    const database = memoryDatabase(t);
    database.exec(sql);
    const before = snapshot(database);
    await notReady(appFor(database));
    assert.deepEqual(snapshot(database), before);
  }
});

test('ready: histórico completo não mascara tabela, coluna, índice ou trigger ausente', async (t) => {
  for (const sql of [
    'DROP TABLE resolucoes_administrativas',
    'ALTER TABLE eventos RENAME COLUMN local TO local_antigo',
    'DROP INDEX idx_ingressos_evento_portao',
    'DROP TRIGGER usuarios_revogar_tokens',
  ]) {
    const database = memoryDatabase(t);
    database.exec(sql);
    const before = snapshot(database);
    await notReady(appFor(database));
    assert.deepEqual(snapshot(database), before);
  }
});

test('ready: conexão fechada ou proteções SQLite desligadas retornam 503 sanitizado', async (t) => {
  for (const pragma of ['foreign_keys = OFF', 'recursive_triggers = OFF']) {
    const database = memoryDatabase(t);
    database.pragma(pragma);
    assert.throws(() => assertDatabaseReady(database));
    await notReady(appFor(database));
  }
  const database = openDatabase(':memory:');
  const app = appFor(database);
  database.close();
  await notReady(app);
});

test('ready: origens locais exatas permitem preflight e não ampliam permissões de negócio', async (t) => {
  const app = appFor(memoryDatabase(t));
  for (const origin of readConfig().corsOrigins) {
    await request(app).get('/ready').set('Origin', origin).expect(200).expect('Access-Control-Allow-Origin', origin);
    await request(app).options('/auth/login').set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'Content-Type,Authorization')
      .expect(204).expect('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    await request(app).get('/eventos').set('Origin', origin).expect(401);
  }
  for (const origin of ['http://127.0.0.1:9999', 'http://127.0.0.1.evil.example:4173', 'https://other.example', 'null']) {
    await request(app).get('/ready').set('Origin', origin).expect(403);
  }
});
