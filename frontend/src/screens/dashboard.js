import { obterOperacao, contarValidacoesPendentes } from '../db.js';
import { obterIdentidade } from '../sessao.js';
import { irPara } from '../router.js';
export async function telaDashboard(app, { signal } = {}) {
  const op = await obterOperacao();
  const me = obterIdentidade();
  if (!op?.usuarioId || (me && me.usuario.id !== op.usuarioId)) { irPara('/login'); return; }
  const pendentes = await contarValidacoesPendentes();
  if (signal?.aborted) return;
  app.innerHTML = '<header class="cabecalho"><a href="#/scanner">← Voltar</a><h1>Operação local</h1></header><section class="conteudo"><p id="pendentes"></p><p class="aviso">O envio das validações e os indicadores centrais serão integrados na próxima etapa. As leituras permanecem salvas neste dispositivo.</p></section>';
  app.querySelector('#pendentes').textContent = 'Validações pendentes neste dispositivo: ' + pendentes;
}
