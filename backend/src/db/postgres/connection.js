import { DatabaseTaskError } from '../errors.js';

export function safeInteger(value) {
  const number = Number(value);
  if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(number)) {
    throw new DatabaseTaskError('Inteiro PostgreSQL fora do intervalo seguro da API.');
  }
  return number;
}

// Uma instância por processo; não criar um pool por requisição.
// Factory injetável apenas para testar o ciclo de vida sem um servidor externo.
export async function openPostgres(config, { driver, logger = console, onPool } = {}) {
  if (!driver) {
    try { driver = await import('pg'); } catch {
      throw new DatabaseTaskError('Driver pg indisponível. Instale a dependência PostgreSQL antes de usar estes comandos.');
    }
  }
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(config.schema)) throw new DatabaseTaskError('Schema PostgreSQL inválido.');
  const pool = new driver.Pool({
    connectionString: config.connectionString, ssl: config.ssl,
    max: config.max, connectionTimeoutMillis: config.connectionTimeoutMillis,
    idleTimeoutMillis: config.idleTimeoutMillis,
    application_name: 'passcheck',
    // Parser restrito a este pool: não altera o registro global de tipos do pg.
    types: { getTypeParser: (oid, format) => oid === 20 && format !== 'binary'
      ? safeInteger : driver.types.getTypeParser(oid, format) },
  });
  pool.on('error', () => logger.error('Conexão PostgreSQL ociosa indisponível.'));
  let closing;

  async function transaction(callback, { readOnly = false } = {}) {
    if (closing) throw new DatabaseTaskError('Conexão PostgreSQL encerrada.');
    let client;
    try { client = await pool.connect(); }
    catch (error) {
      // O timeout de aquisição do pg-pool não traz SQLSTATE.
      error.code ??= 'PG_CONNECTION_UNAVAILABLE';
      throw error;
    }
    let active = false;
    let discard = false;
    const tx = {
      query(text, values = []) {
        if (!active) throw new DatabaseTaskError('Transação PostgreSQL encerrada.');
        return client.query(text, values);
      },
    };
    try {
      await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
      active = true;
      // SET LOCAL é compatível com pooler transacional e não vaza estado no pool.
      await client.query("SELECT set_config('search_path', $1, true), set_config('statement_timeout', $2, true), set_config('lock_timeout', $3, true)",
        [`"${config.schema}", pg_catalog`, String(config.statementTimeoutMillis), String(config.lockTimeoutMillis)]);
      const result = await callback(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { discard = true; }
      throw error;
    } finally {
      active = false;
      client.release(discard);
    }
  }

  function close() { closing ??= pool.end(); return closing; }
  try {
    onPool?.(pool);
    await transaction((tx) => tx.query('SELECT 1'), { readOnly: true });
  }
  catch (error) { await close().catch(() => {}); throw error; }
  return {
    dialect: 'postgres',
    schema: config.schema,
    transaction,
    query: (text, values) => transaction((tx) => tx.query(text, values)),
    close,
  };
}
