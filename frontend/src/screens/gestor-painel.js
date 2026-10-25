// Painel do gestor (demonstração): lista de eventos e opção de criar evento.

import { listarEventos, contarSolicitacoesPendentes } from '../demo/armazenamentoDemo.js';
import { exigirPerfil, sair, selecionarEventoGestor, PERFIS } from '../demo/perfilDemo.js';
import { escaparHtml, formatarData } from '../html.js';

export function telaGestorPainel(app) {
  if (!exigirPerfil(PERFIS.GESTOR)) return;

  const eventos = listarEventos();

  app.innerHTML = `
    <header class="cabecalho">
      <h1>Painel do gestor</h1>
      <a href="#/login" id="sair">Sair</a>
    </header>

    <section class="conteudo">
      <a class="botao" href="#/gestor/novo-evento">Criar evento</a>

      <p class="subtitulo">Seus eventos</p>
      <ul class="lista">
        ${eventos.map(desenharItemEvento).join('')}
      </ul>
    </section>
  `;

  app.querySelector('#sair').addEventListener('click', sair);

  // Antes de abrir os detalhes, guarda qual evento foi escolhido.
  app.querySelectorAll('[data-id]').forEach((link) => {
    link.addEventListener('click', () => selecionarEventoGestor(link.dataset.id));
  });
}

function desenharItemEvento(evento) {
  const pendentes = contarSolicitacoesPendentes(evento.id);
  const avisoPendentes =
    pendentes > 0 ? `<span class="selo-status">${pendentes} solicitação(ões) pendente(s)</span>` : '';

  return `
    <li>
      <a class="item-lista" href="#/gestor/evento" data-id="${evento.id}">
        <strong>${escaparHtml(evento.nome)}</strong>
        <span>${formatarData(evento.data)} · ${escaparHtml(evento.local)}</span>
        <span class="codigo-pequeno">${evento.codigo}</span>
        ${avisoPendentes}
      </a>
    </li>
  `;
}
