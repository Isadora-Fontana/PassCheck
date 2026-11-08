import { eventos, portoes, ingressos } from '../seeds/mock-data.js';
import { seedDevice } from '../seeds/development.js';
import { DatabaseTaskError } from '../errors.js';
import { assertPostgresMigrationsCurrent } from './migrate.js';

function verify(existing, expected, table) {
  if (existing && Object.entries(expected).some(([key, value]) => existing[key] !== value)) {
    throw new DatabaseTaskError(`Seed incompatível com registro existente em ${table}. Nenhum dado foi sobrescrito.`);
  }
}

export async function seedPostgresDevelopment(database, nodeEnv) {
  if (nodeEnv !== 'development') throw new DatabaseTaskError('Seed permitido somente com NODE_ENV=development.');
  return database.transaction(async (tx) => {
    await assertPostgresMigrationsCurrent(tx);
    // Exclusão de outros escritores enquanto inserimos IDs explícitos dos mocks.
    await tx.query('LOCK TABLE eventos, portoes, ingressos, recebimentos, validacoes IN SHARE ROW EXCLUSIVE MODE');
    const inconsistent = await tx.query(`SELECT 1 FROM ingressos i
      WHERE i.utilizado <> (EXISTS (SELECT 1 FROM validacoes v WHERE v.ingresso_id = i.id))::integer LIMIT 1`);
    if (inconsistent.rows.length) throw new DatabaseTaskError('Banco contém estados de utilização inconsistentes; seed cancelado.');
    const inserted = { eventos: 0, portoes: 0, ingressos: 0, recebimentos: 0, validacoes: 0 };
    for (const event of eventos) {
      const { rows } = await tx.query('SELECT id, nome, data, local FROM eventos WHERE id = $1', [event.id]);
      verify(rows[0], event, 'eventos');
      if (!rows.length) {
        await tx.query('INSERT INTO eventos (id, nome, data, local) VALUES ($1, $2, $3, $4)',
          [event.id, event.nome, event.data, event.local]);
        inserted.eventos++;
      }
    }
    for (const gate of portoes) {
      const row = { id: gate.id, evento_id: gate.eventoId, nome: gate.nome };
      const { rows } = await tx.query('SELECT id, evento_id, nome FROM portoes WHERE id = $1', [gate.id]);
      verify(rows[0], row, 'portoes');
      if (!rows.length) {
        await tx.query('INSERT INTO portoes (id, evento_id, nome) VALUES ($1, $2, $3)', [row.id, row.evento_id, row.nome]);
        inserted.portoes++;
      }
    }
    for (const ticket of ingressos) {
      const row = { id: ticket.id, codigo: ticket.codigo, evento_id: ticket.eventoId, portao_id: ticket.portaoId };
      const { rows } = await tx.query('SELECT id, codigo, evento_id, portao_id, utilizado FROM ingressos WHERE id = $1', [ticket.id]);
      verify(rows[0], row, 'ingressos');
      if (rows.length) {
        if (ticket.utilizado && !rows[0].utilizado) throw new DatabaseTaskError('Ingresso existente diverge do uso inicial dos mocks; seed cancelado.');
        continue;
      }
      await tx.query('INSERT INTO ingressos (id, codigo, evento_id, portao_id) VALUES ($1, $2, $3, $4)',
        [row.id, row.codigo, row.evento_id, row.portao_id]);
      inserted.ingressos++;
      if (ticket.utilizado) {
        const content = JSON.stringify({ ingressoId: ticket.id, codigo: ticket.codigo,
          eventoId: ticket.eventoId, portaoId: ticket.portaoId, dataHora: null });
        const receipt = await tx.query(`INSERT INTO recebimentos (dispositivo, id_local, conteudo_normalizado, status)
          VALUES ($1, $2, $3, 'CONFIRMADA') RETURNING id`, [seedDevice, String(ticket.id), content]);
        await tx.query('INSERT INTO validacoes (ingresso_id, recebimento_id) VALUES ($1, $2)', [ticket.id, receipt.rows[0].id]);
        inserted.recebimentos++;
        inserted.validacoes++;
      }
    }
    for (const table of ['eventos', 'portoes', 'ingressos']) {
      // ALTER ... RESTART é transacional; setval não seria revertido com o seed.
      // Os nomes abaixo são constantes internas, nunca identificadores do usuário.
      const { rows: [{ maximum }] } = await tx.query(`SELECT COALESCE(max(id), 0) AS maximum FROM ${table}`);
      const { rows: [sequence] } = await tx.query(`SELECT last_value, is_called FROM ${table}_id_seq`);
      const next = Math.max(maximum + 1, sequence.last_value + Number(sequence.is_called));
      if (!Number.isSafeInteger(next)) throw new DatabaseTaskError('Sequência excede o intervalo seguro da API.');
      await tx.query(`ALTER TABLE ${table} ALTER COLUMN id RESTART WITH ${next}`);
    }
    return { inserted };
  });
}
