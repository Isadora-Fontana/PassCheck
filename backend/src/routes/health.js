import { Router } from 'express';

export function healthRoutes(database) {
  const router = Router();

  router.get('/health', (_request, response) => {
    database.prepare('SELECT 1 AS ok').get();
    response.json({ status: 'ok', database: 'ok' });
  });

  return router;
}
