import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { assertMigrationsCurrent } from '../migrate.js';
import { assertPostgresMigrationsCurrent } from './migrate.js';
import { DatabaseTaskError } from '../errors.js';

// Ordem topológica; nomes e colunas nunca vêm de parâmetros externos.
export const transferTables = {
  eventos: 'id nome data local',
  portoes: 'id evento_id nome',
  ingressos: 'id codigo evento_id portao_id utilizado',
  usuarios: 'id usuario senha_hash papel ativo versao_token criado_em',
  usuarios_eventos: 'usuario_id evento_id',
  usuarios_portoes: 'usuario_id evento_id portao_id',
  instalacoes: 'dispositivo usuario_id ativo criado_em',
  recebimentos: 'id dispositivo id_local conteudo_normalizado status motivo recebido_em',
  validacoes: 'id ingresso_id recebimento_id data_hora_cliente data_hora_servidor',
  auditoria_divergencias: 'id recebimento_id correlacao_id motivo hash_original hash_apresentado data_hora_servidor',
  resolucoes_administrativas: 'id recebimento_id administrador_id status_administrativo justificativa data_hora_servidor',
};

function order(table) {
  return table === 'usuarios_portoes' ? 'usuario_id, evento_id, portao_id'
    : table === 'usuarios_eventos' ? 'usuario_id, evento_id' : table === 'instalacoes' ? 'dispositivo COLLATE "C"' : 'id';
}

export function readSqliteSnapshot(path) {
  if (!path || path === ':memory:') throw new DatabaseTaskError('Importação exige um arquivo SQLite existente.');
  const source = new Database(path, { readonly: true, fileMustExist: true });
  try {
    source.pragma('query_only = ON');
    return source.transaction(() => {
      assertMigrationsCurrent(source);
      if (source.pragma('integrity_check', { simple: true }) !== 'ok' || source.pragma('foreign_key_check').length) {
        throw new DatabaseTaskError('SQLite não passou na verificação de integridade.');
      }
      const actualTables = source.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(({ name }) => name).sort();
      if (!isDeepStrictEqual(actualTables, [...Object.keys(transferTables), 'schema_migrations'].sort())) {
        throw new DatabaseTaskError('SQLite contém tabelas inesperadas; revise o mapeamento antes de transferir.');
      }
      const tables = {};
      for (const [table, definition] of Object.entries(transferTables)) {
        const columns = definition.split(' ');
        const actual = source.prepare(`PRAGMA table_info(${table})`).all().map(({ name }) => name);
        if (!isDeepStrictEqual(actual.sort(), [...columns].sort())) {
          throw new DatabaseTaskError('SQLite contém colunas inesperadas; revise o mapeamento antes de transferir.');
        }
        const ordering = order(table).replace('COLLATE "C"', 'COLLATE BINARY');
        tables[table] = source.prepare(`SELECT ${columns.join(', ')} FROM ${table} ORDER BY ${ordering}`).all();
      }
      const used = new Set(tables.validacoes.map((row) => row.ingresso_id));
      if (tables.ingressos.some((row) => row.utilizado !== Number(used.has(row.id)))) {
        throw new DatabaseTaskError('SQLite contém ingressos divergentes das confirmações.');
      }
      return {
        tables,
        sourceMigrations: source.prepare('SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version').all(),
        counts: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length])),
        checksum: createHash('sha256').update(JSON.stringify(tables)).digest('hex'),
      };
    }).deferred();
  } finally { source.close(); }
}

export async function importSqlite(database, path) {
  // Somente memória: hashes de senhas e identificadores não são exportados em arquivo/log.
  const snapshot = readSqliteSnapshot(path);
  return database.transaction(async (tx) => {
    await assertPostgresMigrationsCurrent(tx);
    await tx.query(`LOCK TABLE ${Object.keys(transferTables).join(', ')}, sqlite_import_history IN ACCESS EXCLUSIVE MODE`);
    for (const table of [...Object.keys(transferTables), 'sqlite_import_history']) {
      const { rows } = await tx.query(`SELECT 1 FROM ${table} LIMIT 1`);
      if (rows.length) throw new DatabaseTaskError('Destino PostgreSQL não está vazio. Importação recusada sem sobrescrever dados.');
    }
    for (const [table, definition] of Object.entries(transferTables)) {
      const columns = definition.split(' ');
      const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`;
      for (const row of snapshot.tables[table]) {
        // O trigger das confirmações restaurará o uso; o valor final será conferido.
        const values = columns.map((column) => table === 'ingressos' && column === 'utilizado' ? 0 : row[column]);
        await tx.query(sql, values);
      }
    }
    for (const [table, definition] of Object.entries(transferTables)) {
      const { rows } = await tx.query(`SELECT ${definition.split(' ').join(', ')} FROM ${table} ORDER BY ${order(table)}`);
      if (!isDeepStrictEqual(rows, snapshot.tables[table])) {
        throw new DatabaseTaskError('Conferência da transferência falhou. Nenhum registro foi confirmado no destino.');
      }
      if (definition.startsWith('id ')) {
        const maximum = rows.reduce((max, row) => Math.max(max, row.id), 0);
        const { rows: [sequence] } = await tx.query(`SELECT last_value, is_called FROM ${table}_id_seq`);
        const next = Math.max(maximum + 1, sequence.last_value + Number(sequence.is_called));
        if (!Number.isSafeInteger(next)) throw new DatabaseTaskError('Sequência excede o intervalo seguro da API.');
        await tx.query(`ALTER TABLE ${table} ALTER COLUMN id RESTART WITH ${next}`);
      }
    }
    // Detecta novas escritas desde o snapshot; ainda exige origem sem escritores
    // durante todo o corte, inclusive após este ponto e após o commit.
    const current = readSqliteSnapshot(path);
    if (current.checksum !== snapshot.checksum || !isDeepStrictEqual(current.sourceMigrations, snapshot.sourceMigrations)) {
      throw new DatabaseTaskError('SQLite mudou durante a transferência. Suspenda escritas e tente novamente.');
    }
    await tx.query(`INSERT INTO sqlite_import_history (id, source_migrations, table_counts, content_sha256)
      VALUES (1, $1::jsonb, $2::jsonb, $3)`,
    [JSON.stringify(snapshot.sourceMigrations), JSON.stringify(snapshot.counts), snapshot.checksum]);
    return { imported: snapshot.counts, verified: true };
  });
}
