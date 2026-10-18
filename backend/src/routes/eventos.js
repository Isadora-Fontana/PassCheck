import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../middleware/errors.js';

const positiveId = z.string().regex(/^[0-9]+$/).refine((value) => value === value.trim()).transform(Number)
  .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));
const eventParams = z.object({ eventoId: positiveId });
const ticketParams = eventParams.extend({ portaoId: positiveId });

function parseParams(schema, params) {
  const result = schema.safeParse(params);
  if (!result.success) {
    throw new HttpError(400, 'PARAMETRO_INVALIDO', 'IDs devem ser inteiros positivos até 9007199254740991, escritos apenas com dígitos.');
  }
  return result.data;
}

export function eventosRoutes(service, autenticar, identidade) {
  const router = Router();

  router.get('/eventos', autenticar, (request, response) => {
    response.json(identidade.listarEventos(request.identidade, service));
  });

  router.get('/eventos/:eventoId/resumo', autenticar, (request, response) => {
    const { eventoId } = parseParams(eventParams, request.params);
    identidade.exigirEvento(request.identidade, eventoId);
    response.json(service.obterResumo(eventoId));
  });

  router.get('/eventos/:eventoId/portoes', autenticar, (request, response) => {
    const { eventoId } = parseParams(eventParams, request.params);
    identidade.exigirEvento(request.identidade, eventoId);
    response.json(service.listarPortoes(eventoId));
  });

  router.get('/eventos/:eventoId/portoes/:portaoId/ingressos', autenticar, (request, response) => {
    const { eventoId, portaoId } = parseParams(ticketParams, request.params);
    identidade.exigirEvento(request.identidade, eventoId);
    response.json(service.listarIngressos(eventoId, portaoId));
  });

  return router;
}
