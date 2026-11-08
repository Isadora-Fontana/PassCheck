import Database from 'better-sqlite3';
import { mkdirSync, openSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// SQLite Online Backup inclui os commits do WAL, mesmo com a API em execução.
export async function backupDatabase(databasePath, directory) {
  mkdirSync(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = join(directory, 'passcheck-' + stamp + '-' + randomUUID() + '.sqlite');
  const source = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    source.pragma('query_only = ON');
    closeSync(openSync(target, 'wx', 0o600));
    await source.backup(target);
    const copy = new Database(target, { readonly: true, fileMustExist: true });
    try {
      if (copy.pragma('integrity_check', { simple: true }) !== 'ok' || copy.pragma('foreign_key_check').length) {
        throw new Error('Backup não passou na verificação de integridade.');
      }
    } finally { copy.close(); }
    return target;
  } finally { source.close(); }
}
