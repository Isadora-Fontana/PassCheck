import { randomUUID } from 'node:crypto';
import { MIMEType } from 'node:util';
import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../middleware/errors.js';
import { dispositivoSchema } from '../validation/identidade.js';

const positiveId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const utcDate = z.string()
  .regex(/^(?!0000)[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{3})?Z$/)
  .refine((value) => {
    const time = Date.parse(value);
    return Number.isFinite(time) && new Date(time).toISOString() === value.replace(/(?<=:[0-9]{2})Z$/, '.000Z');
  })
  .transform((value) => new Date(value).toISOString());

const itemSchema = z.object({
  idLocal: z.string().regex(/^[1-9][0-9]*$/)
    .refine((value) => Number.isSafeInteger(Number(value)) && String(Number(value)) === value),
  ingressoId: positiveId,
  codigo: z.string().min(1).max(128).refine((value) => value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value)),
  dataHora: utcDate,
}).strict();

const batchSchema = z.object({
  eventoId: positiveId,
  portaoId: positiveId,
  dispositivo: dispositivoSchema,
  validacoes: z.array(itemSchema).min(1).max(100)
    .refine((items) => new Set(items.map((item) => item.idLocal)).size === items.length),
}).strict();

export function exigirJsonSincronizacao(request, _response, next) {
  let media;
  try { media = new MIMEType(request.get('Content-Type')); } catch { /* Tipo ausente ou inválido. */ }
  if (media?.essence !== 'application/json' || (media.params.get('charset') ?? 'utf-8').toLowerCase() !== 'utf-8') {
    throw new HttpError(415, 'TIPO_DE_CONTEUDO_INVALIDO', 'Envie o corpo como application/json em UTF-8.');
  }
  next();
}

export function sincronizacaoRoutes(service) {
  const router = Router();
  router.post('/sincronizacao', (request, response) => {
    if (Array.isArray(request.body?.validacoes) && request.body.validacoes.length > 100) {
      throw new HttpError(413, 'LOTE_MUITO_GRANDE', 'Lote excede o limite de 100 itens.');
    }
    const result = batchSchema.safeParse(request.body);
    if (!result.success) throw new HttpError(400, 'LOTE_INVALIDO', 'Lote de validações inválido.');
    response.json(service.sincronizar(result.data, randomUUID(), request.identidade));
  });
  return router;
}
