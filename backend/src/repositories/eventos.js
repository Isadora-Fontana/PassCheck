export function createEventosRepository(database) {
  return {
    listarEventos() {
      return database.prepare('SELECT id, nome, data, local FROM eventos ORDER BY id').all();
    },

    eventoExiste(eventoId) {
      return database.prepare('SELECT 1 FROM eventos WHERE id = ?').get(eventoId) !== undefined;
    },

    obterResumo(eventoId) {
      const rows = database.prepare(`WITH totais AS (
          SELECT COUNT(*) AS totalIngressos FROM ingressos WHERE evento_id = ?
        ), confirmadas AS (
          SELECT COUNT(*) AS entradas FROM validacoes v
          JOIN ingressos i ON i.id = v.ingresso_id WHERE i.evento_id = ?
        ), por_portao AS (
          SELECT i.portao_id, COUNT(*) AS entradas FROM validacoes v
          JOIN ingressos i ON i.id = v.ingresso_id WHERE i.evento_id = ?
          GROUP BY i.portao_id
        )
        SELECT e.nome AS evento, t.totalIngressos, c.entradas,
          p.id AS portaoId, p.nome AS portaoNome, COALESCE(pp.entradas, 0) AS entradasPortao
        FROM eventos e CROSS JOIN totais t CROSS JOIN confirmadas c
        LEFT JOIN portoes p ON p.evento_id = e.id
        LEFT JOIN por_portao pp ON pp.portao_id = p.id
        WHERE e.id = ? ORDER BY p.id`).all(eventoId, eventoId, eventoId, eventoId);
      if (!rows.length) return undefined;
      return {
        evento: rows[0].evento,
        totalIngressos: rows[0].totalIngressos,
        entradas: rows[0].entradas,
        portoes: rows.filter((row) => row.portaoId !== null)
          .map((row) => ({ id: row.portaoId, nome: row.portaoNome, entradas: row.entradasPortao })),
      };
    },

    listarPortoes(eventoId) {
      return database.prepare(`SELECT id, evento_id AS eventoId, nome
        FROM portoes WHERE evento_id = ? ORDER BY id`).all(eventoId);
    },

    portaoPertenceAoEvento(eventoId, portaoId) {
      return database.prepare('SELECT 1 FROM portoes WHERE id = ? AND evento_id = ?')
        .get(portaoId, eventoId) !== undefined;
    },

    listarIngressos(eventoId, portaoId) {
      return database.prepare(`SELECT id, codigo, evento_id AS eventoId, portao_id AS portaoId, utilizado
        FROM ingressos WHERE evento_id = ? AND portao_id = ? ORDER BY id`)
        .all(eventoId, portaoId)
        .map((ingresso) => ({ ...ingresso, utilizado: ingresso.utilizado === 1 }));
    },
  };
}
