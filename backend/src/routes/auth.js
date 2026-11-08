import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../middleware/errors.js';
import { credenciaisSchema, dispositivoSchema } from '../validation/identidade.js';

function validar(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, 'DADOS_INVALIDOS', 'Dados inválidos.');
  return result.data;
}

export function authRoutes(service, autenticar) {
  const router = Router();
  router.post('/auth/login', async (request, response) => {
    response.json(await service.login(validar(credenciaisSchema, request.body)));
  });
  router.get('/auth/me', autenticar, async (request, response) => response.json(await service.me(request.identidade)));
  router.post('/auth/logout', autenticar, async (request, response) => {
    await service.logout(request.identidade);
    response.sendStatus(204);
  });
  router.post('/auth/instalacoes', async (request, response) => {
    const { dispositivo } = validar(z.object({ dispositivo: dispositivoSchema }).strict(), request.body);
    response.json(await service.registrar(request.identidade, dispositivo));
  });
  return router;
}
