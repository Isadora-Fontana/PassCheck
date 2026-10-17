export function createSincronizacaoRepository(database) {
  return {
    transacao(callback) {
      return database.transaction(callback).immediate();
    },

    buscarRecibo(dispositivo, idLocal) {
      return database.prepare(`SELECT r.*, v.id AS validacao_id, v.ingresso_id AS validacao_ingresso_id
        FROM recebimentos r LEFT JOIN validacoes v ON v.recebimento_id = r.id
        WHERE r.dispositivo = ? AND r.id_local = ?`).get(dispositivo, idLocal);
    },

    eventoExiste(eventoId) {
      return Boolean(database.prepare('SELECT 1 FROM eventos WHERE id = ?').get(eventoId));
    },

    buscarPortao(portaoId) {
      return database.prepare('SELECT evento_id FROM portoes WHERE id = ?').get(portaoId);
    },

    buscarIngresso(ingressoId) {
      return database.prepare(`SELECT i.*, v.id AS validacao_id FROM ingressos i
        LEFT JOIN validacoes v ON v.ingresso_id = i.id WHERE i.id = ?`).get(ingressoId);
    },

    inserirRecibo(dispositivo, idLocal, content, status, motivo) {
      return database.prepare(`INSERT INTO recebimentos
        (dispositivo, id_local, conteudo_normalizado, status, motivo) VALUES (?, ?, ?, ?, ?)`)
        .run(dispositivo, idLocal, content, status, motivo).lastInsertRowid;
    },

    inserirValidacao(ingressoId, recebimentoId, dataHora) {
      return database.prepare(`INSERT INTO validacoes
        (ingresso_id, recebimento_id, data_hora_cliente) VALUES (?, ?, ?)`)
        .run(ingressoId, recebimentoId, dataHora).lastInsertRowid;
    },

    auditarDivergencia(recebimentoId, correlacaoId, hashOriginal, hashApresentado) {
      database.prepare(`INSERT INTO auditoria_divergencias
        (recebimento_id, correlacao_id, motivo, hash_original, hash_apresentado)
        VALUES (?, ?, 'IDEMPOTENCIA_DIVERGENTE', ?, ?)`)
        .run(recebimentoId, correlacaoId, hashOriginal, hashApresentado);
    },
  };
}
