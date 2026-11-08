import express from 'express';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import { attachDatabasePool } from '@vercel/functions';
import { readConfig } from './config.js';
import { createApp } from './app.js';
import { openPostgres } from './db/postgres/connection.js';
import { assertPostgresReady } from './db/postgres/readiness.js';

export function vercelClientIp(request) {
  const ip = request.get('x-vercel-forwarded-for');
  if (typeof ip !== 'string' || ip.includes('%') || !isIP(ip)) throw new Error('IP confiável indisponível.');
  return ip;
}

// Inicialização única por instância; não carrega .env nem abre SQLite no ambiente hospedado.
export function createVercelHandler({ environment = process.env, open = openPostgres,
  ready = assertPostgresReady, attachPool = attachDatabasePool, apiFactory = createApp, logger = console } = {}) {
  let initialization;
  async function initialize() {
    if (environment.VERCEL !== '1' || environment.NODE_ENV !== 'production'
      || environment.DATABASE_ENGINE !== 'postgres') throw new Error('Ambiente hospedado inválido.');
    const config = readConfig({ ...environment, TRUST_PROXY_HOPS: '0',
      PG_IDLE_TIMEOUT_MS: environment.PG_IDLE_TIMEOUT_MS ?? '5000',
      PG_SSL_CA_FILE: environment.PG_SSL_CA_FILE ?? fileURLToPath(new URL('../certs/prod-ca-2021.crt', import.meta.url)) });
    const database = await open(config.postgres, { logger, onPool: attachPool });
    try {
      await ready(database);
      const app = express();
      app.disable('x-powered-by');
      app.use('/api', apiFactory({ config, database, logger, loginIp: vercelClientIp }));
      app.use((_request, response) => response.status(404).set('Cache-Control', 'no-store').json({ erro: 'ROTA_NAO_ENCONTRADA' }));
      return app;
    } catch (error) { await database.close(); throw error; }
  }
  return async (request, response) => {
    let app;
    try {
      initialization ??= initialize().catch((error) => { initialization = undefined; throw error; });
      app = await initialization;
    } catch {
      logger.error('Inicialização da API hospedada indisponível.');
      response.statusCode = 503;
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Retry-After', '5');
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ erro: 'SERVICO_INDISPONIVEL' }));
      return;
    }
    return app(request, response);
  };
}
