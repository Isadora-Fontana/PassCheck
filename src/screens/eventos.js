// Tela de seleção do evento.
// Por enquanto a lista é um exemplo fixo; os eventos virão da API (GET /eventos) nas próximas etapas.

export function telaEventos(app) {
  app.innerHTML = `
    <header class="cabecalho">
      <h1>Eventos</h1>
      <a href="#/login">Sair</a>
    </header>

    <section class="conteudo">
      <p class="subtitulo">Selecione o evento em que você vai trabalhar.</p>

      <ul class="lista">
        <li>
          <a class="item-lista" href="#/portoes">
            <strong>Festival UNIVAG</strong>
            <span>Exemplo de evento</span>
          </a>
        </li>
      </ul>
    </section>
  `;
}
