// Tela de preparação do dispositivo.
// Nas próximas etapas, o botão vai baixar os ingressos do portão e salvar no IndexedDB.

export function telaPreparacao(app) {
  app.innerHTML = `
    <header class="cabecalho">
      <a href="#/portoes">← Voltar</a>
      <h1>Preparar dispositivo</h1>
    </header>

    <section class="conteudo">
      <div class="cartao">
        <p><strong>Evento:</strong> —</p>
        <p><strong>Portão:</strong> —</p>
        <p><strong>Ingressos baixados:</strong> —</p>
      </div>

      <p class="subtitulo">
        Baixe os ingressos deste portão para que o dispositivo possa validar mesmo sem internet.
      </p>

      <a class="botao" href="#/scanner">Preparar e iniciar operação</a>
    </section>
  `;
}
