// Gestão de eventos e ingressos pela API real.
// No backend atual, só o ADMINISTRADOR pode cadastrar eventos, portões e ingressos.
// Quando o papel GESTOR existir no backend, estas telas passam a atendê-lo.

import { importarIngressos, buscarIngressos } from './api.js';
import { obterIdentidade } from './sessao.js';
import { gerarCodigos, montarCsv, dividirEmImportacoes } from './geracaoIngressos.js';

// Quantas vezes gerar novos códigos se o servidor recusar por código já cadastrado.
const TENTATIVAS_CODIGO_REPETIDO = 3;

export function podeGerenciar() {
  return Boolean(obterIdentidade()?.acessoGlobal);
}

// Evento aberto na tela de detalhes (sessionStorage desta aba).
export function selecionarEventoGestao(eventoId) {
  sessionStorage.setItem('eventoGestao', String(eventoId));
}

export function obterEventoGestaoId() {
  return Number(sessionStorage.getItem('eventoGestao'));
}

/**
 * Cria ingressos no servidor para um ou mais portões do evento.
 * @param {number} eventoId
 * @param {Array<{ portaoId: number, quantidade: number }>} pedidos
 * @returns {Promise<number>} quantidade de ingressos criados
 *
 * Cada importação é "tudo ou nada" no servidor. Se for recusada (ex.: um código
 * sorteado já existir), nada foi gravado e é seguro sortear novos códigos e repetir.
 * Se a CONEXÃO falhar, não repetimos sozinhos: o servidor pode ter gravado; a tela
 * mostra as contagens reais para conferir antes de gerar de novo.
 */
export async function criarIngressos(eventoId, pedidos, opcoes) {
  const itens = pedidos.flatMap(({ portaoId, quantidade }) =>
    Array.from({ length: quantidade }, () => ({ eventoId, portaoId })));
  let criados = 0;

  for (const parte of dividirEmImportacoes(itens)) {
    for (let tentativa = 1; ; tentativa++) {
      const codigos = gerarCodigos(parte.length);
      const ingressos = parte.map((item, posicao) => ({ ...item, codigo: codigos[posicao] }));
      try {
        criados += await importarIngressos(eventoId, montarCsv(ingressos), opcoes);
        break;
      } catch (erro) {
        const recusadoSemGravar = erro?.codigo === 'CSV_INVALIDO';
        if (!recusadoSemGravar || tentativa >= TENTATIVAS_CODIGO_REPETIDO) {
          erro.criadosAntesDaFalha = criados;
          throw erro;
        }
      }
    }
  }
  return criados;
}

/**
 * Lista os ingressos de todos os portões do evento, com o nome do portão.
 */
export async function listarIngressosDoEvento(eventoId, portoes, opcoes) {
  const listas = await Promise.all(portoes.map(async (portao) =>
    (await buscarIngressos(eventoId, portao.id, opcoes)).map((ingresso) => ({ ...ingresso, portaoNome: portao.nome }))));
  return listas.flat();
}
