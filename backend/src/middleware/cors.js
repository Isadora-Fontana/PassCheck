import cors from 'cors';
import { HttpError } from './errors.js';

export function restrictedCors(origins) {
  const allowed = new Set(origins);
  return cors({
    origin(origin, callback) {
      // Clientes sem Origin (curl, testes e serviços) não dependem de CORS.
      if (!origin || allowed.has(origin)) return callback(null, true);
      return callback(new HttpError(403, 'ORIGEM_NAO_PERMITIDA', 'Origem não permitida.'));
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
    maxAge: 600,
  });
}
