// Perfis de DEMONSTRAÇÃO (gestor e operador).
// Não há autenticação real: o perfil escolhido no login fica apenas no
// sessionStorage desta aba. A autenticação real será integrada depois com o back-end.

import { irPara } from '../router.js';

export const PERFIS = {
  GESTOR: 'GESTOR',
  OPERADOR: 'OPERADOR',
};

// Operador único da demonstração.
export const OPERADOR_DEMO = { id: 'operador-demo', nome: 'Operador Demo' };

export function entrarComo(perfil) {
  sessionStorage.setItem('perfilDemo', perfil);
}

/**
 * Sai do perfil de demonstração. Não apaga nenhum dado:
 * nem os dados da demonstração, nem os dados operacionais do IndexedDB.
 */
export function sair() {
  sessionStorage.removeItem('perfilDemo');
  sessionStorage.removeItem('eventoGestor');
}

export function obterPerfil() {
  return sessionStorage.getItem('perfilDemo');
}

/**
 * Leva para a tela inicial do perfil atual (ou para o login, se não houver perfil).
 */
export function irParaInicioDoPerfil() {
  const perfil = obterPerfil();
  if (perfil === PERFIS.GESTOR) irPara('/gestor');
  else if (perfil === PERFIS.OPERADOR) irPara('/operador');
  else irPara('/login');
}

/**
 * Usada no início das telas: se o perfil atual não for o exigido,
 * redireciona e devolve false (a tela não deve ser desenhada).
 */
export function exigirPerfil(perfilExigido) {
  if (obterPerfil() === perfilExigido) return true;
  irParaInicioDoPerfil();
  return false;
}

// Evento aberto na tela de detalhes do gestor.
export function selecionarEventoGestor(eventoId) {
  sessionStorage.setItem('eventoGestor', String(eventoId));
}

export function obterEventoGestorId() {
  return Number(sessionStorage.getItem('eventoGestor'));
}
