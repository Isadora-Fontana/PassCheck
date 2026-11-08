import { randomUUID } from 'node:crypto';
import { readPostgresConfig } from '../../src/db/postgres/config.js';
import { openPostgres } from '../../src/db/postgres/connection.js';

export const postgresTestsEnabled = Boolean(process.env.TEST_DATABASE_URL) && process.env.PASSCHECK_PG_TEST_WRITE === '1';

export async function isolatedPostgres(t) {
  if (!postgresTestsEnabled) throw new Error('PostgreSQL de testes não autorizado/configurado.');
  const schema = `passcheck_test_${randomUUID().replaceAll('-', '')}`;
  const database = await openPostgres(readPostgresConfig({ ...process.env, NODE_ENV: 'test',
    DATABASE_URL: process.env.TEST_DATABASE_URL, DATABASE_SCHEMA: schema, PG_POOL_MAX: '3' }));
  const { rows } = await database.query('SELECT 1 FROM pg_namespace WHERE nspname = $1', [schema]);
  if (rows.length) { await database.close(); throw new Error('Schema de teste já existe.'); }
  t.after(async () => {
    try {
      if (!/^passcheck_test_[0-9a-f]{32}$/.test(schema)) throw new Error('Schema de teste inválido.');
      await database.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally { await database.close(); }
  });
  return database;
}
