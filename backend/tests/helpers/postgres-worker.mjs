import { readConfig } from '../../src/config.js';
import { startServer } from '../../src/server.js';

let running;
try {
  // Sem loadConfig: nunca carregar backend/.env em testes de subprocesso.
  const config = readConfig({ ...process.env, NODE_ENV: 'test', DATABASE_ENGINE: 'postgres',
    DATABASE_URL: process.env.TEST_DATABASE_URL, HOST: '127.0.0.1', PORT: '3000' });
  running = await startServer({ ...config, port: 0 }, { logger: { error() {} } });
  process.send({ type: 'ready', port: running.server.address().port });
  process.on('message', async (message) => {
    if (message === 'close') {
      try { await running.close(); process.disconnect(); }
      catch { process.exitCode = 1; process.disconnect(); }
    }
  });
} catch {
  process.send?.({ type: 'error' });
  process.exitCode = 1;
  process.disconnect?.();
}
