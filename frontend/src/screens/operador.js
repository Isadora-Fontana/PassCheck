// Tela "Meus eventos" do operador (demonstração).
// Mostra todos os eventos em que o operador solicitou acesso, separados em
// aprovados, pendentes e rejeitados, e permite adicionar outro evento pelo código.
// Cada aprovação tem um único portão, definido pelo gestor do evento.
//
// O dispositivo opera um evento por vez (a operação ativa fica no IndexedDB).
// Escolher outro evento leva à preparação, que pede confirmação antes de descartar
// os dados locais da operação anterior. As aprovações dos outros eventos continuam valendo.

import { irPara } from '../router.js';
import { solicitarAcesso, listarEventosDoOperador, STATUS } from '../demo/armazenamentoDemo.js';
import { exigirPerfil, sair, OPERADOR_DEMO, PERFIS } from '../demo/perfilDemo.js';
import { salvarEvento } from '../selecao.js';
import { obterOperacao } from '../db.js';
import { escaparHtml, formatarData } from '../html.js';

export async function telaOperador(app, mensagem = '') {
  if (!exigirPerfil(PERFIS.OPERADOR)) return;

  const meusEventos = listarEventosDoOperador(OPERADOR_DEMO.id);
  const aprovados = meusEventos.filter((item) => item.solicitacao.status === STATUS.APROVADA);
  const pendentes = meusEventos.filter((item) => item.solicitacao.status === STATUS.PENDENTE);
  const rejeitados = meusEventos.filter((item) => item.solicitacao.status === STATUS.REJEITADA);

  // Operação ativa neste dispositivo (pode não existir).
  const operacao = await obterOperacao().catch(() => null);

  app.innerHTML = `
    <header class="cabecalho">
      <h1>Meus eventos</h1>
      <a href="#/login" id="sair">Sair</a>
    </header>

    <section class="conteudo">
      ${mensagem ? `<div class="confirmacao">${escaparHtml(mensagem)}</div>` : ''}

      <button class="botao" type="button" id="adicionar-evento">Adicionar evento</button>
      <div id="area-adicionar" hidden></div>

      ${meusEventos.length === 0 ? '<p class="subtitulo">Você ainda não tem acesso a nenhum evento. Toque em "Adicionar evento" e informe o código recebido do gestor.</p>' : ''}

      ${desenharSecao('Aprovados', aprovados, (item) => desenharAprovado(item, operacao))}
      ${desenharSecao('Pendentes', pendentes, desenharPendente)}
      ${desenharSecao('Rejeitados', rejeitados, desenharRejeitado)}

      ${pendentes.length > 0 ? '<button class="botao botao-secundario" type="button" id="atualizar">Atualizar</button><p class="subtitulo">Demonstração: para aprovar, saia e entre como gestor.</p>' : ''}
    </section>
  `;

  app.querySelector('#sair').addEventListener('click', sair);
  app.querySelector('#atualizar')?.addEventListener('click', () => telaOperador(app));

  const areaAdicionar = app.querySelector('#area-adicionar');
  app.querySelector('#adicionar-evento').addEventListener('click', () => {
    areaAdicionar.hidden = !areaAdicionar.hidden;
    if (!areaAdicionar.hidden) mostrarFormulario(app, areaAdicionar);
  });

  // Escolher um evento aprovado para operar: a preparação usa o portão aprovado
  // para ele e pede confirmação se o dispositivo estiver com outra operação.
  app.querySelectorAll('[data-operar]').forEach((botao) => {
    botao.addEventListener('click', () => {
      const item = aprovados.find((a) => a.evento.id === Number(botao.dataset.operar));
      salvarEvento(item.evento);
      irPara('/preparacao');
    });
  });
}

function desenharSecao(titulo, itens, desenharItem) {
  if (itens.length === 0) return '';
  return `
    <h2>${titulo}</h2>
    ${itens.map(desenharItem).join('')}
  `;
}

function desenharDadosEvento(evento) {
  return `
    <p><strong>${escaparHtml(evento.nome)}</strong></p>
    <p>${formatarData(evento.data)} · ${escaparHtml(evento.local)}</p>
  `;
}

/**
 * Evento aprovado: mostra o portão atribuído e indica se é a operação ativa do dispositivo.
 */
function desenharAprovado({ evento, portao }, operacao) {
  const operacaoAtiva =
    operacao !== null && operacao.eventoId === evento.id && operacao.portaoId === portao.id;

  return `
    <div class="cartao solicitacao">
      <span class="selo-status selo-aprovada">APROVADA</span>
      ${desenharDadosEvento(evento)}
      <p><strong>Seu portão:</strong> ${escaparHtml(portao.nome)}</p>
      ${
        operacaoAtiva
          ? `<p class="subtitulo">Operação ativa neste dispositivo.</p>
             <a class="botao" href="#/scanner">Continuar operação</a>
             <button class="botao botao-secundario" type="button" data-operar="${evento.id}">Preparar novamente</button>`
          : `<button class="botao" type="button" data-operar="${evento.id}">Operar neste evento</button>`
      }
    </div>
  `;
}

function desenharPendente({ evento }) {
  return `
    <div class="cartao solicitacao">
      <span class="selo-status">PENDENTE</span>
      ${desenharDadosEvento(evento)}
      <p class="subtitulo">Aguardando aprovação do gestor.</p>
    </div>
  `;
}

function desenharRejeitado({ evento }) {
  return `
    <div class="cartao solicitacao">
      <span class="selo-status selo-rejeitada">REJEITADA</span>
      ${desenharDadosEvento(evento)}
      <p class="subtitulo">Solicitação rejeitada pelo gestor. Você pode solicitar novamente pelo código.</p>
    </div>
  `;
}

/**
 * Formulário para informar o código de um evento e solicitar acesso.
 */
function mostrarFormulario(app, area) {
  area.innerHTML = `
    <form class="formulario cartao" id="form-codigo" novalidate>
      <div class="campo">
        <label for="codigo-evento">Código do evento</label>
        <input id="codigo-evento" type="text" placeholder="EVT-XXXXXX" maxlength="20"
               autocomplete="off" autocapitalize="characters" spellcheck="false" />
      </div>
      <div class="aviso" id="erro-codigo" hidden></div>
      <button class="botao" type="submit">Solicitar acesso</button>
    </form>
  `;

  const campo = area.querySelector('#codigo-evento');
  campo.focus();

  area.querySelector('#form-codigo').addEventListener('submit', (evento) => {
    evento.preventDefault();
    const erro = area.querySelector('#erro-codigo');

    if (!campo.value.trim()) {
      erro.textContent = 'Informe o código do evento.';
      erro.hidden = false;
      return;
    }

    try {
      solicitarAcesso(campo.value, OPERADOR_DEMO);
      telaOperador(app, 'Solicitação enviada. Aguarde a aprovação do gestor.');
    } catch (falha) {
      erro.textContent = falha.message;
      erro.hidden = false;
    }
  });
}
