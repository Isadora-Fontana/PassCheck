import { buscarEventos } from '../api.js';
import { obterIdentidade, sessao } from '../sessao.js';
import { obterOperacao } from '../db.js';
import { salvarEvento } from '../selecao.js';
import { irPara } from '../router.js';
import { escaparHtml, formatarData } from '../html.js';
import { solicitarAcesso, listarSolicitacoesDoOperador, STATUS } from '../acessoEvento.js';

export async function telaEventos(app, { signal } = {}) {
  const me = obterIdentidade();
  if (!me) { irPara('/login'); return; }
  app.innerHTML = `<header class="cabecalho"><h1>Meus eventos</h1><button id="sair" class="botao botao-secundario botao-sair">Sair</button></header>
    <section class="conteudo"><p class="subtitulo">${escaparHtml(me.usuario.usuario)} · ${me.acessoGlobal ? 'Gestor (administrador)' : 'Operador'}</p>
      ${me.acessoGlobal ? '' : `
        <form class="formulario cartao" id="form-codigo" novalidate>
          <strong>Vincular-se a um novo evento</strong>
          <div class="campo"><label for="codigo-evento">Código do evento (recebido do gestor)</label>
            <input id="codigo-evento" type="text" placeholder="EVT-XXXXXX" maxlength="20" autocomplete="off"
                   autocapitalize="characters" spellcheck="false" /></div>
          <div class="aviso" id="erro-codigo" role="alert" hidden></div>
          <button class="botao" type="submit">Solicitar acesso</button>
        </form>
        <div class="confirmacao" id="mensagem-solicitacao" hidden></div>
        <div id="solicitacoes"></div>
        <h2>Eventos liberados para operar</h2>`}
      <div id="mensagem" role="status">Carregando eventos...</div><ul id="eventos" class="lista"></ul>
      <a id="continuar" class="botao botao-secundario" href="#/scanner" hidden>Continuar operação preparada</a>
      ${me.acessoGlobal ? '<a class="botao" href="#/gestor">Painel do gestor</a>' : ''}
    </section>`;
  app.querySelector('#sair').addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    try { await sessao.sair(); } catch { /* Saída local concluída; token remoto expira pelo TTL. */ }
    irPara('/login');
  });
  if (!me.acessoGlobal) prepararSolicitacoes(app, me);
  const operacao = await obterOperacao().catch(() => null);
  if (signal?.aborted) return;
  app.querySelector('#continuar').hidden = operacao?.usuarioId !== me.usuario.id;
  try {
    const eventos = await buscarEventos({ signal });
    if (signal?.aborted) return;
    app.querySelector('#mensagem').textContent = me.acessoGlobal
      ? (eventos.length ? 'Selecione um evento para operar como operador. Para criar eventos, ver códigos e aprovar operadores, use o Painel do gestor.' : 'Nenhum evento cadastrado.')
      : (eventos.length ? 'Selecione um evento para operar.' : 'Nenhum evento liberado para operar ainda.');
    app.querySelector('#eventos').innerHTML = eventos.map((evento) => `<li><button class="item-lista botao-evento" data-id="${evento.id}" type="button">
      <strong>${escaparHtml(evento.nome)}</strong><span>${escaparHtml(formatarData(evento.data))} · ${escaparHtml(evento.local)}</span></button></li>`).join('');
    // Gestor e operador: escolher o evento leva à operação (portão → preparação → scanner).
    // A gestão do evento (código, solicitações, ingressos) fica no Painel do gestor.
    app.querySelectorAll('[data-id]').forEach((botao) => botao.addEventListener('click', () => {
      salvarEvento(eventos.find((evento) => evento.id === Number(botao.dataset.id)));
      irPara('/portoes');
    }));
  } catch (error) {
    if (!signal?.aborted) app.querySelector('#mensagem').textContent = error.message;
  }
}

/**
 * Operador: pedir acesso a um evento pelo código (formulário sempre visível no topo)
 * e acompanhar as solicitações.
 * Demonstração até o back-end ter esses endpoints (veja acessoEvento.js): a aprovação
 * mostra o portão definido pelo gestor, mas a liberação real ainda é feita no servidor.
 */
function prepararSolicitacoes(app, me) {
  const form = app.querySelector('#form-codigo');
  form.addEventListener('submit', (envio) => {
    envio.preventDefault();
    const erro = form.querySelector('#erro-codigo');
    const campo = form.querySelector('#codigo-evento');
    erro.hidden = true;
    try {
      if (!campo.value.trim()) throw new Error('Informe o código do evento.');
      solicitarAcesso(campo.value, me.usuario);
      campo.value = '';
      const aviso = app.querySelector('#mensagem-solicitacao');
      aviso.textContent = 'Solicitação enviada. Aguarde a aprovação do gestor.';
      aviso.hidden = false;
      desenharSolicitacoes(app, me);
    } catch (falha) {
      erro.textContent = falha.message;
      erro.hidden = false;
    }
  });
  desenharSolicitacoes(app, me);
}

function desenharSolicitacoes(app, me) {
  const itens = listarSolicitacoesDoOperador(me.usuario.id);
  const secao = (titulo, status, detalhe) => {
    const lista = itens.filter((item) => item.solicitacao.status === status);
    if (!lista.length) return '';
    return `<h2>${titulo}</h2>` + lista.map(({ solicitacao, evento }) => `<div class="cartao solicitacao">
        <span class="selo-status ${status === STATUS.APROVADA ? 'selo-aprovada' : status === STATUS.REJEITADA ? 'selo-rejeitada' : ''}">${status}</span>
        <p><strong>${escaparHtml(evento.nome)}</strong></p>
        <p>${escaparHtml(formatarData(evento.data))} · ${escaparHtml(evento.local)}</p>
        ${detalhe(solicitacao)}
      </div>`).join('');
  };
  app.querySelector('#solicitacoes').innerHTML = itens.length ? `
    <p class="aviso-campo">Quando o gestor aprova, o evento aparece em "Eventos liberados para operar". As solicitações ficam salvas neste navegador.</p>
    ${secao('Aprovados', STATUS.APROVADA, (s) => `<p><strong>Seu portão:</strong> ${escaparHtml(s.portaoNome)}</p>`)}
    ${secao('Pendentes', STATUS.PENDENTE, () => '<p class="subtitulo">Aguardando aprovação do gestor.</p>')}
    ${secao('Rejeitados', STATUS.REJEITADA, () => '<p class="subtitulo">Solicitação rejeitada. Você pode solicitar novamente pelo código.</p>')}` : '';
}
