import { AsyncLocalStorage } from 'node:async_hooks';

const accessors = new WeakMap();
const writeTables = 'eventos, portoes, ingressos, recebimentos, validacoes, auditoria_divergencias, usuarios, usuarios_eventos, usuarios_portoes, instalacoes, resolucoes_administrativas';

// Compartilhado entre todos os repositórios de uma conexão. A identidade consulta
// o mesmo client/snapshot da operação que está autorizando.
export function databaseAccess(database) {
  if (accessors.has(database)) return accessors.get(database);
  const context = new AsyncLocalStorage();
  let tail = Promise.resolve();
  let pending = 0;
  function current() {
    const scope = context.getStore();
    if (scope && !scope.active) throw new Error('Operação fora do tempo de vida da transação.');
    return scope;
  }
  function exclusive(fn) {
    pending++;
    const result = tail.then(fn);
    tail = result.catch(() => {}).finally(() => { pending--; });
    return result;
  }
  function sqlite(fn) {
    if (current() || !pending) return fn();
    return exclusive(fn);
  }
  async function transaction(callback, { readOnly = false } = {}) {
    const parent = current();
    if (parent) {
      if (parent.readOnly && !readOnly) throw new Error('Escrita dentro de transação somente leitura.');
      return callback();
    }
    if (database.dialect === 'postgres') {
      return database.transaction(async (tx) => {
        if (!readOnly) {
          // Equivalente conservador ao escritor único do BEGIN IMMEDIATE.
          // Inclui escritores SQL externos, não apenas processos desta aplicação.
          await tx.query(`LOCK TABLE ${writeTables} IN SHARE ROW EXCLUSIVE MODE`);
        }
        const scope = { tx, readOnly, active: true };
        try { return await context.run(scope, callback); } finally { scope.active = false; }
      }, { readOnly });
    }
    return exclusive(async () => {
      database.exec(readOnly ? 'BEGIN' : 'BEGIN IMMEDIATE');
      const scope = { readOnly, active: true };
      try {
        const result = await context.run(scope, callback);
        database.exec('COMMIT');
        return result;
      } catch (error) {
        if (database.inTransaction) database.exec('ROLLBACK');
        throw error;
      } finally { scope.active = false; }
    });
  }
  const access = {
    transaction,
    sqlite,
    query(text, values = []) {
      const scope = current();
      return scope ? scope.tx.query(text, values) : database.query(text, values);
    },
  };
  accessors.set(database, access);
  return access;
}

export function protectSqliteRepository(database, repository) {
  const access = databaseAccess(database);
  return Object.fromEntries(Object.entries(repository).map(([name, method]) => [name,
    name === 'transacao' ? (fn) => access.transaction(fn)
      : name === 'leitura' ? (fn) => access.transaction(fn, { readOnly: true })
        : (...args) => access.sqlite(() => method(...args)),
  ]));
}

export function databaseUnavailable(error) {
  return error?.code === 'SQLITE_BUSY' || error?.code?.startsWith('SQLITE_BUSY_')
    || ['55P03', '57014', '40001', '40P01', '53300', '57P01', '57P02', '57P03',
      'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'PG_CONNECTION_UNAVAILABLE'].includes(error?.code)
    || error?.code?.startsWith('08');
}
