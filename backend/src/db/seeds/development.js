import { eventos, portoes, ingressos } from './mock-data.js';
import { assertMigrationsCurrent } from '../migrate.js';
import { DatabaseTaskError } from '../errors.js';

export const seedDevice = 'seed:frontend:1838a5a';

function verifyExisting(existing, expected, table) {
  if (existing && Object.entries(expected).some(([field, value]) => existing[field] !== value)) {
    throw new DatabaseTaskError(`Seed incompatível com registro existente em ${table}, ID ${expected.id}. Nenhum dado foi sobrescrito.`);
  }
}

export function seedDevelopment(database, nodeEnv) {
  if (nodeEnv !== 'development') throw new DatabaseTaskError('Seed permitido somente com NODE_ENV=development.');
  assertMigrationsCurrent(database);

  return database.transaction(() => {
    const inconsistent = database.prepare(`SELECT 1 FROM ingressos i
      WHERE i.utilizado <> EXISTS (SELECT 1 FROM validacoes v WHERE v.ingresso_id = i.id) LIMIT 1`).get();
    if (inconsistent) throw new DatabaseTaskError('Banco contém estados de utilização inconsistentes; seed cancelado.');

    const inserted = { eventos: 0, portoes: 0, ingressos: 0, recebimentos: 0, validacoes: 0 };
    const findEvent = database.prepare('SELECT id, nome, data, local FROM eventos WHERE id = ?');
    const addEvent = database.prepare('INSERT INTO eventos (id, nome, data, local) VALUES (@id, @nome, @data, @local)');
    for (const event of eventos) {
      const existing = findEvent.get(event.id);
      verifyExisting(existing, event, 'eventos');
      if (!existing) inserted.eventos += addEvent.run(event).changes;
    }

    const findGate = database.prepare('SELECT id, evento_id, nome FROM portoes WHERE id = ?');
    const addGate = database.prepare('INSERT INTO portoes (id, evento_id, nome) VALUES (@id, @evento_id, @nome)');
    for (const gate of portoes) {
      const row = { id: gate.id, evento_id: gate.eventoId, nome: gate.nome };
      const existing = findGate.get(gate.id);
      verifyExisting(existing, row, 'portoes');
      if (!existing) inserted.portoes += addGate.run(row).changes;
    }

    const findTicket = database.prepare('SELECT id, codigo, evento_id, portao_id, utilizado FROM ingressos WHERE id = ?');
    const addTicket = database.prepare('INSERT INTO ingressos (id, codigo, evento_id, portao_id) VALUES (@id, @codigo, @evento_id, @portao_id)');
    const addReceipt = database.prepare(`INSERT INTO recebimentos
      (dispositivo, id_local, conteudo_normalizado, status) VALUES (?, ?, ?, 'CONFIRMADA')`);
    const addConfirmation = database.prepare('INSERT INTO validacoes (ingresso_id, recebimento_id) VALUES (?, ?)');

    for (const ticket of ingressos) {
      const row = { id: ticket.id, codigo: ticket.codigo, evento_id: ticket.eventoId, portao_id: ticket.portaoId };
      const existing = findTicket.get(ticket.id);
      verifyExisting(existing, row, 'ingressos');
      if (existing) {
        // Nunca reverter uso real, nem inventar confirmação para um registro preexistente.
        if (ticket.utilizado && !existing.utilizado) {
          throw new DatabaseTaskError(`Ingresso existente ID ${ticket.id} diverge do uso inicial dos mocks; seed cancelado.`);
        }
        continue;
      }

      inserted.ingressos += addTicket.run(row).changes;
      if (ticket.utilizado) {
        const content = JSON.stringify({
          ingressoId: ticket.id, codigo: ticket.codigo,
          eventoId: ticket.eventoId, portaoId: ticket.portaoId, dataHora: null,
        });
        const receipt = addReceipt.run(seedDevice, String(ticket.id), content);
        inserted.recebimentos += receipt.changes;
        inserted.validacoes += addConfirmation.run(ticket.id, receipt.lastInsertRowid).changes;
      }
    }
    return { inserted };
  }).immediate();
}
