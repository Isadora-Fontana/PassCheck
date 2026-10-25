// Detalhes de um evento do gestor (demonstração):
// código do evento, portões, solicitações pendentes (aprovar com portão / rejeitar)
// e operadores aprovados (com opção de alterar o portão atribuído).

import { irPara } from '../router.js';
import {
  obterEvento,
  listarPortoesDoEvento,
  listarSolicitacoes,
  aprovarSolicitacao,
  rejeitarSolicitacao,
  alterarPortaoAtribuido,
  STATUS,
} from '../demo/armazenamentoDemo.js';
import { exigirPerfil, obterEventoGestorId, PERFIS } from '../demo/perfilDemo.js';
import { escaparHtml, formatarData } from '../html.js';

export function telaGestorEvento(app, mensagem = '') {
  if (!exigirPerfil(PERFIS.GESTOR)) return;

  const evento = obterEvento(obterEventoGestorId());
  if (!evento) {
    irPara('/gestor');
    return;
  }

  const portoes = listarPortoesDoEvento(evento.id);
  const pendentes = listarSolicitacoes(evento.id, STATUS.PENDENTE);
  const aprovadas = listarSolicitacoes(evento.id, STATUS.APROVADA);

  app.innerHTML = `
    <header class="cabecalho">
      <a href="#/gestor">← Voltar</a>
      <h1>Evento</h1>
    </header>

    <section class="conteudo">
      <div class="cartao">
        <p><strong>${escaparHtml(evento.nome)}</strong></p>
        <p>${formatarData(evento.data)} · ${escaparHtml(evento.local)}</p>
      </div>

      <div class="codigo-evento">
        <span>Código do evento</span>
        <strong>${evento.codigo}</strong>
        <small>Compartilhe com os operadores para que solicitem acesso.</small>
      </div>

      ${mensagem ? `<div class="confirmacao">${escaparHtml(mensagem)}</div>` : ''}

      <h2>Portões</h2>
      <ul class="lista-simples">
        ${portoes.map((portao) => `<li>${escaparHtml(portao.nome)}</li>`).join('')}
      </ul>

      <h2>Solicitações pendentes</h2>
      ${
        pendentes.length === 0
          ? '<p class="subtitulo">Nenhuma solicitação pendente.</p>'
          : pendentes.map((s) => desenharSolicitacaoPendente(s, portoes)).join('')
      }

      <h2>Operadores aprovados</h2>
      ${
        aprovadas.length === 0
          ? '<p class="subtitulo">Nenhum operador aprovado.</p>'
          : aprovadas.map((s) => desenharOperadorAprovado(s, portoes)).join('')
      }
    </section>
  `;

  // Aprovar: a escolha de um portão do evento é obrigatória.
  app.querySelectorAll('[data-aprovar]').forEach((botao) => {
    botao.addEventListener('click', () => {
      executarAcao(app, botao, (portaoId) => {
        aprovarSolicitacao(Number(botao.dataset.aprovar), portaoId);
        return 'Solicitação aprovada.';
      });
    });
  });

  app.querySelectorAll('[data-rejeitar]').forEach((botao) => {
    botao.addEventListener('click', () => {
      rejeitarSolicitacao(Number(botao.dataset.rejeitar));
      telaGestorEvento(app, 'Solicitação rejeitada.');
    });
  });

  app.querySelectorAll('[data-alterar]').forEach((botao) => {
    botao.addEventListener('click', () => {
      executarAcao(app, botao, (portaoId) => {
        alterarPortaoAtribuido(Number(botao.dataset.alterar), portaoId);
        return 'Portão do operador alterado.';
      });
    });
  });
}

/**
 * Lê o portão escolhido no cartão do botão, executa a ação e redesenha a tela.
 * Se nenhum portão foi escolhido (ou a ação falhar), mostra o erro no próprio cartão.
 */
function executarAcao(app, botao, acao) {
  const cartao = botao.closest('.cartao');
  const erro = cartao.querySelector('.erro-acao');
  const portaoId = Number(cartao.querySelector('select').value);

  if (!portaoId) {
    erro.textContent = 'Escolha um portão.';
    erro.hidden = false;
    return;
  }

  try {
    const mensagem = acao(portaoId);
    telaGestorEvento(app, mensagem);
  } catch (falha) {
    erro.textContent = falha.message;
    erro.hidden = false;
  }
}

function desenharOpcoesPortao(portoes, portaoSelecionadoId) {
  return portoes
    .map(
      (portao) =>
        `<option value="${portao.id}" ${portao.id === portaoSelecionadoId ? 'selected' : ''}>${escaparHtml(portao.nome)}</option>`
    )
    .join('');
}

function formatarDataHora(dataISO) {
  return new Date(dataISO).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function desenharSolicitacaoPendente(solicitacao, portoes) {
  return `
    <div class="cartao solicitacao">
      <p><strong>${escaparHtml(solicitacao.operadorNome)}</strong></p>
      <p class="subtitulo">Solicitado em ${formatarDataHora(solicitacao.criadaEm)}</p>
      <div class="campo">
        <label for="portao-${solicitacao.id}">Portão para este operador</label>
        <select id="portao-${solicitacao.id}">
          <option value="">Escolha um portão</option>
          ${desenharOpcoesPortao(portoes, null)}
        </select>
      </div>
      <div class="aviso erro-acao" hidden></div>
      <div class="grade-botoes">
        <button class="botao" type="button" data-aprovar="${solicitacao.id}">Aprovar</button>
        <button class="botao botao-secundario" type="button" data-rejeitar="${solicitacao.id}">Rejeitar</button>
      </div>
    </div>
  `;
}

function desenharOperadorAprovado(solicitacao, portoes) {
  return `
    <div class="cartao solicitacao">
      <p><strong>${escaparHtml(solicitacao.operadorNome)}</strong></p>
      <div class="campo">
        <label for="portao-${solicitacao.id}">Portão atribuído</label>
        <select id="portao-${solicitacao.id}">
          ${desenharOpcoesPortao(portoes, solicitacao.portaoId)}
        </select>
      </div>
      <div class="aviso erro-acao" hidden></div>
      <button class="botao botao-secundario" type="button" data-alterar="${solicitacao.id}">Alterar portão</button>
    </div>
  `;
}
