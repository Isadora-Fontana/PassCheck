import assert from 'node:assert/strict';
import test from 'node:test';
import { validarResultados } from '../src/api.js';

const lote = {
  eventoId: 1, portaoId: 1, dispositivo: '971b6382-28ad-4f06-9d71-97ef1ada8df0',
  validacoes: [
    { idLocal: '18', ingressoId: 2, codigo: 'PC-B3M8Q1', dataHora: '2026-11-20T22:04:00.000Z' },
    { idLocal: '19', ingressoId: 4, codigo: 'PC-D9R4L6', dataHora: '2026-11-20T22:04:01.000Z' },
    { idLocal: '20', ingressoId: 6, codigo: 'PC-F8N3V5', dataHora: '2026-11-20T22:04:02.000Z' },
  ],
};

test('aceita confirmação, conflito, rejeição e seus reenvios (JA_PROCESSADA)', () => {
  const primeiro = { resultados: [
    { idLocal: '18', status: 'CONFIRMADA', validacaoId: 102 },
    { idLocal: '19', status: 'CONFLITO', motivo: 'INGRESSO_JA_UTILIZADO' },
    { idLocal: '20', status: 'REJEITADA', motivo: 'PORTAO_INCOMPATIVEL' },
  ] };
  assert.equal(validarResultados(lote, primeiro).length, 3);
  const reenvio = { resultados: [
    { idLocal: '18', status: 'JA_PROCESSADA', resultadoOriginal: 'CONFIRMADA', validacaoId: 102 },
    { idLocal: '19', status: 'JA_PROCESSADA', resultadoOriginal: 'CONFLITO', motivo: 'INGRESSO_JA_UTILIZADO' },
    { idLocal: '20', status: 'JA_PROCESSADA', resultadoOriginal: 'REJEITADA', motivo: 'PORTAO_INCOMPATIVEL' },
  ] };
  assert.equal(validarResultados(lote, reenvio).length, 3);
});

test('recusa respostas que não permitem reconhecer cada item com segurança', () => {
  const ok = (idLocal) => ({ idLocal, status: 'CONFIRMADA', validacaoId: 1 });
  const invalidas = [
    undefined,
    {},
    { resultados: [] },
    { resultados: [ok('18'), ok('19')] }, // faltando item
    { resultados: [ok('18'), ok('19'), ok('20'), ok('21')] }, // item a mais
    { resultados: [ok('19'), ok('18'), ok('20')] }, // fora de ordem
    { resultados: [ok('18'), ok('19'), { idLocal: '20', status: 'CONFIRMADA' }] }, // sem validacaoId
    { resultados: [ok('18'), ok('19'), { idLocal: '20', status: 'CONFIRMADA', validacaoId: -1 }] },
    { resultados: [ok('18'), ok('19'), { idLocal: '20', status: 'OK' }] }, // status desconhecido
    { resultados: [ok('18'), ok('19'), { idLocal: '20', status: 'CONFLITO' }] }, // sem motivo
    { resultados: [ok('18'), ok('19'), { idLocal: '20', status: 'REJEITADA', motivo: 'QUALQUER' }] },
    { resultados: [ok('18'), ok('19'), { idLocal: '20', status: 'JA_PROCESSADA', resultadoOriginal: 'JA_PROCESSADA' }] },
  ];
  for (const resposta of invalidas) {
    assert.throws(() => validarResultados(lote, resposta), { codigo: 'CONTRATO' });
  }
});
