// Tela de seleção do evento.
// A lista vem de buscarEventos() (GET /eventos), por enquanto com dados simulados.

import { buscarEventos } from '../api.js';
import { salvarEvento } from '../selecao.js';

function formatarData(dataISO) {
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano}`;
}

export async function telaEventos(app) {
  app.innerHTML = `
    <header class="cabecalho">
      <h1>Eventos</h1>
      <a href="#/login">Sair</a>
    </header>

    <section class="conteudo">
      <p class="subtitulo">Selecione o evento em que você vai trabalhar.</p>
      <ul class="lista" id="lista-eventos">
        <li class="subtitulo">Carregando eventos...</li>
      </ul>
    </section>
  `;

  const eventos = await buscarEventos();
  const lista = app.querySelector('#lista-eventos');

  lista.innerHTML = eventos
    .map(
      (evento) => `
        <li>
          <a class="item-lista" href="#/portoes" data-id="${evento.id}">
            <strong>${evento.nome}</strong>
            <span>${formatarData(evento.data)} · ${evento.local}</span>
          </a>
        </li>
      `
    )
    .join('');

  // Antes de ir para a tela de portões, guarda qual evento foi escolhido.
  lista.querySelectorAll('[data-id]').forEach((link) => {
    link.addEventListener('click', () => {
      const evento = eventos.find((e) => e.id === Number(link.dataset.id));
      salvarEvento(evento);
    });
  });
}
