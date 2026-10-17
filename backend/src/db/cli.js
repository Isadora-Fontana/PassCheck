import { ConfigurationError, loadConfig } from '../config.js';
import { openDatabase } from './connection.js';
import { migrate } from './migrate.js';
import { seedDevelopment } from './seeds/development.js';
import { DatabaseTaskError } from './errors.js';

let database;
try {
  const command = process.argv[2];
  if (!['migrate', 'seed'].includes(command) || process.argv.length !== 3) {
    throw new DatabaseTaskError('Use npm run db:migrate ou npm run db:seed.');
  }
  const config = loadConfig();
  if (command === 'seed' && config.nodeEnv !== 'development') {
    throw new DatabaseTaskError('Seed permitido somente com NODE_ENV=development.');
  }
  if (config.databasePath === ':memory:') {
    throw new DatabaseTaskError('Comandos de banco exigem DATABASE_PATH persistente; :memory: é reservado aos testes programáticos.');
  }
  database = openDatabase(config.databasePath);
  const result = command === 'migrate' ? migrate(database) : seedDevelopment(database, config.nodeEnv);
  console.log(JSON.stringify({ command, ...result }));
} catch (error) {
  const message = error instanceof ConfigurationError || error instanceof DatabaseTaskError
    ? error.message : 'Falha no banco. A transação foi desfeita; verifique permissões, restrições e migrações.';
  console.error(message);
  process.exitCode = 1;
} finally {
  database?.close();
}
