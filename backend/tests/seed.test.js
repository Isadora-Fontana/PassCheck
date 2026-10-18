import { testEnvironment } from './helpers/config.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { eventosMock, portoesMock } from '../../frontend/src/mocks/eventos.js';
import { ingressosMock } from '../../frontend/src/mocks/ingressos.js';
import { eventos, portoes, ingressos } from '../src/db/seeds/mock-data.js';
import { seedDevelopment, seedDevice } from '../src/db/seeds/development.js';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { backendDirectory } from '../src/config.js';
import { memoryDatabase, snapshot, temporaryDirectory, confirm } from './helpers/database.js';

const execute = promisify(execFile);

test('seed reproduz todos os campos dos mocks reais e confirma apenas IDs 4 e 12', (t) => {
  assert.deepEqual(eventos, eventosMock);
  assert.deepEqual(portoes, portoesMock);
  assert.deepEqual(ingressos, ingressosMock);
  const database = memoryDatabase(t, { seed: false });
  assert.deepEqual(seedDevelopment(database, 'development'), {
    inserted: { eventos: 3, portoes: 6, ingressos: 22, recebimentos: 2, validacoes: 2 },
  });
  assert.deepEqual(database.prepare('SELECT * FROM eventos ORDER BY id').all(), eventosMock);
  assert.deepEqual(database.prepare('SELECT id, evento_id AS eventoId, nome FROM portoes ORDER BY id').all(), portoesMock);
  const tickets = database.prepare(`SELECT id, codigo, evento_id AS eventoId, portao_id AS portaoId, utilizado
    FROM ingressos ORDER BY id`).all().map((ticket) => ({ ...ticket, utilizado: Boolean(ticket.utilizado) }));
  assert.deepEqual(tickets, ingressosMock);
  const confirmations = database.prepare(`SELECT v.ingresso_id, v.data_hora_cliente, r.dispositivo, r.id_local, r.status, r.conteudo_normalizado
    FROM validacoes v JOIN recebimentos r ON r.id = v.recebimento_id ORDER BY v.ingresso_id`).all();
  assert.deepEqual(confirmations.map((row) => row.ingresso_id), [4, 12]);
  for (const row of confirmations) {
    assert.equal(row.dispositivo, seedDevice);
    assert.equal(row.id_local, String(row.ingresso_id));
    assert.equal(row.status, 'CONFIRMADA');
    assert.equal(row.data_hora_cliente, null);
    const original = ingressosMock.find((ticket) => ticket.id === row.ingresso_id);
    assert.deepEqual(JSON.parse(row.conteudo_normalizado), {
      ingressoId: original.id, codigo: original.codigo, eventoId: original.eventoId, portaoId: original.portaoId, dataHora: null,
    });
  }
});

test('repetir seed preserva IDs, horários, recibos e utilizações posteriores', (t) => {
  const database = memoryDatabase(t);
  confirm(database, 1);
  const before = snapshot(database);
  assert.deepEqual(seedDevelopment(database, 'development'), {
    inserted: { eventos: 0, portoes: 0, ingressos: 0, recebimentos: 0, validacoes: 0 },
  });
  assert.deepEqual(snapshot(database), before);
  assert.equal(database.prepare('SELECT count(*) AS total FROM ingressos WHERE utilizado = 1').get().total, 3);
});

test('colisão de cadastro cancela o seed inteiro e preserva dados anteriores', (t) => {
  const database = memoryDatabase(t, { seed: false });
  database.prepare('INSERT INTO eventos (id, nome, data, local) VALUES (?, ?, ?, ?)')
    .run(eventos[1].id, 'Cadastro preexistente', eventos[1].data, eventos[1].local);
  const before = snapshot(database);
  assert.throws(() => seedDevelopment(database, 'development'), /Seed incompatível/);
  assert.deepEqual(snapshot(database), before);
});

test('falha durante a criação dos recibos desfaz eventos, portões e ingressos inseridos', (t) => {
  const database = memoryDatabase(t, { seed: false });
  database.prepare(`INSERT INTO recebimentos (dispositivo, id_local, conteudo_normalizado, status, motivo)
    VALUES (?, '12', '{}', 'REJEITADA', 'COLISAO_TESTE')`).run(seedDevice);
  const before = snapshot(database);
  assert.throws(() => seedDevelopment(database, 'development'), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
  assert.deepEqual(snapshot(database), before);
});

test('seed recusa mudar ingresso preexistente disponível para utilizado', (t) => {
  const database = memoryDatabase(t, { seed: false });
  const event = eventos[0];
  database.prepare('INSERT INTO eventos (id, nome, data, local) VALUES (@id, @nome, @data, @local)').run(event);
  database.prepare('INSERT INTO portoes (id, evento_id, nome) VALUES (?, ?, ?)').run(portoes[0].id, event.id, portoes[0].nome);
  const ticket = ingressos.find((item) => item.id === 4);
  database.prepare('INSERT INTO ingressos (id, codigo, evento_id, portao_id) VALUES (?, ?, ?, ?)')
    .run(ticket.id, ticket.codigo, ticket.eventoId, ticket.portaoId);
  const before = snapshot(database);
  assert.throws(() => seedDevelopment(database, 'development'), /diverge do uso inicial/);
  assert.deepEqual(snapshot(database), before);
});

test('seed só executa em development e exige migrações completas', (t) => {
  const database = memoryDatabase(t, { seed: false });
  for (const environment of ['production', 'test', undefined]) {
    assert.throws(() => seedDevelopment(database, environment), /somente com NODE_ENV=development/);
  }
  assert.equal(database.prepare('SELECT count(*) AS total FROM eventos').get().total, 0);
  const empty = openDatabase(':memory:');
  t.after(() => empty.close());
  assert.throws(() => seedDevelopment(empty, 'development'), /Execute npm run db:migrate/);
  database.prepare('DELETE FROM schema_migrations WHERE version = 4').run();
  assert.throws(() => seedDevelopment(database, 'development'), /migrações pendentes/);
});

test('modelo, dados e chaves de idempotência persistem ao reabrir o arquivo', (t) => {
  const directory = temporaryDirectory(t);
  const path = join(directory, 'persistence.sqlite');
  let database;
  try {
    database = openDatabase(path);
    migrate(database);
    seedDevelopment(database, 'development');
    confirm(database, 1);
    const before = snapshot(database);
    database.close();
    database = openDatabase(path);
    assert.deepEqual(snapshot(database), before);
    assert.equal(migrate(database).applied.length, 0);
    seedDevelopment(database, 'development');
    assert.deepEqual(snapshot(database), before);
    assert.deepEqual(database.pragma('foreign_key_check'), []);
    assert.equal(database.pragma('integrity_check', { simple: true }), 'ok');
  } finally {
    if (database?.open) database.close();
  }
});

test('CLI de produção recusa seed antes de criar arquivo de banco', async (t) => {
  const directory = temporaryDirectory(t);
  const path = join(directory, 'forbidden.sqlite');
  await assert.rejects(execute(process.execPath, [resolve(backendDirectory, 'src/db/cli.js'), 'seed'], {
    cwd: backendDirectory,
    env: { ...process.env, ...testEnvironment, NODE_ENV: 'production', CORS_ORIGINS: 'https://example.com', DATABASE_PATH: path },
    timeout: 10000,
  }), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /somente com NODE_ENV=development/);
    return true;
  });
  assert.equal(existsSync(path), false);
});

test('CLI aplica migrações e seed sem depender do diretório de trabalho', async (t) => {
  const directory = temporaryDirectory(t);
  const path = join(directory, 'cli.sqlite');
  const options = {
    cwd: directory,
    env: { ...process.env, ...testEnvironment, NODE_ENV: 'development', DATABASE_PATH: path },
    timeout: 10000,
  };
  const cli = resolve(backendDirectory, 'src/db/cli.js');
  const migrated = await execute(process.execPath, [cli, 'migrate'], options);
  assert.equal(JSON.parse(migrated.stdout).currentVersion, 4);
  const seeded = await execute(process.execPath, [cli, 'seed'], options);
  assert.equal(JSON.parse(seeded.stdout).inserted.ingressos, 22);
  const repeated = await execute(process.execPath, [cli, 'seed'], options);
  assert.equal(JSON.parse(repeated.stdout).inserted.ingressos, 0);
});
