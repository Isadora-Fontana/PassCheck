import { Router } from 'express';
import { assertDatabaseReady } from '../db/readiness.js';
import { databaseAccess } from '../db/access.js';

export function healthRoutes(database) {
  const router = Router();

  router.get('/health', async (_request, response) => {
    if (database.dialect === 'postgres') await database.query('SELECT 1 AS ok');
    else await databaseAccess(database).sqlite(() => database.prepare('SELECT 1 AS ok').get());
    response.json({ status: 'ok', database: 'ok' });
  });

  router.get('/ready', async (_request, response) => {
    try {
      if (database.dialect === 'postgres') await assertDatabaseReady(database);
      else await databaseAccess(database).sqlite(() => assertDatabaseReady(database));
      response.json({ status: 'ready', database: 'ok' });
    } catch {
      // Endpoint público: não expor SQL, caminhos, checksums ou nomes internos.
      response.set('Retry-After', '5').status(503).json({ status: 'not_ready' });
    }
  });

  return router;
}
