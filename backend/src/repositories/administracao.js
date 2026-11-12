import { createPostgresAdministracaoRepository } from '../db/postgres/repositories.js';
import { protectSqliteRepository } from '../db/access.js';
const resolucao = (row) => row.resolucaoId == null ? null : ({ id: row.resolucaoId,
  administradorId: row.administradorId, dataHora: row.dataHora, justificativa: row.justificativa });
const idOuNull = (id) => Number.isSafeInteger(id) && id > 0 ? id : null;

export function createAdministracaoRepository(database) {
  if (database.dialect === 'postgres') return createPostgresAdministracaoRepository(database);
  return protectSqliteRepository(database, {
    transacao: (fn) => database.transaction(fn).immediate(),
    leitura: (fn) => database.transaction(fn)(),
    evento: (id) => database.prepare('SELECT id, nome, data, local FROM eventos WHERE id = ?').get(id),
    criarEvento: ({ nome, data, local }) => database.prepare(
      'INSERT INTO eventos (nome, data, local) VALUES (?, ?, ?) RETURNING id, nome, data, local').get(nome, data, local),
    atualizarEvento: (id, { nome, data, local }) => database.prepare(
      'UPDATE eventos SET nome = ?, data = ?, local = ? WHERE id = ? RETURNING id, nome, data, local').get(nome, data, local, id),
    criarPortao: (eventoId, nome) => database.prepare(
      'INSERT INTO portoes (evento_id, nome) VALUES (?, ?) RETURNING id, evento_id AS eventoId, nome').get(eventoId, nome),
    usuario: (id) => database.prepare('SELECT id, papel, ativo FROM usuarios WHERE id = ?').get(id),
    portaoDoEvento: (portaoId, eventoId) => Boolean(database.prepare(
      'SELECT 1 FROM portoes WHERE id = ? AND evento_id = ?').get(portaoId, eventoId)),
    concederEvento: (usuarioId, eventoId) => database.prepare(
      'INSERT OR IGNORE INTO usuarios_eventos (usuario_id, evento_id) VALUES (?, ?)').run(usuarioId, eventoId),
    definirPortao(usuarioId, eventoId, portaoId) {
      // Um operador opera um único portão por evento: remove os outros e garante este.
      database.prepare('DELETE FROM usuarios_portoes WHERE usuario_id = ? AND evento_id = ? AND portao_id <> ?')
        .run(usuarioId, eventoId, portaoId);
      database.prepare('INSERT OR IGNORE INTO usuarios_portoes (usuario_id, evento_id, portao_id) VALUES (?, ?, ?)')
        .run(usuarioId, eventoId, portaoId);
    },
    prepararImportacao() {
      const codigo = database.prepare('SELECT 1 FROM ingressos WHERE codigo = ?');
      const portao = database.prepare('SELECT 1 FROM portoes WHERE id = ? AND evento_id = ?');
      const insert = database.prepare('INSERT INTO ingressos (codigo, evento_id, portao_id) VALUES (?, ?, ?)');
      return {
        codigoExiste: (value) => Boolean(codigo.get(value)),
        portaoPertence: (eventoId, portaoId) => Boolean(portao.get(portaoId, eventoId)),
        inserir: (row) => insert.run(row.codigo, row.eventoId, row.portaoId).lastInsertRowid,
      };
    },
    listarPendencias(eventoId, { estado, apos, limite }) {
      return database.prepare(`SELECT r.id AS recebimentoId, r.dispositivo, r.id_local AS idLocal,
          json_extract(r.conteudo_normalizado, '$.eventoId') AS eventoId,
          json_extract(r.conteudo_normalizado, '$.portaoId') AS portaoId,
          json_extract(r.conteudo_normalizado, '$.ingressoId') AS ingressoId,
          r.status AS statusOriginal, r.motivo, r.recebido_em AS recebidoEm,
          a.id AS resolucaoId, a.administrador_id AS administradorId,
          a.data_hora_servidor AS dataHora, a.justificativa
        FROM recebimentos r LEFT JOIN resolucoes_administrativas a ON a.recebimento_id = r.id
        WHERE r.status IN ('CONFLITO', 'REJEITADA')
          AND json_extract(r.conteudo_normalizado, '$.eventoId') = ?
          AND json_type(r.conteudo_normalizado, '$.eventoId') = 'integer' AND r.id > ?
          AND (? = 'TODAS' OR (? = 'PENDENTE' AND a.id IS NULL) OR (? = 'RESOLVIDA' AND a.id IS NOT NULL))
        ORDER BY r.id LIMIT ?`).all(eventoId, apos, estado, estado, estado, limite + 1)
        .map((row) => ({ recebimentoId: row.recebimentoId, dispositivo: row.dispositivo,
          idLocal: row.idLocal, eventoId: row.eventoId, portaoId: idOuNull(row.portaoId), ingressoId: idOuNull(row.ingressoId),
          statusOriginal: row.statusOriginal, motivo: row.motivo, recebidoEm: row.recebidoEm,
          statusAdministrativo: row.resolucaoId == null ? 'PENDENTE' : 'RESOLVIDA', resolucao: resolucao(row) }));
    },
    recibo: (id) => database.prepare('SELECT id, status FROM recebimentos WHERE id = ?').get(id),
    resolucao: (id) => database.prepare('SELECT 1 FROM resolucoes_administrativas WHERE recebimento_id = ?').get(id),
    resolver(recebimentoId, administradorId, justificativa) {
      return database.prepare(`INSERT INTO resolucoes_administrativas (recebimento_id, administrador_id, justificativa)
        VALUES (?, ?, ?) RETURNING id, administrador_id AS administradorId, data_hora_servidor AS dataHora, justificativa`)
        .get(recebimentoId, administradorId, justificativa);
    },
  });
}
