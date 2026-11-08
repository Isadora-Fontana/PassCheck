// Preparação local explícita. Não executada no start de produção.
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadConfig } from '../backend/src/config.js';
import { backupDatabase } from '../backend/src/db/backup.js';
import { resolve } from 'node:path';

const backend = fileURLToPath(new URL('../backend/', import.meta.url));
const env = new URL('../backend/.env', import.meta.url);
if (!existsSync(env)) {
  writeFileSync(env, [
    'NODE_ENV=development', 'HOST=127.0.0.1', 'PORT=3000',
    'DATABASE_PATH=./data/passcheck.sqlite', 'FRONTEND_DIST=../frontend/dist',
    'CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173',
    'JWT_SECRET=' + randomBytes(32).toString('base64url'), 'JWT_TTL_SECONDS=900', '',
  ].join('\n'), { flag: 'wx', mode: 0o600 });
  console.log('backend/.env criado com segredo aleatório; mantenha o arquivo privado.');
} else console.log('backend/.env existente preservado.');
const config = loadConfig();
if (config.databaseEngine === 'postgres') {
  console.error('Setup automático disponível somente para SQLite. Para PostgreSQL, siga o plano de backup, migrações e importação documentado no backend.');
  process.exit(1);
}
if (existsSync(config.databasePath)) {
  const target = await backupDatabase(config.databasePath, resolve(backend, 'backups'));
  console.log('Backup antes das migrações:', target);
}
const result = spawnSync(process.execPath, ['src/db/cli.js', 'migrate'], { cwd: backend, stdio: 'inherit' });
if (result.error || result.status !== 0) process.exitCode = 1;
else console.log('Banco preparado. Crie o primeiro administrador com npm run admin; depois npm run build e npm start.');
