// Envio da fila de validações ao servidor (POST /sincronizacao).
//
// Quando envia: ao entrar na conta, quando a internet volta, quando o app volta a ficar
// visível, logo após cada entrada VÁLIDA e pelo botão "Sincronizar agora".
// Só envia com a conta conectada: o token fica apenas na memória, então depois de
// fechar o app é preciso entrar de novo. Até lá a fila fica guardada no aparelho.
// No iPhone o envio só acontece com o app aberto (não há envio em segundo plano).
//
// Segurança da fila:
// - Um envio por vez, inclusive entre abas (Web Locks, quando o navegador oferece).
// - Nada é marcado como enviado sem uma resposta válida do servidor para cada item.
// - Reenviar é seguro: o servidor reconhece o mesmo idLocal e não conta duas vezes.

import { enviarValidacoes } from './api.js';
import { obterIdentidade } from './sessao.js';
import { montarLotesParaEnvio, aplicarResultadosEnvio } from './db.js';

// Esperas entre tentativas automáticas após falha de rede/servidor (segundos).
const ESPERAS_SEGUNDOS = [1, 2, 4, 8, 16, 30];

let estado = { situacao: 'PARADO', mensagem: '', ultimoEnvio: null };
const ouvintes = new Set();
let envioEmAndamento = null;
let tentativasSeguidas = 0;
let temporizador = null;

function mudarEstado(novo) {
  estado = { ...estado, ...novo };
  ouvintes.forEach((ouvinte) => ouvinte(estado));
}

/**
 * Recebe avisos sempre que o estado do envio muda. Devolve a função para parar de ouvir.
 * Situações: PARADO, ENVIANDO, ENVIADO, AGUARDANDO_LOGIN, AGUARDANDO_NOVA_TENTATIVA, ERRO.
 */
export function aoMudarSincronizacao(ouvinte) {
  ouvintes.add(ouvinte);
  ouvinte(estado);
  return () => ouvintes.delete(ouvinte);
}

/**
 * Envia agora tudo o que aguarda envio. Se já houver um envio em andamento,
 * devolve o mesmo (não cria dois envios simultâneos).
 */
export function sincronizarAgora() {
  if (!envioEmAndamento) {
    clearTimeout(temporizador);
    envioEmAndamento = executarComTrava().finally(() => { envioEmAndamento = null; });
  }
  return envioEmAndamento;
}

// Web Locks impede que duas abas do PassCheck enviem a mesma fila ao mesmo tempo.
async function executarComTrava() {
  if (!navigator.locks?.request) return enviarFila();
  return navigator.locks.request('passcheck-sincronizacao', { ifAvailable: true }, (trava) => {
    if (!trava) return null; // Outra aba já está enviando.
    return enviarFila();
  });
}

async function enviarFila() {
  const me = obterIdentidade();
  if (!me) {
    mudarEstado({ situacao: 'AGUARDANDO_LOGIN', mensagem: 'Entre na sua conta para enviar as validações.' });
    return;
  }

  try {
    const lotes = await montarLotesParaEnvio(me.usuario.id);
    if (lotes.length === 0) {
      tentativasSeguidas = 0;
      mudarEstado({ situacao: 'ENVIADO', mensagem: 'Nada a enviar.' });
      return;
    }

    mudarEstado({ situacao: 'ENVIANDO', mensagem: 'Enviando validações...' });
    let recusadas = 0;
    for (const lote of lotes) {
      const resultados = await enviarValidacoes(lote);
      const contagem = await aplicarResultadosEnvio(lote, resultados);
      recusadas += contagem.recusadas;
    }

    tentativasSeguidas = 0;
    mudarEstado({
      situacao: 'ENVIADO',
      ultimoEnvio: new Date().toISOString(),
      mensagem: recusadas > 0
        ? recusadas + ' validação(ões) recusada(s) pelo servidor. Veja o dashboard.'
        : 'Validações enviadas.',
    });
  } catch (erro) {
    tratarFalha(erro);
  }
}

/**
 * Decide o que fazer depois de uma falha. A fila é sempre preservada.
 * - 401 / sessão ausente: aguarda novo login.
 * - 403, 400, 413, 415 ou resposta fora do contrato: não repete sozinho (precisa de correção).
 * - Rede, tempo esgotado, 429, 5xx: tenta de novo com espera crescente, até 6 vezes.
 */
function tratarFalha(erro) {
  const status = erro?.status ?? 0;

  if (status === 401 || erro?.codigo === 'SESSAO') {
    mudarEstado({ situacao: 'AGUARDANDO_LOGIN', mensagem: 'Sessão expirada. Entre novamente para enviar.' });
    return;
  }

  const temporaria = status === 0 || status === 429 || status >= 500;
  if (!temporaria || erro?.codigo === 'CONTRATO') {
    mudarEstado({ situacao: 'ERRO', mensagem: (erro?.message || 'Falha no envio.') + ' A fila foi preservada.' });
    return;
  }

  if (tentativasSeguidas >= ESPERAS_SEGUNDOS.length) {
    mudarEstado({ situacao: 'ERRO', mensagem: 'Não foi possível enviar. A fila foi preservada; tente novamente mais tarde.' });
    return;
  }

  // Espera crescente com variação aleatória; respeita o Retry-After do servidor.
  const retryAfter = Number(erro?.retryAfter);
  const espera = Math.max(ESPERAS_SEGUNDOS[tentativasSeguidas] * (0.75 + Math.random() * 0.5),
    Number.isFinite(retryAfter) ? retryAfter : 0);
  tentativasSeguidas++;
  mudarEstado({ situacao: 'AGUARDANDO_NOVA_TENTATIVA', mensagem: 'Sem conexão com o servidor. Nova tentativa em instantes.' });
  temporizador = setTimeout(sincronizarAgora, espera * 1000);
}

/**
 * Liga os gatilhos automáticos (chamada uma vez, ao iniciar o app).
 */
export function iniciarSincronizacaoAutomatica() {
  window.addEventListener('online', () => {
    tentativasSeguidas = 0;
    sincronizarAgora();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) sincronizarAgora();
  });
}
