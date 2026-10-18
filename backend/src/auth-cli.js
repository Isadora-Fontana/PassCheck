import { loadConfig } from './config.js';
import { openDatabase } from './db/connection.js';
import { provisionar } from './services/provisionamento.js';

let database;
try {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > 16384) throw new Error('Limite excedido.');
    chunks.push(chunk);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const config = loadConfig();
  database = openDatabase(config.databasePath);
  console.log(JSON.stringify(await provisionar(database, process.argv[2], body)));
} catch {
  console.error('Provisionamento recusado. Confira comando, migrações, campos, unicidade e vínculos. Nenhuma conta foi substituída.');
  process.exitCode = 1;
} finally { database?.close(); }
