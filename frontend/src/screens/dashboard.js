// Tela de dashboard.
// Os números virão da API (GET /eventos/:eventoId/resumo) na etapa 10.

export function telaDashboard(app) {
  app.innerHTML = `
    <header class="cabecalho">
      <a href="#/scanner">← Voltar</a>
      <h1>Dashboard</h1>
    </header>

    <section class="conteudo">
      <div class="grade-numeros">
        <div class="numero"><strong>—</strong><span>Total de ingressos</span></div>
        <div class="numero"><strong>—</strong><span>Utilizados</span></div>
        <div class="numero"><strong>—</strong><span>Restantes</span></div>
        <div class="numero"><strong>—</strong><span>Pendentes de sincronização</span></div>
      </div>
    </section>
  `;
}
