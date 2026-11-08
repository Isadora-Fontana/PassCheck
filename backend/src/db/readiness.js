import { assertMigrationsCurrent } from './migrate.js';
import { DatabaseTaskError } from './errors.js';
import { assertPostgresReady } from './postgres/readiness.js';

// Contrato estrutural usado pela API. Somente metadados são consultados;
// não executa migrações, seed, provisionamento ou varredura dos dados de negócio.
const requiredColumns = {
  schema_migrations: 'version name checksum applied_at',
  eventos: 'id nome data local',
  portoes: 'id evento_id nome',
  ingressos: 'id codigo evento_id portao_id utilizado',
  recebimentos: 'id dispositivo id_local conteudo_normalizado status motivo recebido_em',
  validacoes: 'id ingresso_id recebimento_id data_hora_cliente data_hora_servidor',
  auditoria_divergencias: 'id recebimento_id correlacao_id motivo hash_original hash_apresentado data_hora_servidor',
  usuarios: 'id usuario senha_hash papel ativo versao_token criado_em',
  usuarios_eventos: 'usuario_id evento_id',
  usuarios_portoes: 'usuario_id evento_id portao_id',
  instalacoes: 'dispositivo usuario_id ativo criado_em',
  resolucoes_administrativas: 'id recebimento_id administrador_id status_administrativo justificativa data_hora_servidor',
};

const requiredTriggers = [
  'ingressos_inserir_disponivel', 'ingressos_preservar_confirmacao',
  'validacoes_exigir_recibo_confirmado', 'validacoes_marcar_utilizado',
  'recebimentos_impedir_alteracao', 'recebimentos_impedir_exclusao',
  'validacoes_impedir_alteracao', 'validacoes_impedir_exclusao',
  'auditoria_divergencias_impedir_alteracao', 'auditoria_divergencias_impedir_exclusao',
  'usuarios_revogar_tokens', 'instalacoes_preservar_identidade',
  'resolucoes_exigir_recibo_e_administrador', 'resolucoes_impedir_alteracao', 'resolucoes_impedir_exclusao',
];

const requiredIndexes = [
  'idx_portoes_evento', 'idx_ingressos_evento_portao', 'idx_ingressos_portao_evento',
  'idx_validacoes_data_servidor', 'idx_auditoria_recebimento', 'idx_auditoria_correlacao',
  'idx_instalacoes_usuario', 'idx_usuarios_eventos_evento', 'idx_usuarios_portoes_portao',
  'idx_resolucoes_administrador', 'idx_recebimentos_evento_pendencia',
];

export function assertDatabaseReady(database) {
  if (database.dialect === 'postgres') return assertPostgresReady(database);
  if (database.pragma('foreign_keys', { simple: true }) !== 1
    || database.pragma('recursive_triggers', { simple: true }) !== 1) {
    throw new DatabaseTaskError('Proteções obrigatórias da conexão SQLite desativadas.');
  }

  // Uma transação de leitura mantém o histórico e o schema no mesmo snapshot.
  database.transaction(() => {
    assertMigrationsCurrent(database);
    const tables = new Set(database.prepare(
      "SELECT name FROM pragma_table_list WHERE schema = 'main' AND type = 'table' AND strict = 1",
    ).all().map((row) => row.name));
    for (const [table, names] of Object.entries(requiredColumns)) {
      if (!tables.has(table)) throw new DatabaseTaskError('Tabela obrigatória ausente ou incompatível.');
      const columns = new Set(database.prepare('SELECT name FROM pragma_table_info(?)').all(table).map((row) => row.name));
      if (names.split(' ').some((name) => !columns.has(name))) {
        throw new DatabaseTaskError('Coluna obrigatória ausente ou incompatível.');
      }
    }
    const objects = new Set(database.prepare(
      "SELECT type, name FROM sqlite_schema WHERE type IN ('trigger', 'index')",
    ).all().map((row) => `${row.type}:${row.name}`));
    if (requiredTriggers.some((name) => !objects.has(`trigger:${name}`))
      || requiredIndexes.some((name) => !objects.has(`index:${name}`))) {
      throw new DatabaseTaskError('Proteção ou índice obrigatório ausente.');
    }
  })();
}
