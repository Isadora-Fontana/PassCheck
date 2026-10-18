import { mkdtempSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../../src/db/connection.js';
import { migrate } from '../../src/db/migrate.js';
import { seedDevelopment } from '../../src/db/seeds/development.js';

export function temporaryDirectory(t) {
  const directory = mkdtempSync(join(tmpdir(), 'passcheck-stage2-'));
  t.after(() => {
    // Somente arquivos gerados neste diretório temporário exclusivo; sem recursão.
    for (const file of readdirSync(directory)) unlinkSync(join(directory, file));
    rmdirSync(directory);
  });
  return directory;
}

export function memoryDatabase(t, { seed = true } = {}) {
  const database = openDatabase(':memory:');
  t.after(() => database.close());
  migrate(database);
  if (seed) seedDevelopment(database, 'development');
  return database;
}

export function snapshot(database) {
  return Object.fromEntries(['eventos', 'portoes', 'ingressos', 'recebimentos', 'validacoes']
    .map((table) => [table, database.prepare(`SELECT * FROM ${table} ORDER BY id`).all()]));
}

// Apenas dados fictícios derivados dos mocks; não é um serviço de sincronização.
export function receipt(database, { ticketId = 1, device = 'test-device', localId = String(ticketId), status = 'CONFIRMADA' } = {}) {
  const ticket = database.prepare('SELECT * FROM ingressos WHERE id = ?').get(ticketId);
  const content = JSON.stringify({
    ingressoId: ticket.id, codigo: ticket.codigo, eventoId: ticket.evento_id,
    portaoId: ticket.portao_id, dataHora: null,
  });
  return database.prepare(`INSERT INTO recebimentos
    (dispositivo, id_local, conteudo_normalizado, status, motivo) VALUES (?, ?, ?, ?, ?)`)
    .run(device, localId, content, status, status === 'CONFIRMADA' ? null : 'TESTE_CONTROLADO').lastInsertRowid;
}

export function confirm(database, ticketId = 1) {
  return database.transaction(() => {
    const receiptId = receipt(database, { ticketId });
    return database.prepare('INSERT INTO validacoes (ingresso_id, recebimento_id) VALUES (?, ?)').run(ticketId, receiptId);
  })();
}
