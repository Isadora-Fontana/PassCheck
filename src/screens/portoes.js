// Tela de seleção do portão do evento escolhido.
// Por enquanto a lista é um exemplo fixo; os portões virão da API (GET /eventos/:eventoId/portoes).

export function telaPortoes(app) {
  app.innerHTML = `
    <header class="cabecalho">
      <a href="#/eventos">← Voltar</a>
      <h1>Portões</h1>
    </header>

    <section class="conteudo">
      <p class="subtitulo">Selecione o portão deste dispositivo.</p>

      <ul class="lista">
        <li><a class="item-lista" href="#/preparacao"><strong>Portão A</strong></a></li>
        <li><a class="item-lista" href="#/preparacao"><strong>Portão B</strong></a></li>
        <li><a class="item-lista" href="#/preparacao"><strong>Portão C</strong></a></li>
      </ul>
    </section>
  `;
}
