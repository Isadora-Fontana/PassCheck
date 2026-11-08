import express from 'express';
import { restrictedCors } from './middleware/cors.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { healthRoutes } from './routes/health.js';
import { eventosRoutes } from './routes/eventos.js';
import { createEventosRepository } from './repositories/eventos.js';
import { createEventosService } from './services/eventos.js';
import { sincronizacaoRoutes, exigirJsonSincronizacao } from './routes/sincronizacao.js';
import { createSincronizacaoRepository } from './repositories/sincronizacao.js';
import { createSincronizacaoService } from './services/sincronizacao.js';
import { createIdentidadeRepository } from './repositories/identidade.js';
import { createIdentidadeService } from './services/identidade.js';
import { createTokens } from './services/tokens.js';
import { autenticar, limitarLogin } from './middleware/autenticacao.js';
import { authRoutes } from './routes/auth.js';
import { administracaoRoutes } from './routes/administracao.js';
import { createAdministracaoRepository } from './repositories/administracao.js';
import { createAdministracaoService } from './services/administracao.js';

// Criar a aplicação não abre portas nem cria conexões: as dependências são explícitas.
export function createApp({ config, database, logger = console, loginIp }) {
  const app = express();
  const identidade = createIdentidadeService(createIdentidadeRepository(database), createTokens(config), config);
  const autenticacao = autenticar(identidade);
  app.disable('x-powered-by');
  app.disable('etag');
  // Habilitar somente atrás do proxy único e de uma porta de origem restrita.
  app.set('trust proxy', config.trustProxyHops ?? 0);
  app.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  app.use(restrictedCors(config.corsOrigins));
  app.use(administracaoRoutes(createAdministracaoService(createAdministracaoRepository(database), identidade), autenticacao, identidade));
  app.post('/sincronizacao', autenticacao, exigirJsonSincronizacao);
  app.post('/auth/login', limitarLogin({ database, secret: config.jwtSecret, getIp: loginIp }), exigirJsonSincronizacao);
  app.post('/auth/instalacoes', autenticacao, exigirJsonSincronizacao);
  app.use(express.json({ limit: 102400 }));
  app.use(healthRoutes(database));
  app.use(authRoutes(identidade, autenticacao));
  app.use(eventosRoutes(createEventosService(createEventosRepository(database)), autenticacao, identidade));
  app.use(sincronizacaoRoutes(createSincronizacaoService(createSincronizacaoRepository(database), identidade)));
  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
