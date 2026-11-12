import express, { Router } from 'express';
import { MIMEType } from 'node:util';
import { HttpError } from '../middleware/errors.js';
import { exigirJsonSincronizacao as exigirJson } from './sincronizacao.js';
import { eventoParams, recebimentoParams, eventoSchema, atualizarEventoSchema,
  portaoSchema, resolucaoSchema, pendenciasQuery, concessaoSchema } from '../validation/administracao.js';

function validar(schema, value, parametro = false) {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, parametro ? 'PARAMETRO_INVALIDO' : 'DADOS_INVALIDOS', 'Dados inválidos.');
  return result.data;
}

function exigirCsv(request, _response, next) {
  let media;
  try { media = new MIMEType(request.get('Content-Type')); } catch { /* Formato inválido. */ }
  if (media?.essence !== 'text/csv' || (media.params.get('charset') ?? 'utf-8').toLowerCase() !== 'utf-8'
    || (request.get('Content-Encoding') ?? 'identity').toLowerCase() !== 'identity') {
    throw new HttpError(415, 'TIPO_DE_CONTEUDO_INVALIDO', 'Envie CSV em UTF-8 sem compressão.');
  }
  next();
}

export function administracaoRoutes(service, autenticar, identidade) {
  const router = Router();
  const admin = [autenticar, async (request, _response, next) => { await identidade.exigirAdministrador(request.identidade); next(); }];
  const json = [exigirJson, express.json({ limit: 102400 })];
  const eventoId = (request) => validar(eventoParams, request.params, true).eventoId;
  router.post('/eventos', ...admin, ...json, async (request, response) => {
    response.status(201).json(await service.criarEvento(request.identidade, validar(eventoSchema, request.body)));
  });
  router.patch('/eventos/:eventoId', ...admin, ...json, async (request, response) => {
    response.json(await service.atualizarEvento(request.identidade, eventoId(request), validar(atualizarEventoSchema, request.body)));
  });
  router.post('/eventos/:eventoId/portoes', ...admin, ...json, async (request, response) => {
    response.status(201).json(await service.criarPortao(request.identidade, eventoId(request), validar(portaoSchema, request.body)));
  });
  // Concede ao operador o evento e UM portão (substitui o portão anterior neste evento).
  router.post('/eventos/:eventoId/operadores', ...admin, ...json, async (request, response) => {
    response.json(await service.concederOperador(request.identidade, eventoId(request), validar(concessaoSchema, request.body)));
  });
  router.post('/eventos/:eventoId/ingressos/importar', ...admin, exigirCsv,
    express.raw({ type: () => true, limit: 102400, inflate: false }), async (request, response) => {
      response.status(201).json(await service.importar(request.identidade, eventoId(request), request.body ?? Buffer.alloc(0)));
    });
  router.get('/eventos/:eventoId/pendencias', ...admin, async (request, response) => {
    response.json(await service.listarPendencias(request.identidade, eventoId(request), validar(pendenciasQuery, request.query, true)));
  });
  router.post('/pendencias/:recebimentoId/resolver', ...admin, ...json, async (request, response) => {
    const { recebimentoId } = validar(recebimentoParams, request.params, true);
    response.status(201).json(await service.resolver(request.identidade, recebimentoId, validar(resolucaoSchema, request.body)));
  });
  return router;
}
