import { openDatabase } from './connection.js';
import { openPostgres } from './postgres/connection.js';
import { databaseAccess } from './access.js';
import { assertMigrationsCurrent } from './migrate.js';
import { assertPostgresMigrationsCurrent } from './postgres/migrate.js';
import { ConfigurationError } from '../configuration-error.js';

export async function openConfiguredDatabase(config, options) {
  if (config.databaseEngine !== undefined && !['sqlite', 'postgres'].includes(config.databaseEngine)) {
    throw new ConfigurationError('Configuração inválida. Verifique: DATABASE_ENGINE.');
  }
  return config.databaseEngine === 'postgres' ? openPostgres(config.postgres, options) : openDatabase(config.databasePath);
}

export async function assertCurrentMigrations(database) {
  const access = databaseAccess(database);
  if (database.dialect === 'postgres') {
    await access.transaction(() => assertPostgresMigrationsCurrent(access), { readOnly: true });
  } else await access.sqlite(() => assertMigrationsCurrent(database));
}
