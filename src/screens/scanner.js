// Tela principal de operação (scanner).
// A câmera e a leitura do QR Code entram na etapa 6.

import { mostrarResultado } from '../components/resultado.js';

export function telaScanner(app) {
  app.innerHTML = `
    <header class="cabecalho">
      <h1>Operação</h1>
      <a href="#/dashboard">Dashboard</a>
    </header>

    <div class="barra-status">
      <span class="selo-conexao">ONLINE</span>
      <span>Pendentes: 0</span>
      <span>Última sincronização: —</span>
    </div>

    <section class="conteudo">
      <div class="area-camera">A câmera aparecerá aqui</div>

      <!-- TEMPORÁRIO (etapa 1): botões para visualizar a sobreposição de resultado.
           Serão removidos quando a leitura real do QR Code for implementada. -->
      <div class="simulacao">
        <p>Simular resultado (temporário)</p>
        <div class="grade-botoes">
          <button class="botao botao-secundario" data-status="VALIDO">Válido</button>
          <button class="botao botao-secundario" data-status="JA_UTILIZADO">Já utilizado</button>
          <button class="botao botao-secundario" data-status="INVALIDO">Inválido</button>
          <button class="botao botao-secundario" data-status="PORTAO_INCORRETO">Portão incorreto</button>
        </div>
      </div>

      <a class="botao botao-secundario" href="#/eventos">Encerrar operação</a>
    </section>
  `;

  const botoesSimulacao = app.querySelectorAll('[data-status]');
  botoesSimulacao.forEach((botao) => {
    botao.addEventListener('click', () => mostrarResultado(botao.dataset.status));
  });
}
