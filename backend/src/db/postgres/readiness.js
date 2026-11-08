import { assertPostgresMigrationsCurrent } from './migrate.js';
import { DatabaseTaskError } from '../errors.js';
import { transferTables } from './import-sqlite.js';

const columns = { ...transferTables, schema_migrations: 'version name checksum applied_at',
  sqlite_import_history: 'id imported_at source_migrations table_counts content_sha256',
  login_limites: 'chave tentativas expira_em' };
const triggers = {
  ingressos: ['ingressos_inserir_disponivel', 'ingressos_preservar_confirmacao'],
  validacoes: ['validacoes_exigir_recibo_confirmado', 'validacoes_marcar_utilizado',
    'validacoes_impedir_alteracao', 'validacoes_impedir_exclusao', 'validacoes_impedir_truncate'],
  recebimentos: ['recebimentos_impedir_alteracao', 'recebimentos_impedir_exclusao', 'recebimentos_impedir_truncate'],
  auditoria_divergencias: ['auditoria_divergencias_impedir_alteracao', 'auditoria_divergencias_impedir_exclusao', 'auditoria_divergencias_impedir_truncate'],
  usuarios: ['usuarios_revogar_tokens'], instalacoes: ['instalacoes_preservar_identidade'],
  resolucoes_administrativas: ['resolucoes_exigir_recibo_e_administrador', 'resolucoes_impedir_alteracao', 'resolucoes_impedir_exclusao', 'resolucoes_impedir_truncate'],
  sqlite_import_history: ['sqlite_import_impedir_mutacao', 'sqlite_import_impedir_truncate'],
};
const indexes = ['idx_portoes_evento', 'idx_ingressos_evento_portao', 'idx_ingressos_portao_evento',
  'idx_validacoes_data_servidor', 'idx_auditoria_recebimento', 'idx_auditoria_correlacao',
  'idx_instalacoes_usuario', 'idx_usuarios_eventos_evento', 'idx_usuarios_portoes_portao',
  'idx_resolucoes_administrador', 'idx_recebimentos_evento_pendencia', 'idx_login_limites_expira_em'];

export async function assertPostgresReady(database) {
  return database.transaction(async (tx) => {
    await assertPostgresMigrationsCurrent(tx);
    const { rows: attributes } = await tx.query(`SELECT c.relname AS table_name, a.attname AS column_name
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = $1 AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped`, [database.schema]);
    const available = new Set(attributes.map((row) => `${row.table_name}:${row.column_name}`));
    for (const [table, fields] of Object.entries(columns)) {
      if (fields.split(' ').some((field) => !available.has(`${table}:${field}`))) throw new DatabaseTaskError('Tabela/coluna PostgreSQL obrigatória ausente.');
    }
    const { rows: protections } = await tx.query(`SELECT c.relname AS table_name, t.tgname FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND NOT t.tgisinternal AND t.tgenabled IN ('O','A')`, [database.schema]);
    const enabled = new Set(protections.map((row) => `${row.table_name}:${row.tgname}`));
    for (const [table, names] of Object.entries(triggers)) {
      if (names.some((name) => !enabled.has(`${table}:${name}`))) throw new DatabaseTaskError('Trigger PostgreSQL obrigatório ausente ou desativado.');
    }
    const { rows: indexRows } = await tx.query(`SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND i.indisvalid AND i.indisready`, [database.schema]);
    const valid = new Set(indexRows.map((row) => row.relname));
    if (indexes.some((name) => !valid.has(name))) throw new DatabaseTaskError('Índice PostgreSQL obrigatório ausente ou inválido.');
  }, { readOnly: true });
}
