import { databaseAccess } from '../access.js';

function io(database) {
  const access = databaseAccess(database);
  return {
    rows: async (sql, values) => (await access.query(sql, values)).rows,
    one: async (sql, values) => (await access.query(sql, values)).rows[0],
    query: access.query,
    transacao: (fn) => access.transaction(fn),
    leitura: (fn) => access.transaction(fn, { readOnly: true }),
  };
}

export function createPostgresIdentidadeRepository(database) {
  const db = io(database);
  return {
    transacao: db.transacao,
    leitura: db.leitura,
    porLogin: (usuario) => db.one('SELECT * FROM usuarios WHERE usuario = $1', [usuario]),
    porId: (id) => db.one('SELECT * FROM usuarios WHERE id = $1', [id]),
    eventoPermitido: async (id, evento) => Boolean(await db.one(
      'SELECT 1 FROM usuarios_eventos WHERE usuario_id = $1 AND evento_id = $2', [id, evento])),
    portaoPermitido: async (id, evento, portao) => Boolean(await db.one(
      'SELECT 1 FROM usuarios_portoes WHERE usuario_id = $1 AND evento_id = $2 AND portao_id = $3', [id, evento, portao])),
    eventos: (id) => db.rows(`SELECT e.id, e.nome, e.data, e.local FROM eventos e
      JOIN usuarios_eventos ue ON ue.evento_id = e.id WHERE ue.usuario_id = $1 ORDER BY e.id`, [id]),
    permissoes: (id) => db.rows(`SELECT ue.evento_id, up.portao_id FROM usuarios_eventos ue
      LEFT JOIN usuarios_portoes up ON up.usuario_id = ue.usuario_id AND up.evento_id = ue.evento_id
      WHERE ue.usuario_id = $1 ORDER BY ue.evento_id, up.portao_id`, [id]),
    instalacao: (dispositivo) => db.one('SELECT * FROM instalacoes WHERE dispositivo = $1', [dispositivo]),
    possuiRecibos: async (dispositivo) => Boolean(await db.one('SELECT 1 FROM recebimentos WHERE dispositivo = $1 LIMIT 1', [dispositivo])),
    registrar: (dispositivo, id) => db.query('INSERT INTO instalacoes (dispositivo, usuario_id) VALUES ($1, $2)', [dispositivo, id]),
    revogar: (id) => db.query('UPDATE usuarios SET versao_token = versao_token + 1 WHERE id = $1', [id]),
  };
}

export function createPostgresEventosRepository(database) {
  const db = io(database);
  return {
    listarEventos: () => db.rows('SELECT id, nome, data, local FROM eventos ORDER BY id'),
    eventoExiste: async (id) => Boolean(await db.one('SELECT 1 FROM eventos WHERE id = $1', [id])),
    async obterResumo(eventoId) {
      const rows = await db.rows(`WITH totais AS (
          SELECT count(*) AS total FROM ingressos WHERE evento_id = $1
        ), confirmadas AS (
          SELECT count(*) AS entradas FROM validacoes v
          JOIN ingressos i ON i.id = v.ingresso_id WHERE i.evento_id = $1
        ), por_portao AS (
          SELECT i.portao_id, count(*) AS entradas FROM validacoes v
          JOIN ingressos i ON i.id = v.ingresso_id WHERE i.evento_id = $1 GROUP BY i.portao_id
        )
        SELECT e.nome AS evento, t.total AS "totalIngressos", c.entradas,
          p.id AS "portaoId", p.nome AS "portaoNome", COALESCE(pp.entradas, 0) AS "entradasPortao"
        FROM eventos e CROSS JOIN totais t CROSS JOIN confirmadas c
        LEFT JOIN portoes p ON p.evento_id = e.id LEFT JOIN por_portao pp ON pp.portao_id = p.id
        WHERE e.id = $1 ORDER BY p.id`, [eventoId]);
      if (!rows.length) return undefined;
      return { evento: rows[0].evento, totalIngressos: rows[0].totalIngressos, entradas: rows[0].entradas,
        portoes: rows.filter((row) => row.portaoId !== null)
          .map((row) => ({ id: row.portaoId, nome: row.portaoNome, entradas: row.entradasPortao })) };
    },
    listarPortoes: (id) => db.rows('SELECT id, evento_id AS "eventoId", nome FROM portoes WHERE evento_id = $1 ORDER BY id', [id]),
    portaoPertenceAoEvento: async (evento, portao) => Boolean(await db.one(
      'SELECT 1 FROM portoes WHERE id = $1 AND evento_id = $2', [portao, evento])),
    async listarIngressos(evento, portao) {
      const rows = await db.rows(`SELECT id, codigo, evento_id AS "eventoId", portao_id AS "portaoId", utilizado
        FROM ingressos WHERE evento_id = $1 AND portao_id = $2 ORDER BY id`, [evento, portao]);
      return rows.map((row) => ({ ...row, utilizado: row.utilizado === 1 }));
    },
  };
}

export function createPostgresSincronizacaoRepository(database) {
  const db = io(database);
  return {
    transacao: db.transacao,
    buscarRecibo: (dispositivo, idLocal) => db.one(`SELECT r.*, v.id AS validacao_id, v.ingresso_id AS validacao_ingresso_id
      FROM recebimentos r LEFT JOIN validacoes v ON v.recebimento_id = r.id
      WHERE r.dispositivo = $1 AND r.id_local = $2`, [dispositivo, idLocal]),
    eventoExiste: async (id) => Boolean(await db.one('SELECT 1 FROM eventos WHERE id = $1', [id])),
    buscarPortao: (id) => db.one('SELECT evento_id FROM portoes WHERE id = $1', [id]),
    buscarIngresso: (id) => db.one(`SELECT i.*, v.id AS validacao_id FROM ingressos i
      LEFT JOIN validacoes v ON v.ingresso_id = i.id WHERE i.id = $1`, [id]),
    inserirRecibo: async (dispositivo, idLocal, content, status, motivo) => (await db.one(`INSERT INTO recebimentos
      (dispositivo, id_local, conteudo_normalizado, status, motivo) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [dispositivo, idLocal, content, status, motivo])).id,
    inserirValidacao: async (ingresso, recibo, data) => (await db.one(`INSERT INTO validacoes
      (ingresso_id, recebimento_id, data_hora_cliente) VALUES ($1, $2, $3) RETURNING id`, [ingresso, recibo, data])).id,
    auditarDivergencia: (recibo, correlacao, original, apresentado) => db.query(`INSERT INTO auditoria_divergencias
      (recebimento_id, correlacao_id, motivo, hash_original, hash_apresentado)
      VALUES ($1, $2, 'IDEMPOTENCIA_DIVERGENTE', $3, $4)`, [recibo, correlacao, original, apresentado]),
  };
}

const idOuNull = (id) => Number.isSafeInteger(id) && id > 0 ? id : null;
export function createPostgresAdministracaoRepository(database) {
  const db = io(database);
  return {
    transacao: db.transacao, leitura: db.leitura,
    evento: (id) => db.one('SELECT id, nome, data, local FROM eventos WHERE id = $1', [id]),
    criarEvento: ({ nome, data, local }) => db.one(
      'INSERT INTO eventos (nome, data, local) VALUES ($1, $2, $3) RETURNING id, nome, data, local', [nome, data, local]),
    atualizarEvento: (id, { nome, data, local }) => db.one(
      'UPDATE eventos SET nome=$1, data=$2, local=$3 WHERE id=$4 RETURNING id, nome, data, local', [nome, data, local, id]),
    criarPortao: (evento, nome) => db.one(
      'INSERT INTO portoes (evento_id,nome) VALUES ($1,$2) RETURNING id, evento_id AS "eventoId", nome', [evento, nome]),
    prepararImportacao: () => ({
      codigoExiste: async (codigo) => Boolean(await db.one('SELECT 1 FROM ingressos WHERE codigo = $1', [codigo])),
      portaoPertence: async (evento, portao) => Boolean(await db.one('SELECT 1 FROM portoes WHERE id=$1 AND evento_id=$2', [portao, evento])),
      inserir: async (row) => (await db.one('INSERT INTO ingressos(codigo,evento_id,portao_id) VALUES ($1,$2,$3) RETURNING id',
        [row.codigo, row.eventoId, row.portaoId])).id,
    }),
    async listarPendencias(eventoId, { estado, apos, limite }) {
      const rows = await db.rows(`SELECT r.id AS "recebimentoId", r.dispositivo, r.id_local AS "idLocal",
          r.conteudo_normalizado::json -> 'eventoId' AS "eventoId",
          r.conteudo_normalizado::json -> 'portaoId' AS "portaoId",
          r.conteudo_normalizado::json -> 'ingressoId' AS "ingressoId",
          r.status AS "statusOriginal", r.motivo, r.recebido_em AS "recebidoEm",
          a.id AS "resolucaoId", a.administrador_id AS "administradorId", a.data_hora_servidor AS "dataHora", a.justificativa
        FROM recebimentos r LEFT JOIN resolucoes_administrativas a ON a.recebimento_id = r.id
        WHERE r.status IN ('CONFLITO','REJEITADA')
          AND r.conteudo_normalizado::jsonb -> 'eventoId' = to_jsonb($1::bigint)
          AND r.conteudo_normalizado::json ->> 'eventoId' ~ '^[0-9]+$' AND r.id > $2
          AND ($3 = 'TODAS' OR ($3 = 'PENDENTE' AND a.id IS NULL) OR ($3 = 'RESOLVIDA' AND a.id IS NOT NULL))
        ORDER BY r.id LIMIT $4`, [eventoId, apos, estado, limite + 1]);
      return rows.map((row) => ({ recebimentoId: row.recebimentoId, dispositivo: row.dispositivo, idLocal: row.idLocal,
        eventoId: row.eventoId, portaoId: idOuNull(row.portaoId), ingressoId: idOuNull(row.ingressoId),
        statusOriginal: row.statusOriginal, motivo: row.motivo, recebidoEm: row.recebidoEm,
        statusAdministrativo: row.resolucaoId == null ? 'PENDENTE' : 'RESOLVIDA',
        resolucao: row.resolucaoId == null ? null : { id: row.resolucaoId, administradorId: row.administradorId,
          dataHora: row.dataHora, justificativa: row.justificativa } }));
    },
    recibo: (id) => db.one('SELECT id, status FROM recebimentos WHERE id=$1', [id]),
    resolucao: (id) => db.one('SELECT 1 FROM resolucoes_administrativas WHERE recebimento_id=$1', [id]),
    resolver: (recibo, admin, justificativa) => db.one(`INSERT INTO resolucoes_administrativas (recebimento_id,administrador_id,justificativa)
      VALUES ($1,$2,$3) RETURNING id, administrador_id AS "administradorId", data_hora_servidor AS "dataHora", justificativa`,
    [recibo, admin, justificativa]),
  };
}
