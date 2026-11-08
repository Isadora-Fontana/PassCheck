import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { isolatedPostgres, postgresTestsEnabled } from './helpers/postgres.js';
import { migratePostgres } from '../src/db/postgres/migrate.js';
import { readPostgresConfig } from '../src/db/postgres/config.js';
import { openPostgres } from '../src/db/postgres/connection.js';
import { createLoginLimit, loginLimitKey } from '../src/services/login-limit.js';
import { createApp } from '../src/app.js';
import { readConfig } from './helpers/config.js';

test('PostgreSQL: limite compartilhado, concorrente, limitado em tamanho e protegido por RLS', {
  skip: !postgresTestsEnabled && 'Exige PostgreSQL isolado e autorização de escrita de testes.',
}, async (t) => {
  const database = await isolatedPostgres(t); await migratePostgres(database);
  const role = 'runtime_test_' + randomBytes(8).toString('hex');
  const guest = 'guest_test_' + randomBytes(8).toString('hex');
  const password = randomBytes(32).toString('base64url');
  const secret = randomBytes(32).toString('base64url');
  const grants = readFileSync(new URL('../../deploy/postgres-runtime-grants.sql', import.meta.url), 'utf8')
    .replaceAll('passcheck_runtime', role).replaceAll('passcheck.', `"${database.schema}".`)
    .replaceAll('SCHEMA passcheck ', `SCHEMA "${database.schema}" `);
  let first, second, guestDb;
  try {
    await database.transaction(async (tx) => {
      await tx.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '${password}'`);
      await tx.query(`CREATE ROLE ${guest} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '${password}'`);
      await tx.query(grants);
      await tx.query(`GRANT USAGE ON SCHEMA "${database.schema}" TO ${guest}`);
      await tx.query(`GRANT SELECT ON login_limites TO ${guest}`);
    });
    const connect = (username) => {
      const url = new URL(process.env.TEST_DATABASE_URL); url.username = username; url.password = password;
      return openPostgres(readPostgresConfig({ ...process.env, NODE_ENV: 'test', DATABASE_URL: url.href,
        DATABASE_SCHEMA: database.schema, PG_POOL_MAX: '3' }));
    };
    first = await connect(role); second = await connect(role); guestDb = await connect(guest);
    const a = createLoginLimit(first, secret), b = createLoginLimit(second, secret);
    await t.test('vinte chamadas em dois pools concedem exatamente dez tentativas', async () => {
      const responses = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? a : b)('192.0.2.1')));
      assert.equal(responses.filter((r) => r.allowed).length, 10);
      assert.equal(responses.filter((r) => !r.allowed).length, 10);
      assert.ok(responses.filter((r) => !r.allowed).every((r) => r.retryAfter >= 1 && r.retryAfter <= 900));
      const rows = (await database.query('SELECT chave,tentativas FROM login_limites')).rows;
      assert.deepEqual(rows, [{ chave: loginLimitKey('192.0.2.1', secret), tentativas: 10 }]);
      assert.equal((await guestDb.query('SELECT count(*) AS n FROM login_limites')).rows[0].n, 0, 'RLS protege mesmo após SELECT acidental a outra role');
      await assert.rejects(createLoginLimit(guestDb, secret)('192.0.2.2'), { code: '42501' });
    });
    await t.test('janela expirada volta a permitir e limpa registros antigos', async () => {
      await database.query("UPDATE login_limites SET expira_em=clock_timestamp()-interval '1 second'");
      assert.equal((await a('192.0.2.1')).allowed, true);
      assert.equal((await database.query('SELECT tentativas FROM login_limites')).rows[0].tentativas, 1);
    });
    await t.test('capacidade compartilhada limita mil chaves, preserva existentes e recupera espaço', async () => {
      await database.query(`INSERT INTO login_limites(chave,tentativas,expira_em)
        SELECT md5(i::text)||md5(i::text),1,clock_timestamp()+interval '15 minutes' FROM generate_series(1,999) i`);
      assert.deepEqual(await a('192.0.2.2'), { allowed: false, retryAfter: 1 });
      assert.equal((await b('192.0.2.1')).allowed, true);
      assert.equal((await database.query('SELECT count(*) AS n FROM login_limites')).rows[0].n, 1000);
      await database.query("UPDATE login_limites SET expira_em=clock_timestamp()-interval '1 second' WHERE chave=md5('1')||md5('1')");
      assert.equal((await b('192.0.2.2')).allowed, true);
      assert.equal((await database.query('SELECT count(*) AS n FROM login_limites')).rows[0].n, 1000);
    });
    await t.test('duas APIs e nova instância compartilham o limite; cabeçalhos falsos não renovam a cota local', async () => {
      await database.query('DELETE FROM login_limites');
      const config = readConfig({ JWT_SECRET: secret });
      const app = (db) => createApp({ config, database: db, logger: { error() {} } });
      const apps = [app(first), app(second)];
      for (let i = 0; i < 10; i++) {
        const response = await request(apps[i % 2]).post('/auth/login')
          .set('x-forwarded-for', `192.0.2.${i + 1}`).set('x-vercel-forwarded-for', `198.51.100.${i + 1}`).send({});
        assert.equal(response.status, 400);
      }
      const response = await request(app(first)).post('/auth/login').send({});
      assert.equal(response.status, 429); assert.ok(Number(response.headers['retry-after']) > 0);
      const failed = await request(app(guestDb)).post('/auth/login').send({});
      assert.equal(failed.status, 503);
    });
  } finally {
    await Promise.all([first?.close(), second?.close(), guestDb?.close()]);
    for (const name of [role, guest]) {
      if ((await database.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [name])).rows.length) {
        await database.query(`DROP OWNED BY ${name}; DROP ROLE ${name}`);
      }
    }
  }
});
