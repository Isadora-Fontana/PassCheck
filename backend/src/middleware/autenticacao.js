import { HttpError } from './errors.js';

export function autenticar(service) {
  return async (request, _response, next) => {
    request.identidade = await service.autenticar(request.get('Authorization'));
    next();
  };
}

export function limitarLogin() {
  const tentativas = new Map();
  return (request, _response, next) => {
    const now = Date.now();
    for (const [ip, entry] of tentativas) if (entry.ate <= now) tentativas.delete(ip);
    const ip = request.ip;
    const entry = tentativas.get(ip) ?? { total: 0, ate: now + 900000 };
    if (entry.total >= 10 || (!tentativas.has(ip) && tentativas.size >= 1000)) {
      const error = new HttpError(429, 'LIMITE_DE_TENTATIVAS', 'Tente novamente mais tarde.');
      error.retryAfter = entry.total >= 10 ? Math.ceil((entry.ate - now) / 1000) : 1;
      throw error;
    }
    entry.total++;
    tentativas.set(ip, entry);
    next();
  };
}
