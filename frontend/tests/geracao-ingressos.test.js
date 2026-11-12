import assert from 'node:assert/strict';
import test from 'node:test';
import { gerarCodigos, montarCsv, dividirEmImportacoes, MAXIMO_POR_IMPORTACAO } from '../src/geracaoIngressos.js';
import { criarClienteHttp } from '../src/http.js';

test('códigos: formato PC-XXXXXXXX, sem caracteres ambíguos, sem repetição e sem os já existentes', () => {
  const existentes = new Set(gerarCodigos(50));
  const codigos = gerarCodigos(2000, existentes);
  assert.equal(codigos.length, 2000);
  assert.equal(new Set(codigos).size, 2000);
  for (const codigo of codigos) {
    assert.match(codigo, /^PC-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    assert.equal(existentes.has(codigo), false);
  }
});

test('CSV no formato exigido pelo servidor', () => {
  const csv = montarCsv([
    { codigo: 'PC-AAAAAAAA', eventoId: 4, portaoId: 7 },
    { codigo: 'PC-BBBBBBBB', eventoId: 4, portaoId: 8 },
  ]);
  assert.equal(csv, 'codigo,eventoId,portaoId\nPC-AAAAAAAA,4,7\nPC-BBBBBBBB,4,8\n');
});

test('divide em importações de no máximo 1000 ingressos', () => {
  const itens = Array.from({ length: 2500 }, (_, i) => i);
  const partes = dividirEmImportacoes(itens);
  assert.deepEqual(partes.map((parte) => parte.length), [MAXIMO_POR_IMPORTACAO, MAXIMO_POR_IMPORTACAO, 500]);
  assert.deepEqual(partes.flat(), itens);
});

test('transporte envia corpo em texto (CSV) com o tipo informado, e JSON continua igual', async () => {
  const chamadas = [];
  const http = criarClienteHttp({ obterToken: () => 'teste',
    fetchImpl: async (_url, opcoes) => { chamadas.push(opcoes); return Response.json({ ok: true }, { status: 201 }); } });
  await http('/eventos/4/ingressos/importar', { method: 'POST', body: 'codigo,eventoId,portaoId\n', tipoConteudo: 'text/csv; charset=utf-8' });
  assert.equal(chamadas[0].headers['Content-Type'], 'text/csv; charset=utf-8');
  assert.equal(chamadas[0].body, 'codigo,eventoId,portaoId\n');
  await http('/eventos', { method: 'POST', body: { nome: 'X' } });
  assert.equal(chamadas[1].headers['Content-Type'], 'application/json');
  assert.equal(chamadas[1].body, '{"nome":"X"}');
  await assert.rejects(http('/eventos/4/ingressos/importar', { method: 'POST', body: { nao: 'texto' }, tipoConteudo: 'text/csv' }), /Corpo em texto/);
});
