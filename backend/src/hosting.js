import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from './app.js';

// Mesmo contrato da API em /api; as rotas originais continuam disponíveis.
// A PWA usa hash nas rotas e não precisa de fallback para caminhos inexistentes.
export function createHostingApp(options) {
  const app = express();
  const api = createApp(options);
  app.disable('x-powered-by');
  app.use((_request, response, next) => {
    response.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()' });
    next();
  });
  app.use('/api', api);
  const directory = options.config.frontendPath;
  if (directory && existsSync(join(directory, 'index.html'))) {
    app.use(express.static(directory, {
      dotfiles: 'deny', redirect: false, index: 'index.html',
      setHeaders(response, path) {
        response.setHeader('Cache-Control', /[\\/]assets[\\/]/.test(path)
          ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    }));
  } else if (options.config.nodeEnv === 'production') {
    throw new Error('Build do frontend ausente. Execute npm run build ou configure FRONTEND_DIST.');
  }
  app.use(api);
  return app;
}
