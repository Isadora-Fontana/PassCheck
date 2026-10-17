import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApp } from './app.js';
import { ConfigurationError, loadConfig } from './config.js';
import { openDatabase } from './db/connection.js';

export async function startServer(config, { logger = console } = {}) {
  const database = openDatabase(config.databasePath);
  let server;
  try {
    const app = createApp({ config, database, logger });
    server = createServer(app);
    await new Promise((resolveListen, reject) => {
      server.once('error', reject);
      server.listen(config.port, config.host, () => {
        server.removeListener('error', reject);
        resolveListen();
      });
    });
  } catch (error) {
    database.close();
    throw error;
  }

  let closing;
  function close() {
    closing ??= new Promise((resolveClose, reject) => {
      server.close((error) => {
        database.close();
        if (error) reject(error);
        else resolveClose();
      });
    });
    return closing;
  }

  return { server, database, close };
}

async function main() {
  try {
    const running = await startServer(loadConfig());
    const address = running.server.address();
    const host = address.family === 'IPv6' ? `[${address.address}]` : address.address;
    console.log(`PassCheck API em http://${host}:${address.port}`);

    let stopping = false;
    const shutdown = async () => {
      if (stopping) return;
      stopping = true;
      const timeout = setTimeout(() => running.server.closeAllConnections(), 5000);
      timeout.unref();
      try {
        await running.close();
      } catch {
        console.error('Falha ao encerrar a API.');
        process.exitCode = 1;
      } finally {
        clearTimeout(timeout);
      }
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  } catch (error) {
    const message = error instanceof ConfigurationError ? error.message
      : error.code === 'EADDRINUSE' ? 'Porta já está em uso. Verifique PORT.'
        : 'Verifique o arquivo .env, o caminho/permissões do SQLite e a disponibilidade do endereço HTTP.';
    console.error(`Falha ao iniciar a API. ${message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
