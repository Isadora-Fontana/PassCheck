import assert from 'node:assert/strict';
import test from 'node:test';
import { memoryDatabase, snapshot, receipt, confirm } from './helpers/database.js';

test('código do ingresso é globalmente único, inclusive entre eventos', (t) => {
  const database = memoryDatabase(t);
  const before = snapshot(database);
  const code = database.prepare('SELECT codigo FROM ingressos WHERE id = 1').get().codigo;
  assert.throws(() => database.prepare('UPDATE ingressos SET codigo = ? WHERE id = 13').run(code), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
  assert.deepEqual(snapshot(database), before);
});

test('vínculos evento-portão-ingresso rejeitam combinações incorretas e exclusões em cascata', (t) => {
  const database = memoryDatabase(t);
  const before = snapshot(database);
  assert.throws(() => database.prepare('UPDATE ingressos SET evento_id = 2 WHERE id = 1').run(), { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' });
  assert.throws(() => database.prepare('UPDATE ingressos SET portao_id = 4 WHERE id = 1').run(), { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' });
  // Ações RESTRICT são implementadas internamente por triggers no SQLite e podem
  // retornar SQLITE_CONSTRAINT_TRIGGER, mantendo a mensagem de chave estrangeira.
  assert.throws(() => database.prepare('UPDATE portoes SET evento_id = 2 WHERE id = 1').run(), /FOREIGN KEY constraint failed/);
  assert.throws(() => database.prepare('DELETE FROM eventos WHERE id = 1').run(), /FOREIGN KEY constraint failed/);
  assert.throws(() => database.prepare('DELETE FROM portoes WHERE id = 1').run(), /FOREIGN KEY constraint failed/);
  assert.deepEqual(snapshot(database), before);
});

test('FKs rejeitam evento e ingresso inexistentes', (t) => {
  const database = memoryDatabase(t);
  // Identificadores negativos são exclusivamente entradas inválidas de teste.
  assert.throws(() => database.prepare('UPDATE portoes SET evento_id = -1 WHERE id = 6').run(), /FOREIGN KEY constraint failed/);
  const receiptId = receipt(database);
  assert.throws(() => database.prepare('INSERT INTO validacoes (ingresso_id, recebimento_id) VALUES (-1, ?)').run(receiptId), { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' });
});

test('idempotência distingue dispositivos e rejeita repetição da mesma dupla', (t) => {
  const database = memoryDatabase(t);
  receipt(database, { device: 'device-A', localId: '1' });
  receipt(database, { device: 'device-B', localId: '1' });
  assert.throws(() => receipt(database, { device: 'device-A', localId: '1' }), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
  assert.throws(() => receipt(database, { device: '', localId: '2' }), { code: 'SQLITE_CONSTRAINT_CHECK' });
  assert.throws(() => receipt(database, { device: 'device-A', localId: '' }), { code: 'SQLITE_CONSTRAINT_CHECK' });
  assert.throws(() => receipt(database, { device: null, localId: '3' }), { code: 'SQLITE_CONSTRAINT_NOTNULL' });
});

test('um ingresso e um recibo não podem originar duas confirmações', (t) => {
  const database = memoryDatabase(t);
  const first = receipt(database);
  const second = receipt(database, { device: 'other-device' });
  const insert = database.prepare('INSERT INTO validacoes (ingresso_id, recebimento_id) VALUES (?, ?)');
  insert.run(1, first);
  assert.throws(() => insert.run(1, second), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
  assert.throws(() => insert.run(2, first), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
});

test('rejeições podem guardar recursos inexistentes sem criar validação', (t) => {
  const database = memoryDatabase(t);
  const rejected = database.prepare(`INSERT INTO recebimentos
    (dispositivo, id_local, conteudo_normalizado, status, motivo)
    VALUES ('test-rejection', '1', '{"ingressoId":-1}', 'REJEITADA', 'INGRESSO_INEXISTENTE')`).run();
  assert.throws(() => database.prepare('INSERT INTO validacoes (ingresso_id, recebimento_id) VALUES (?, ?)').run(1, rejected.lastInsertRowid), /RECIBO_NAO_CONFIRMADO/);
  const conflict = receipt(database, { status: 'CONFLITO' });
  assert.throws(() => database.prepare('INSERT INTO validacoes (ingresso_id, recebimento_id) VALUES (1, ?)').run(conflict), /RECIBO_NAO_CONFIRMADO/);
  assert.equal(database.prepare('SELECT count(*) AS total FROM validacoes').get().total, 2);
});

test('utilizado é controlado pela confirmação; alterações diretas divergentes são rejeitadas', (t) => {
  const database = memoryDatabase(t);
  assert.throws(() => database.prepare('UPDATE ingressos SET utilizado = 1 WHERE id = 1').run(), /INGRESSO_DIVERGE/);
  assert.throws(() => database.prepare('UPDATE ingressos SET utilizado = 0 WHERE id = 4').run(), /INGRESSO_DIVERGE/);
  assert.throws(() => database.prepare('UPDATE ingressos SET utilizado = 2 WHERE id = 1').run());
  assert.throws(() => database.prepare('UPDATE ingressos SET utilizado = NULL WHERE id = 1').run(), { code: 'SQLITE_CONSTRAINT_NOTNULL' });
  assert.throws(() => database.prepare('UPDATE ingressos SET portao_id = 2 WHERE id = 4').run(), /INGRESSO_DIVERGE/);
  confirm(database, 1);
  assert.equal(database.prepare('SELECT utilizado FROM ingressos WHERE id = 1').get().utilizado, 1);
  assert.equal(database.prepare(`SELECT count(*) AS total FROM ingressos i WHERE i.utilizado <>
    EXISTS (SELECT 1 FROM validacoes v WHERE v.ingresso_id = i.id)`).get().total, 0);
});

test('histórico de recibos e confirmações é imutável, inclusive via REPLACE', (t) => {
  const database = memoryDatabase(t);
  const before = snapshot(database);
  assert.throws(() => database.prepare("UPDATE recebimentos SET status = 'REJEITADA', motivo = 'TESTE' WHERE id = 1").run(), /RECIBO_IMUTAVEL/);
  assert.throws(() => database.prepare('DELETE FROM recebimentos WHERE id = 1').run(), /RECIBO_IMUTAVEL/);
  assert.throws(() => database.prepare('UPDATE validacoes SET ingresso_id = 1 WHERE id = 1').run(), /CONFIRMACAO_IMUTAVEL/);
  assert.throws(() => database.prepare('DELETE FROM validacoes WHERE id = 1').run(), /CONFIRMACAO_IMUTAVEL/);
  assert.throws(() => database.exec(`INSERT OR REPLACE INTO recebimentos
    (id, dispositivo, id_local, conteudo_normalizado, status)
    SELECT id, dispositivo, id_local, conteudo_normalizado, status FROM recebimentos WHERE id = 1`), /RECIBO_IMUTAVEL/);
  assert.deepEqual(snapshot(database), before);
});

test('falha após confirmação reverte recibo, validação e utilizado na mesma transação', (t) => {
  const database = memoryDatabase(t);
  const before = snapshot(database);
  assert.throws(() => database.transaction(() => {
    confirm(database, 1);
    assert.equal(database.prepare('SELECT utilizado FROM ingressos WHERE id = 1').get().utilizado, 1);
    throw new Error('falha simulada antes do commit');
  })(), /falha simulada/);
  assert.deepEqual(snapshot(database), before);
});

test('checks rejeitam datas, JSON, status e campos obrigatórios inválidos', (t) => {
  const database = memoryDatabase(t);
  assert.throws(() => database.prepare("UPDATE eventos SET data = '2026-02-30' WHERE id = 1").run(), { code: 'SQLITE_CONSTRAINT_CHECK' });
  assert.throws(() => database.prepare("UPDATE eventos SET nome = ' ' WHERE id = 1").run(), { code: 'SQLITE_CONSTRAINT_CHECK' });
  assert.throws(() => database.prepare("UPDATE ingressos SET codigo = '' WHERE id = 1").run(), { code: 'SQLITE_CONSTRAINT_CHECK' });
  for (const [content, status, reason] of [['invalid', 'CONFIRMADA', null], ['[]', 'CONFIRMADA', null], ['{}', 'JA_PROCESSADA', null], ['{}', 'CONFLITO', null]]) {
    assert.throws(() => database.prepare(`INSERT INTO recebimentos
      (dispositivo, id_local, conteudo_normalizado, status, motivo) VALUES ('invalid-test', '1', ?, ?, ?)`).run(content, status, reason));
  }
});
