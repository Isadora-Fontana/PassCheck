import { readFileSync } from 'node:fs';
import { ConfigurationError } from '../../configuration-error.js';

const invalid = (field) => new ConfigurationError(`Configuração PostgreSQL inválida. Verifique: ${field}.`);

function integer(environment, field, fallback, max) {
  const value = environment[field] ?? String(fallback);
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max) throw invalid(field);
  return Number(value);
}

export function readPostgresConfig(environment = process.env) {
  let url;
  try { url = new URL(environment.DATABASE_URL); } catch { throw invalid('DATABASE_URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username
    || !url.password || !/^\/[^/]+$/.test(url.pathname) || url.hash || url.search) {
    // Parâmetros SSL na URL podem sobrescrever a validação de certificados do pg.
    throw invalid('DATABASE_URL');
  }
  const schema = environment.DATABASE_SCHEMA ?? 'passcheck';
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema) || /^(pg_|public$|information_schema$|auth$|storage$)/.test(schema)) {
    throw invalid('DATABASE_SCHEMA');
  }
  const mode = environment.PG_SSL_MODE ?? 'verify-full';
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const development = ['development', 'test'].includes(environment.NODE_ENV);
  if (!['verify-full', 'require', 'disable'].includes(mode)
    || (mode === 'require' && !development)
    || (mode === 'disable' && (!local || !development))) {
    throw invalid('PG_SSL_MODE');
  }
  let ca;
  if (environment.PG_SSL_CA_FILE) {
    if (mode !== 'verify-full') throw invalid('PG_SSL_CA_FILE');
    try { ca = readFileSync(environment.PG_SSL_CA_FILE, 'utf8'); } catch { throw invalid('PG_SSL_CA_FILE'); }
  }
  return {
    schema,
    connectionString: url.href,
    ssl: mode === 'disable' ? false : { rejectUnauthorized: mode === 'verify-full', ...(ca ? { ca } : {}) },
    max: integer(environment, 'PG_POOL_MAX', 5, 50),
    connectionTimeoutMillis: integer(environment, 'PG_CONNECT_TIMEOUT_MS', 5000, 60000),
    idleTimeoutMillis: integer(environment, 'PG_IDLE_TIMEOUT_MS', 30000, 300000),
    statementTimeoutMillis: integer(environment, 'PG_STATEMENT_TIMEOUT_MS', 15000, 300000),
    lockTimeoutMillis: integer(environment, 'PG_LOCK_TIMEOUT_MS', 5000, 60000),
  };
}
