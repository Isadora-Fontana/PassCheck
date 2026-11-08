import { resolve } from 'node:path';
import { loadConfig, backendDirectory } from '../config.js';
import { backupDatabase } from './backup.js';
try {
  const config = loadConfig();
  if (config.databaseEngine === 'postgres') {
    console.error('Este comando faz backup somente de SQLite. Para PostgreSQL, use a rotina de backup/restauração do provedor ou pg_dump.');
    process.exitCode = 1;
  } else {
    const target = await backupDatabase(config.databasePath, process.argv[2] ? resolve(process.argv[2]) : resolve(backendDirectory, 'backups'));
    console.log('Backup consistente e íntegro criado:', target);
  }
} catch {
  console.error('Backup não concluído. Verifique configuração, banco e permissões; preserve os arquivos existentes.');
  process.exitCode = 1;
}
