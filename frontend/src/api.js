// Funções de acesso à API.
// Por enquanto devolvem dados simulados:
// - eventos e portões vêm dos dados de demonstração (src/demo/armazenamentoDemo.js),
//   que começam com os mocks de src/mocks/eventos.js e incluem os eventos criados pelo gestor;
// - ingressos vêm de src/mocks/ingressos.js.
// O formato das respostas é o mesmo do contrato da API.
// Na etapa de integração com a API, basta trocar o conteúdo destas funções
// por chamadas fetch; as telas não precisam mudar.

import { listarEventos, listarPortoesDoEvento } from './demo/armazenamentoDemo.js';
import { ingressosMock } from './mocks/ingressos.js';

// Atraso artificial para simular o tempo de resposta da rede.
const ATRASO_SIMULADO_MS = 800;

function esperar(milissegundos) {
  return new Promise((resolve) => setTimeout(resolve, milissegundos));
}

// GET /eventos
export async function buscarEventos() {
  // O código do evento é um dado da demonstração e não faz parte desta resposta.
  return listarEventos().map(({ id, nome, data, local }) => ({ id, nome, data, local }));
}

// GET /eventos/:eventoId/portoes
export async function buscarPortoes(eventoId) {
  return listarPortoesDoEvento(eventoId);
}

// GET /eventos/:eventoId/portoes/:portaoId/ingressos
export async function buscarIngressos(eventoId, portaoId) {
  await esperar(ATRASO_SIMULADO_MS);
  return ingressosMock.filter(
    (ingresso) => ingresso.eventoId === eventoId && ingresso.portaoId === portaoId
  );
}
