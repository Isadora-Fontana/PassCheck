import { HttpError } from './errors.js';
import { createLoginLimit } from '../services/login-limit.js';

export function autenticar(service) {
  return async (request, _response, next) => {
    request.identidade = await service.autenticar(request.get('Authorization'));
    next();
  };
}

export function limitarLogin({ database, secret, getIp = (request) => request.ip }) {
  const consume = createLoginLimit(database, secret);
  return async (request, _response, next) => {
    let result;
    try { result = await consume(getIp(request)); }
    catch {
      // Sem fallback em memória: falha no contador compartilhado não libera login.
      throw new HttpError(503, 'BANCO_INDISPONIVEL', 'Servidor temporariamente indisponível.');
    }
    if (!result.allowed) {
      const error = new HttpError(429, 'LIMITE_DE_TENTATIVAS', 'Tente novamente mais tarde.');
      error.retryAfter = result.retryAfter;
      throw error;
    }
    next();
  };
}
