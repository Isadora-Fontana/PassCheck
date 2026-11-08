import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { migratePostgres, readPostgresMigrations, postgresMigrationsDirectory } from '../src/db/postgres/migrate.js';
import { seedPostgresDevelopment } from '../src/db/postgres/seed.js';
import { importSqlite, readSqliteSnapshot, transferTables } from '../src/db/postgres/import-sqlite.js';
import { temporaryDirectory } from './helpers/database.js';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { seedDevelopment } from '../src/db/seeds/development.js';
import { inspectPostgresTarget, verifyImportedData } from '../src/db/postgres/deployment.js';

import { postgresTestsEnabled as enabled, isolatedPostgres as isolatedDatabase } from './helpers/postgres.js';

test('PostgreSQL real: migrations, seed, integridade, rollback e concorrência', {
  skip: !enabled && 'Defina TEST_DATABASE_URL e PASSCHECK_PG_TEST_WRITE=1 em um banco exclusivo de testes.',
}, async (t) => {
  const database = await isolatedDatabase(t);
  assert.equal((await inspectPostgresTarget(database)).state, 'schema_absent');
  await t.test('dois migradores concorrentes aplicam uma vez; repetir preserva histórico', async () => {
    const results = await Promise.all([migratePostgres(database), migratePostgres(database)]);
    assert.deepEqual(results.map((r) => r.applied.length).sort(), [0, 7]);
    const before = await database.query('SELECT * FROM schema_migrations ORDER BY version');
    assert.deepEqual(await migratePostgres(database), { applied: [], currentVersion: 7 });
    assert.deepEqual((await database.query('SELECT * FROM schema_migrations ORDER BY version')).rows, before.rows);
    const inspection = await inspectPostgresTarget(database);
    assert.equal(inspection.state, 'empty_with_current_history');
    assert.equal(inspection.readOnly, true);
    assert.equal(inspection.publicSchemaUsage, false);
    await database.query(`GRANT USAGE ON SCHEMA "${database.schema}" TO PUBLIC`);
    try { assert.equal((await inspectPostgresTarget(database)).publicSchemaUsage, true); }
    finally { await database.query(`REVOKE USAGE ON SCHEMA "${database.schema}" FROM PUBLIC`); }
  });
  await t.test('falha de DDL e checksum divergente não deixam alterações parciais', async () => {
    const directory = temporaryDirectory(t);
    for (const { name } of readPostgresMigrations()) copyFileSync(join(postgresMigrationsDirectory, name), join(directory, name));
    writeFileSync(join(directory, '008_failure.sql'), 'CREATE TABLE migration_probe (id INTEGER); SELECT * FROM tabela_inexistente;');
    await assert.rejects(migratePostgres(database, directory));
    assert.equal((await database.query("SELECT to_regclass('migration_probe') AS relation")).rows[0].relation, null);
    assert.equal((await database.query('SELECT count(*) AS n FROM schema_migrations')).rows[0].n, 7);
    writeFileSync(join(directory, '001_modelo_central.sql'), 'SELECT 1;');
    await assert.rejects(migratePostgres(database, directory), /Histórico de migrações divergente/);
  });
  await t.test('seed idempotente mantém dados e ajusta sequências dos IDs explícitos', async () => {
    assert.deepEqual((await seedPostgresDevelopment(database, 'development')).inserted,
      { eventos: 3, portoes: 6, ingressos: 22, recebimentos: 2, validacoes: 2 });
    const before = (await database.query('SELECT * FROM validacoes ORDER BY id')).rows;
    assert.deepEqual((await seedPostgresDevelopment(database, 'development')).inserted,
      { eventos: 0, portoes: 0, ingressos: 0, recebimentos: 0, validacoes: 0 });
    assert.deepEqual((await database.query('SELECT * FROM validacoes ORDER BY id')).rows, before);
    const event = await database.query("INSERT INTO eventos (nome, data, local) VALUES ('Teste', '2026-11-20', 'Campus') RETURNING id");
    assert.equal(event.rows[0].id, 4);
    assert.equal((await inspectPostgresTarget(database)).state, 'target_populated');
  });
  await t.test('unicidade global, FK composta, datas e JSON inválidos são rejeitados', async () => {
    for (const [sql, code] of [
      ["UPDATE ingressos SET codigo = (SELECT codigo FROM ingressos WHERE id = 1) WHERE id = 13", '23505'],
      ['UPDATE ingressos SET portao_id = 4 WHERE id = 1', '23503'],
      ["UPDATE eventos SET data = '2026-02-30' WHERE id = 1", '23514'],
      ["INSERT INTO recebimentos (dispositivo,id_local,conteudo_normalizado,status) VALUES ('test','bad','[]','CONFIRMADA')", '23514'],
    ]) await assert.rejects(database.query(sql), { code });
  });
  await t.test('rollback desfaz recibo, confirmação e utilizado', async () => {
    await assert.rejects(database.transaction(async (tx) => {
      const receipt = await tx.query(`INSERT INTO recebimentos (dispositivo,id_local,conteudo_normalizado,status)
        VALUES ('rollback-test','1','{}','CONFIRMADA') RETURNING id`);
      await tx.query('INSERT INTO validacoes (ingresso_id,recebimento_id) VALUES (1,$1)', [receipt.rows[0].id]);
      assert.equal((await tx.query('SELECT utilizado FROM ingressos WHERE id = 1')).rows[0].utilizado, 1);
      throw new Error('rollback requested');
    }), /rollback requested/);
    assert.equal((await database.query('SELECT utilizado FROM ingressos WHERE id = 1')).rows[0].utilizado, 0);
    assert.equal((await database.query("SELECT count(*) AS n FROM recebimentos WHERE dispositivo='rollback-test'")).rows[0].n, 0);
  });
  await t.test('históricos rejeitam UPDATE, DELETE e TRUNCATE; token é revogado', async () => {
    for (const sql of ['UPDATE recebimentos SET id_local=id_local WHERE id=1', 'DELETE FROM validacoes WHERE id=1',
      'TRUNCATE recebimentos CASCADE', 'UPDATE ingressos SET utilizado=0 WHERE id=4']) {
      await assert.rejects(database.query(sql), { code: '23514' });
    }
    await database.query("INSERT INTO usuarios(usuario,senha_hash,papel) VALUES ('teste','hash-ficticio','ADMINISTRADOR')");
    await database.query("UPDATE usuarios SET ativo=0 WHERE usuario='teste'");
    assert.equal((await database.query("SELECT versao_token FROM usuarios WHERE usuario='teste'")).rows[0].versao_token, 1);
  });
  await t.test('duas transações concorrentes não confirmam o mesmo ingresso', async () => {
    const attempt = (device) => database.transaction(async (tx) => {
      const receipt = await tx.query(`INSERT INTO recebimentos (dispositivo,id_local,conteudo_normalizado,status)
        VALUES ($1,'1','{}','CONFIRMADA') RETURNING id`, [device]);
      await tx.query('INSERT INTO validacoes (ingresso_id,recebimento_id) VALUES (1,$1)', [receipt.rows[0].id]);
    });
    const results = await Promise.allSettled([attempt('race-a'), attempt('race-b')]);
    assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
    assert.equal(results.find(({ status }) => status === 'rejected').reason.code, '23505');
    assert.equal((await database.query('SELECT count(*) AS n FROM validacoes WHERE ingresso_id=1')).rows[0].n, 1);
  });
});

test('PostgreSQL real: transferência conserva registros SQLite e rejeita destino ocupado', {
  skip: !enabled && 'Exige PostgreSQL exclusivo de testes e autorização de escrita por variável.',
}, async (t) => {
  const database = await isolatedDatabase(t);
  await migratePostgres(database);
  const path = join(temporaryDirectory(t), 'source.sqlite');
  const source = openDatabase(path);
  try {
    migrate(source);
    seedDevelopment(source, 'development');
    source.exec(`INSERT INTO usuarios (id,usuario,senha_hash,papel,versao_token) VALUES (7,'admin-teste','hash-ficticio','ADMINISTRADOR',4);
      INSERT INTO instalacoes(dispositivo,usuario_id) VALUES ('device-test',7);
      INSERT INTO usuarios_eventos VALUES (7,1); INSERT INTO usuarios_portoes VALUES (7,1,1);
      INSERT INTO recebimentos(id,dispositivo,id_local,conteudo_normalizado,status,motivo)
        VALUES (9,'device-test','9','{"eventoId":1}','CONFLITO','INGRESSO_JA_UTILIZADO');
      INSERT INTO resolucoes_administrativas(id,recebimento_id,administrador_id,justificativa)
        VALUES (5,9,7,'Revisão de teste preservada.');`);
    source.prepare(`INSERT INTO auditoria_divergencias(recebimento_id,correlacao_id,motivo,hash_original,hash_apresentado)
      VALUES (9,?,'IDEMPOTENCIA_DIVERGENTE',?,?)`).run(randomUUID(), 'a'.repeat(64), 'b'.repeat(64));
  } finally { source.close(); }
  const before = readSqliteSnapshot(path);
  assert.deepEqual((await importSqlite(database, path)).imported, before.counts);
  assert.equal((await verifyImportedData(database, path)).matches, true);
  assert.deepEqual(readSqliteSnapshot(path), before);
  for (const [table, definition] of Object.entries(transferTables)) {
    const ordering = table === 'usuarios_eventos' ? 'usuario_id,evento_id'
      : table === 'usuarios_portoes' ? 'usuario_id,evento_id,portao_id' : table === 'instalacoes' ? 'dispositivo' : 'id';
    assert.deepEqual((await database.query(`SELECT ${definition.split(' ').join(',')} FROM ${table} ORDER BY ${ordering}`)).rows, before.tables[table]);
  }
  const history = (await database.query('SELECT * FROM sqlite_import_history')).rows[0];
  assert.deepEqual(history.source_migrations, before.sourceMigrations);
  await assert.rejects(importSqlite(database, path), /não está vazio/);
  const user = await database.query("INSERT INTO usuarios(usuario,senha_hash,papel) VALUES ('operador-teste','hash-ficticio','OPERADOR') RETURNING id");
  assert.equal(user.rows[0].id, 8);
  const comparison = await verifyImportedData(database, path);
  assert.equal(comparison.matches, false);
  assert.deepEqual(comparison.mismatchedTables, ['usuarios']);
});
