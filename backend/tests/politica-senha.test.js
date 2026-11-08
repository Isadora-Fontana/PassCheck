import assert from 'node:assert/strict';
import test from 'node:test';
import { credenciaisSchema } from '../src/validation/identidade.js';

test('senha aceita os limites de 8 e 14 caracteres com maiúscula e especial', () => {
  for (const senha of ['Abcdefg!', 'Abcdefghijklm!', 'Ábcdefg@']) {
    assert(credenciaisSchema.safeParse({ usuario: 'teste', senha }).success);
  }
});

test('senha rejeita tamanho inválido, ausência de maiúscula ou ausência de especial', () => {
  for (const senha of ['Abcdef!', 'Abcdefghijklmn!', 'abcdefg!', 'Abcdefgh', 'Abcdefg ', '1234567!']) {
    assert.equal(credenciaisSchema.safeParse({ usuario: 'teste', senha }).success, false);
  }
});
