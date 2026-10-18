import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

export function openDatabase(databasePath) {
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });

  const database = new Database(databasePath, { timeout: 5000 });
  try {
    database.pragma('foreign_keys = ON');
    database.pragma('recursive_triggers = ON');
    database.pragma('journal_mode = WAL');
    database.prepare('SELECT 1').get();
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
