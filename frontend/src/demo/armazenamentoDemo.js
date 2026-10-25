// Dados de DEMONSTRAÇÃO do gestor e do operador: eventos, portões, códigos
// de evento e solicitações de acesso.
//
// Ficam no localStorage, na chave 'passcheck-demo', separados dos dados
// operacionais do IndexedDB (ingressos, operação e validações pendentes),
// que este arquivo nunca acessa.
//
// São temporários: serão substituídos pela API quando o Gabriel criar os
// endpoints de eventos, código do evento e solicitações de acesso.
// O formato destes dados NÃO é um contrato da API.

import { eventosMock, portoesMock } from '../mocks/eventos.js';

const CHAVE_ARMAZENAMENTO = 'passcheck-demo';

// Sem 0/O e 1/I/L, para evitar confusão ao digitar o código.
const CARACTERES_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TAMANHO_CODIGO = 6;

export const STATUS = {
  PENDENTE: 'PENDENTE',
  APROVADA: 'APROVADA',
  REJEITADA: 'REJEITADA',
};

// ---------- Leitura e gravação ----------

function lerDados() {
  const salvo = localStorage.getItem(CHAVE_ARMAZENAMENTO);
  if (salvo) return JSON.parse(salvo);

  // Primeira vez: começa com os eventos e portões dos mocks, cada evento com um código.
  const dados = { eventos: [], portoes: [...portoesMock], solicitacoes: [] };
  eventosMock.forEach((evento) => {
    dados.eventos.push({ ...evento, codigo: gerarCodigoEvento(dados.eventos) });
  });
  gravarDados(dados);
  return dados;
}

function gravarDados(dados) {
  localStorage.setItem(CHAVE_ARMAZENAMENTO, JSON.stringify(dados));
}

function proximoId(lista) {
  return lista.reduce((maior, item) => Math.max(maior, item.id), 0) + 1;
}

/**
 * Gera um código demonstrativo no formato EVT-XXXXXX, diferente dos já existentes.
 */
function gerarCodigoEvento(eventosExistentes) {
  const codigosUsados = new Set(eventosExistentes.map((evento) => evento.codigo));
  let codigo;
  do {
    const sorteio = crypto.getRandomValues(new Uint32Array(TAMANHO_CODIGO));
    const letras = Array.from(sorteio, (numero) => CARACTERES_CODIGO[numero % CARACTERES_CODIGO.length]);
    codigo = 'EVT-' + letras.join('');
  } while (codigosUsados.has(codigo));
  return codigo;
}

// ---------- Eventos e portões ----------

export function listarEventos() {
  return lerDados().eventos;
}

export function obterEvento(eventoId) {
  return lerDados().eventos.find((evento) => evento.id === eventoId) || null;
}

export function listarPortoesDoEvento(eventoId) {
  return lerDados().portoes.filter((portao) => portao.eventoId === eventoId);
}

/**
 * Cria um evento com seus portões e um código exclusivo.
 * @param {{ nome: string, data: string, local: string, nomesPortoes: string[] }} novoEvento
 * @returns o evento criado (com id e codigo)
 */
export function criarEvento({ nome, data, local, nomesPortoes }) {
  const dados = lerDados();

  const evento = {
    id: proximoId(dados.eventos),
    nome,
    data,
    local,
    codigo: gerarCodigoEvento(dados.eventos),
  };
  dados.eventos.push(evento);

  nomesPortoes.forEach((nomePortao) => {
    dados.portoes.push({ id: proximoId(dados.portoes), eventoId: evento.id, nome: nomePortao });
  });

  gravarDados(dados);
  return evento;
}

// ---------- Solicitações de acesso ----------

/**
 * O operador informa o código do evento e solicita acesso.
 * Um operador pode ter acesso a vários eventos, cada um aprovado separadamente.
 * Lança um erro com mensagem amigável se o código não existir ou se o operador
 * já tiver uma solicitação pendente ou aprovada para o mesmo evento.
 * Depois de uma rejeição, é possível solicitar de novo.
 */
export function solicitarAcesso(codigoDigitado, operador) {
  const dados = lerDados();
  const codigo = codigoDigitado.trim().toUpperCase();

  const evento = dados.eventos.find((e) => e.codigo === codigo);
  if (!evento) {
    throw new Error('Código não encontrado. Confira o código informado pelo gestor.');
  }

  const situacaoAtual = ultimaSolicitacaoDoEvento(dados, operador.id, evento.id);
  if (situacaoAtual && situacaoAtual.status === STATUS.PENDENTE) {
    throw new Error('Você já tem uma solicitação pendente para este evento.');
  }
  if (situacaoAtual && situacaoAtual.status === STATUS.APROVADA) {
    throw new Error('Você já tem acesso a este evento.');
  }

  const solicitacao = {
    id: proximoId(dados.solicitacoes),
    eventoId: evento.id,
    operadorId: operador.id,
    operadorNome: operador.nome,
    status: STATUS.PENDENTE,
    portaoId: null,
    criadaEm: new Date().toISOString(),
  };
  dados.solicitacoes.push(solicitacao);
  gravarDados(dados);
  return solicitacao;
}

/**
 * Solicitação mais recente do operador para um evento (ou null).
 * É ela que define a situação do operador naquele evento.
 */
function ultimaSolicitacaoDoEvento(dados, operadorId, eventoId) {
  const doEvento = dados.solicitacoes.filter(
    (s) => s.operadorId === operadorId && s.eventoId === eventoId
  );
  return doEvento.length > 0 ? doEvento[doEvento.length - 1] : null;
}

/**
 * Todos os eventos em que o operador já solicitou acesso, com a situação atual
 * de cada um (a solicitação mais recente daquele evento).
 * Aprovações de eventos diferentes são independentes: escolher outro evento
 * para operar não remove nenhuma delas.
 * @returns {Array<{ solicitacao: object, evento: object, portao: object | null }>}
 */
export function listarEventosDoOperador(operadorId) {
  const dados = lerDados();
  const idsDosEventos = [
    ...new Set(dados.solicitacoes.filter((s) => s.operadorId === operadorId).map((s) => s.eventoId)),
  ];

  return idsDosEventos
    .map((eventoId) => {
      const solicitacao = ultimaSolicitacaoDoEvento(dados, operadorId, eventoId);
      const evento = dados.eventos.find((e) => e.id === eventoId);
      const portao = dados.portoes.find((p) => p.id === solicitacao.portaoId) || null;
      return { solicitacao, evento, portao };
    })
    .filter((item) => item.evento);
}

export function listarSolicitacoes(eventoId, status) {
  return lerDados().solicitacoes.filter((s) => s.eventoId === eventoId && s.status === status);
}

export function contarSolicitacoesPendentes(eventoId) {
  return listarSolicitacoes(eventoId, STATUS.PENDENTE).length;
}

/**
 * Confere se o portão pertence ao evento da solicitação.
 */
function validarPortaoDoEvento(dados, solicitacao, portaoId) {
  const portao = dados.portoes.find((p) => p.id === portaoId);
  if (!portao || portao.eventoId !== solicitacao.eventoId) {
    throw new Error('Escolha um portão deste evento.');
  }
}

function encontrarSolicitacao(dados, solicitacaoId, statusEsperado) {
  const solicitacao = dados.solicitacoes.find((s) => s.id === solicitacaoId);
  if (!solicitacao || solicitacao.status !== statusEsperado) {
    throw new Error('Esta solicitação já foi atualizada. Recarregue a tela.');
  }
  return solicitacao;
}

/**
 * Aprova a solicitação. A escolha de um portão do evento é obrigatória.
 */
export function aprovarSolicitacao(solicitacaoId, portaoId) {
  const dados = lerDados();
  const solicitacao = encontrarSolicitacao(dados, solicitacaoId, STATUS.PENDENTE);
  validarPortaoDoEvento(dados, solicitacao, portaoId);

  solicitacao.status = STATUS.APROVADA;
  solicitacao.portaoId = portaoId;
  gravarDados(dados);
}

export function rejeitarSolicitacao(solicitacaoId) {
  const dados = lerDados();
  const solicitacao = encontrarSolicitacao(dados, solicitacaoId, STATUS.PENDENTE);

  solicitacao.status = STATUS.REJEITADA;
  gravarDados(dados);
}

/**
 * O gestor altera o portão de um operador já aprovado.
 */
export function alterarPortaoAtribuido(solicitacaoId, portaoId) {
  const dados = lerDados();
  const solicitacao = encontrarSolicitacao(dados, solicitacaoId, STATUS.APROVADA);
  validarPortaoDoEvento(dados, solicitacao, portaoId);

  solicitacao.portaoId = portaoId;
  gravarDados(dados);
}

/**
 * Evento e portão que o operador está autorizado a usar NAQUELE evento,
 * ou null se ele não tiver aprovação para o evento.
 * @returns {{ evento: object, portao: object } | null}
 */
export function obterAtribuicao(operadorId, eventoId) {
  const dados = lerDados();
  const solicitacao = ultimaSolicitacaoDoEvento(dados, operadorId, eventoId);
  if (!solicitacao || solicitacao.status !== STATUS.APROVADA) return null;

  const evento = dados.eventos.find((e) => e.id === solicitacao.eventoId);
  const portao = dados.portoes.find((p) => p.id === solicitacao.portaoId);
  if (!evento || !portao) return null;

  return { evento, portao };
}
