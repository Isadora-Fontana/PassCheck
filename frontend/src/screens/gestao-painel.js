// Painel do GESTOR: lista os eventos (com solicitações pendentes) e permite criar um novo.
// Usa a API real; no backend atual, apenas o ADMINISTRADOR tem acesso.
import { irPara } from '../router.js';
import { buscarEventos } from '../api.js';
import { obterIdentidade } from '../sessao.js';
import { podeGerenciar, selecionarEventoGestao } from '../gestao.js';
import { escaparHtml, formatarData } from '../html.js';
import { contarSolicitacoesPendentes } from '../acessoEvento.js';

export async function telaGestaoPainel(app, { signal } = {}) {
  if (!obterIdentidade()) { irPara('/login'); return; }
  if (!podeGerenciar()) { irPara('/eventos'); return; }

  app.innerHTML = `<header class="cabecalho"><a href="#/eventos">← Voltar</a><h1>Painel do gestor</h1></header>
    <section class="conteudo">
      <a class="botao" href="#/gestor/novo-evento">Criar evento</a>
      <p id="mensagem" class="subtitulo" role="status">Carregando eventos...</p>
      <ul id="eventos" class="lista"></ul>
    </section>`;

  const eventos = await buscarEventos({ signal });
  if (signal?.aborted) return;
  app.querySelector('#mensagem').textContent = eventos.length
    ? 'Selecione um evento para ver o código, as solicitações, os portões e os ingressos.' : 'Nenhum evento cadastrado.';
  app.querySelector('#eventos').innerHTML = eventos.map((evento) => `<li>
      <button type="button" class="item-lista botao-evento" data-id="${evento.id}">
        <strong>${escaparHtml(evento.nome)}</strong>
        <span>${escaparHtml(formatarData(evento.data))} · ${escaparHtml(evento.local)}</span>
        ${contarSolicitacoesPendentes(evento.id) ? `<span class="selo-status">${contarSolicitacoesPendentes(evento.id)} solicitação(ões) pendente(s)</span>` : ''}
      </button></li>`).join('');
  app.querySelectorAll('[data-id]').forEach((botao) => botao.addEventListener('click', () => {
    selecionarEventoGestao(botao.dataset.id);
    irPara('/gestor/evento');
  }));
}
