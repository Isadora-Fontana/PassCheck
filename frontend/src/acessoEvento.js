// Código do evento e solicitações de acesso dos operadores — MODO DEMONSTRAÇÃO.
//
// O back-end ainda não tem o papel GESTOR, o código do evento nem a solicitação/aprovação
// de operadores. Até o Gabriel criar esses endpoints, estes dados ficam somente NESTE
// NAVEGADOR (localStorage, chave 'passcheck-acesso-demo'), ligados aos eventos reais
// pelo id do servidor. Por isso:
// - gestor e operador precisam usar o mesmo navegador para a demonstração funcionar;
// - a permissão real é concedida pela tela do gestor no servidor (POST
//   /eventos/:id/operadores) ANTES de marcar a solicitação como aprovada aqui.
// O formato destes dados NÃO é contrato da API. Nunca acessa o IndexedDB.

const CHAVE = 'passcheck-acesso-demo';
const CARACTERES = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const STATUS = { PENDENTE: 'PENDENTE', APROVADA: 'APROVADA', REJEITADA: 'REJEITADA' };

function ler() {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE));
    if (salvo?.eventos && Array.isArray(salvo.solicitacoes)) return salvo;
  } catch { /* Dados ausentes ou inválidos: começa vazio. */ }
  return { eventos: {}, solicitacoes: [] };
}

function gravar(dados) {
  localStorage.setItem(CHAVE, JSON.stringify(dados));
}

function sortearCodigo(usados) {
  let codigo;
  do {
    const limite = Math.floor(256 / CARACTERES.length) * CARACTERES.length;
    codigo = 'EVT-';
    while (codigo.length < 10) {
      const [byte] = crypto.getRandomValues(new Uint8Array(1));
      if (byte < limite) codigo += CARACTERES[byte % CARACTERES.length];
    }
  } while (usados.has(codigo));
  return codigo;
}

// ---------- Gestor ----------

/**
 * Código exclusivo do evento (criado na primeira vez que o gestor abre o evento).
 * Guarda também nome, data e local para o operador ver a qual evento o código pertence.
 */
export function obterCodigoEvento(evento) {
  const dados = ler();
  const atual = dados.eventos[evento.id];
  if (atual) {
    dados.eventos[evento.id] = { ...atual, nome: evento.nome, data: evento.data, local: evento.local };
  } else {
    const usados = new Set(Object.values(dados.eventos).map((item) => item.codigo));
    dados.eventos[evento.id] = { codigo: sortearCodigo(usados), nome: evento.nome, data: evento.data, local: evento.local };
  }
  gravar(dados);
  return dados.eventos[evento.id].codigo;
}

export function listarSolicitacoesDoEvento(eventoId, status) {
  return ler().solicitacoes.filter((s) => s.eventoId === eventoId && s.status === status);
}

export function contarSolicitacoesPendentes(eventoId) {
  return listarSolicitacoesDoEvento(eventoId, STATUS.PENDENTE).length;
}

function alterarSolicitacao(id, statusEsperado, mudar) {
  const dados = ler();
  const solicitacao = dados.solicitacoes.find((s) => s.id === id);
  if (!solicitacao || solicitacao.status !== statusEsperado) {
    throw new Error('Esta solicitação já foi atualizada. Recarregue a tela.');
  }
  mudar(solicitacao);
  gravar(dados);
}

/** Aprova a solicitação. O portão (do próprio evento) é obrigatório. */
export function aprovarSolicitacao(id, portao) {
  if (!portao) throw new Error('Escolha um portão.');
  alterarSolicitacao(id, STATUS.PENDENTE, (s) => {
    if (portao.eventoId !== s.eventoId) throw new Error('Escolha um portão deste evento.');
    Object.assign(s, { status: STATUS.APROVADA, portaoId: portao.id, portaoNome: portao.nome });
  });
}

export function rejeitarSolicitacao(id) {
  alterarSolicitacao(id, STATUS.PENDENTE, (s) => { s.status = STATUS.REJEITADA; });
}

/** Altera o portão de um operador já aprovado. */
export function alterarPortaoAprovado(id, portao) {
  if (!portao) throw new Error('Escolha um portão.');
  alterarSolicitacao(id, STATUS.APROVADA, (s) => {
    if (portao.eventoId !== s.eventoId) throw new Error('Escolha um portão deste evento.');
    Object.assign(s, { portaoId: portao.id, portaoNome: portao.nome });
  });
}

// ---------- Operador ----------

/**
 * O operador informa o código do evento e solicita acesso.
 * Recusa código inexistente e pedido repetido (pendente ou aprovado) para o mesmo evento.
 */
export function solicitarAcesso(codigoDigitado, usuario) {
  const dados = ler();
  const codigo = String(codigoDigitado).trim().toUpperCase();
  const entrada = Object.entries(dados.eventos).find(([, evento]) => evento.codigo === codigo);
  if (!entrada) throw new Error('Código não encontrado. Confira o código informado pelo gestor.');
  const eventoId = Number(entrada[0]);

  const atual = situacaoNoEvento(dados, usuario.id, eventoId);
  if (atual?.status === STATUS.PENDENTE) throw new Error('Você já tem uma solicitação pendente para este evento.');
  if (atual?.status === STATUS.APROVADA) throw new Error('Você já foi aprovado neste evento.');

  dados.solicitacoes.push({
    id: dados.solicitacoes.reduce((maior, s) => Math.max(maior, s.id), 0) + 1,
    eventoId, operadorId: usuario.id, operadorNome: usuario.usuario,
    status: STATUS.PENDENTE, portaoId: null, portaoNome: null, criadaEm: new Date().toISOString(),
  });
  gravar(dados);
}

// A solicitação mais recente do operador em um evento define a situação dele ali.
function situacaoNoEvento(dados, operadorId, eventoId) {
  const doEvento = dados.solicitacoes.filter((s) => s.operadorId === operadorId && s.eventoId === eventoId);
  return doEvento.at(-1) || null;
}

/**
 * Situação do operador em cada evento em que pediu acesso, com os dados do evento.
 */
export function listarSolicitacoesDoOperador(operadorId) {
  const dados = ler();
  const ids = [...new Set(dados.solicitacoes.filter((s) => s.operadorId === operadorId).map((s) => s.eventoId))];
  return ids.map((eventoId) => ({ solicitacao: situacaoNoEvento(dados, operadorId, eventoId), evento: dados.eventos[eventoId] }))
    .filter((item) => item.evento);
}
