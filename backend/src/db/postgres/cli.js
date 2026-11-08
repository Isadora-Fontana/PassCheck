import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { backendDirectory, ConfigurationError } from '../../config.js';
import { DatabaseTaskError } from '../errors.js';
import { readPostgresConfig } from './config.js';
import { openPostgres } from './connection.js';
import { migratePostgres } from './migrate.js';
import { assertPostgresReady } from './readiness.js';
import { seedPostgresDevelopment } from './seed.js';
import { importSqlite } from './import-sqlite.js';

let database;
try {
  const command = process.argv[2];
  if (!['check', 'migrate', 'seed', 'import-sqlite'].includes(command) || process.argv.length !== 3) {
    throw new DatabaseTaskError('Use db:pg:check, db:pg:migrate, db:pg:seed ou db:pg:import-sqlite.');
  }
  const envPath = resolve(backendDirectory, '.env');
  if (existsSync(envPath)) loadEnvFile(envPath);
  if (command === 'seed' && process.env.NODE_ENV !== 'development') {
    throw new DatabaseTaskError('Seed permitido somente com NODE_ENV=development.');
  }
  if (command === 'import-sqlite' && (!process.env.DATABASE_PATH || process.env.DATABASE_PATH === ':memory:')) {
    throw new DatabaseTaskError('Importação exige DATABASE_PATH explícito apontando para o arquivo de origem.');
  }
  database = await openPostgres(readPostgresConfig());
  const result = command === 'migrate' ? await migratePostgres(database)
    : command === 'seed' ? await seedPostgresDevelopment(database, process.env.NODE_ENV)
      : command === 'import-sqlite' ? await importSqlite(database, resolve(backendDirectory, process.env.DATABASE_PATH))
      : await (async () => {
        await assertPostgresReady(database);
        return { status: 'ok', migrations: 'current', structure: 'ready' };
      })();
  console.log(JSON.stringify({ command, ...result }));
} catch (error) {
  // Nunca imprimir error.detail, SQL, URL, senha, dados ou mensagem do servidor.
  console.error(error instanceof ConfigurationError || error instanceof DatabaseTaskError
    ? error.message : 'Falha PostgreSQL. Verifique conexão, certificado, permissões e migrações.');
  process.exitCode = 1;
} finally {
  try { await database?.close(); } catch {
    console.error('Falha ao encerrar conexão PostgreSQL.');
    process.exitCode = 1;
  }
}
