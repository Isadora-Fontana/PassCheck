// Tela de seleção do portão do evento escolhido.
// A lista vem de buscarPortoes() (GET /eventos/:eventoId/portoes), por enquanto com dados simulados.

import { irPara } from '../router.js';
import { buscarPortoes } from '../api.js';
import { obterEvento, salvarPortao } from '../selecao.js';

export async function telaPortoes(app) {
  const evento = obterEvento();

  // Sem evento escolhido não há portões para mostrar.
  if (!evento) {
    irPara('/eventos');
    return;
  }

  app.innerHTML = `
    <header class="cabecalho">
      <a href="#/eventos">← Voltar</a>
      <h1>Portões</h1>
    </header>

    <section class="conteudo">
      <p class="subtitulo">${evento.nome}: selecione o portão deste dispositivo.</p>
      <ul class="lista" id="lista-portoes">
        <li class="subtitulo">Carregando portões...</li>
      </ul>
    </section>
  `;

  const portoes = await buscarPortoes(evento.id);
  const lista = app.querySelector('#lista-portoes');

  lista.innerHTML = portoes
    .map(
      (portao) => `
        <li>
          <a class="item-lista" href="#/preparacao" data-id="${portao.id}">
            <strong>${portao.nome}</strong>
          </a>
        </li>
      `
    )
    .join('');

  // Antes de ir para a preparação, guarda qual portão foi escolhido.
  lista.querySelectorAll('[data-id]').forEach((link) => {
    link.addEventListener('click', () => {
      const portao = portoes.find((p) => p.id === Number(link.dataset.id));
      salvarPortao(portao);
    });
  });
}
