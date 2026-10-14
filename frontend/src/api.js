// Funções de acesso à API.
// Por enquanto devolvem os dados simulados de src/mocks/.
// Na etapa 4 (integração com API), basta trocar o conteúdo destas funções
// por chamadas fetch; as telas não precisam mudar.

import { eventosMock, portoesMock } from './mocks/eventos.js';
import { ingressosMock } from './mocks/ingressos.js';

// Atraso artificial para simular o tempo de resposta da rede.
const ATRASO_SIMULADO_MS = 800;

function esperar(milissegundos) {
  return new Promise((resolve) => setTimeout(resolve, milissegundos));
}

// GET /eventos
export async function buscarEventos() {
  return eventosMock;
}

// GET /eventos/:eventoId/portoes
export async function buscarPortoes(eventoId) {
  return portoesMock.filter((portao) => portao.eventoId === eventoId);
}

// GET /eventos/:eventoId/portoes/:portaoId/ingressos
export async function buscarIngressos(eventoId, portaoId) {
  await esperar(ATRASO_SIMULADO_MS);
  return ingressosMock.filter(
    (ingresso) => ingresso.eventoId === eventoId && ingresso.portaoId === portaoId
  );
}
