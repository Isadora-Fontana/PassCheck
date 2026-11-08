import assert from 'node:assert/strict';
import test from 'node:test';
import { ZodError } from 'zod';
import { memoryDatabase } from './helpers/database.js';
import { cadastrarInterativo, diagnosticarProvisionamento } from '../src/provisionar-interativo.js';
import { verificarSenha } from '../src/services/senhas.js';

function ioSimulado(respostas, senhas) {
  const mensagens = [];
  const consumir = (lista) => { assert(lista.length, 'Resposta de teste ausente'); return lista.shift(); };
  return { mensagens, perguntar: async () => consumir(respostas), senhaOculta: async () => consumir(senhas),
    informar: (texto) => mensagens.push(texto) };
}

test('provisionamento explica senha curta e confirmação diferente, permite repetir e cria a conta normalizada', async (t) => {
  const database = memoryDatabase(t);
  const correta = 'Teste123!abc';
  const io = ioSimulado(['login inválido', 'GabrielThaines'],
    ['curta', correta, 'confirmacao-diferente', correta, correta]);
  const conta = await cadastrarInterativo(database, 'bootstrap', io);
  assert.equal(conta.usuario, 'gabrielthaines');
  assert.equal(conta.papel, 'ADMINISTRADOR');
  assert(io.mensagens.some((m) => m.includes('Usuário inválido')));
  assert(io.mensagens.some((m) => m.includes('Senha inválida')));
  assert(io.mensagens.some((m) => m.includes('não conferem')));
  assert(!io.mensagens.join(' ').includes(correta));
  assert.equal(await verificarSenha(correta, database.prepare('SELECT senha_hash FROM usuarios').get().senha_hash), true);
  assert.equal(database.prepare('SELECT COUNT(*) AS total FROM usuarios').get().total, 1);
});

test('administrador existente é detectado antes de pedir senha e não é substituído', async (t) => {
  const database = memoryDatabase(t);
  const senha = 'Teste123!abc';
  await cadastrarInterativo(database, 'bootstrap', ioSimulado(['primeiro-admin'], [senha, senha]));
  const antes = database.prepare('SELECT * FROM usuarios').all();
  await assert.rejects(cadastrarInterativo(database, 'bootstrap', ioSimulado([], [])), { codigo: 'ADMIN_EXISTENTE' });
  assert.deepEqual(database.prepare('SELECT * FROM usuarios').all(), antes);
});

test('diagnósticos não incluem valores de entrada, SQL ou mensagens internas', () => {
  const valor = 'valor-sensivel-ficticio';
  const errors = [
    new ZodError([{ code: 'custom', path: ['senha'], message: valor }]),
    new ZodError([{ code: 'custom', path: ['eventos'], message: valor }]),
    Object.assign(new Error(valor), { code: 'SQLITE_CONSTRAINT_UNIQUE' }),
    Object.assign(new Error(valor), { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' }),
    Object.assign(new Error(valor), { code: 'SQLITE_BUSY' }),
    new Error(valor),
  ];
  for (const error of errors) assert(!diagnosticarProvisionamento(error).includes(valor));
});
