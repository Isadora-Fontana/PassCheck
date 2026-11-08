import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { backendDirectory, ConfigurationError } from '../../config.js';
import { DatabaseTaskError } from '../errors.js';
import { readPostgresConfig } from './config.js';
import { openPostgres } from './connection.js';
import { inspectSqliteSource, inspectPostgresTarget, verifyImportedData, compareSqliteBackup } from './deployment.js';

let database;
try {
  const command = process.argv[2];
  if (!['preflight', 'verify-import', 'verify-backup'].includes(command)
    || process.argv.length !== (command === 'verify-backup' ? 4 : 3)) {
    throw new DatabaseTaskError('Use db:pg:preflight, db:pg:verify-import ou db:verify-backup -- caminho-do-backup.');
  }
  const envPath = resolve(backendDirectory, '.env');
  if (existsSync(envPath)) loadEnvFile(envPath);
  const path = resolve(backendDirectory, process.env.DATABASE_PATH || './data/passcheck.sqlite');
  let result;
  if (command === 'verify-backup') {
    result = compareSqliteBackup(path, resolve(process.argv[3]));
    if (!result.matches) process.exitCode = 1;
  } else if (command === 'preflight') {
    const source = inspectSqliteSource(path);
    let target = { configured: false, state: 'connection_not_configured' };
    if (process.env.DATABASE_URL?.trim()) {
      database = await openPostgres(readPostgresConfig());
      target = { configured: true, ...await inspectPostgresTarget(database) };
    }
    result = { mode: 'read_only', source, target };
    if (!source.transferCompatible || !target.configured
      || target.publicSchemaUsage || target.apiRolesWithSchemaUsage?.length
      || ['schema_incompatible', 'history_divergent', 'target_populated'].includes(target.state)) process.exitCode = 1;
  } else {
    database = await openPostgres(readPostgresConfig());
    result = await verifyImportedData(database, path);
    if (!result.matches) process.exitCode = 1;
  }
  console.log(JSON.stringify({ command, ...result }, null, 2));
} catch (error) {
  console.error(error instanceof ConfigurationError || error instanceof DatabaseTaskError
    ? error.message : 'Diagnóstico não concluído. Verifique origem, conexão, certificado, permissões e schema; nenhum dado foi alterado.');
  process.exitCode = 1;
} finally {
  try { await database?.close(); } catch { console.error('Falha ao encerrar diagnóstico.'); process.exitCode = 1; }
}
