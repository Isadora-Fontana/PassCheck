// Situação das validações deste dispositivo em relação ao servidor.
import { obterOperacao, resumirFila } from '../db.js';
import { obterIdentidade } from '../sessao.js';
import { sincronizarAgora, aoMudarSincronizacao } from '../sincronizacao.js';
import { irPara } from '../router.js';

export async function telaDashboard(app, { signal } = {}) {
  const op = await obterOperacao();
  const me = obterIdentidade();
  if (!op?.usuarioId || (me && me.usuario.id !== op.usuarioId)) { irPara('/login'); return; }
  if (signal?.aborted) return;

  app.innerHTML = `<header class="cabecalho"><a href="#/scanner">← Voltar</a><h1>Operação local</h1></header>
    <section class="conteudo">
      <div class="grade-numeros">
        <div class="numero"><strong id="aguardando">—</strong><span>Aguardando envio</span></div>
        <div class="numero"><strong id="confirmadas">—</strong><span>Confirmadas pelo servidor</span></div>
        <div class="numero"><strong id="conflitos">—</strong><span>Conflitos (já usados em outro aparelho)</span></div>
        <div class="numero"><strong id="rejeitadas">—</strong><span>Rejeitadas pelo servidor</span></div>
      </div>
      <p id="situacao" role="status"></p>
      <p class="subtitulo">Conflitos e rejeições ficam guardados neste aparelho para revisão do responsável e não são reenviados.</p>
      <button class="botao" type="button" id="sincronizar">Sincronizar agora</button>
    </section>`;

  async function atualizarContagens() {
    const fila = await resumirFila();
    for (const [campo, valor] of Object.entries(fila)) app.querySelector('#' + campo).textContent = valor;
  }

  const pararDeOuvir = aoMudarSincronizacao((envio) => {
    app.querySelector('#situacao').textContent = envio.mensagem;
    if (envio.situacao === 'ENVIADO' || envio.situacao === 'ERRO') atualizarContagens();
  });
  signal?.addEventListener('abort', pararDeOuvir, { once: true });

  app.querySelector('#sincronizar').addEventListener('click', () => sincronizarAgora());
  await atualizarContagens();
}
