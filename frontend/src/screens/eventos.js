import { buscarEventos } from '../api.js';
import { obterIdentidade, sessao } from '../sessao.js';
import { obterOperacao } from '../db.js';
import { salvarEvento } from '../selecao.js';
import { irPara } from '../router.js';
import { escaparHtml, formatarData } from '../html.js';

export async function telaEventos(app, { signal } = {}) {
  const me = obterIdentidade();
  if (!me) { irPara('/login'); return; }
  app.innerHTML = `<header class="cabecalho"><h1>Meus eventos</h1><button id="sair" class="botao botao-secundario botao-sair">Sair</button></header>
    <section class="conteudo"><p class="subtitulo">${escaparHtml(me.usuario.usuario)} · ${me.acessoGlobal ? 'Administrador' : 'Operador'}</p>
      <div id="mensagem" role="status">Carregando eventos...</div><ul id="eventos" class="lista"></ul>
      <a id="continuar" class="botao botao-secundario" href="#/scanner" hidden>Continuar operação preparada</a>
    </section>`;
  app.querySelector('#sair').addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    try { await sessao.sair(); } catch { /* Saída local concluída; token remoto expira pelo TTL. */ }
    irPara('/login');
  });
  const operacao = await obterOperacao().catch(() => null);
  if (signal?.aborted) return;
  app.querySelector('#continuar').hidden = operacao?.usuarioId !== me.usuario.id;
  try {
    const eventos = await buscarEventos({ signal });
    if (signal?.aborted) return;
    app.querySelector('#mensagem').textContent = eventos.length ? 'Selecione um evento.' : 'Nenhum evento autorizado. Solicite acesso ao responsável pelo sistema.';
    app.querySelector('#eventos').innerHTML = eventos.map((evento) => `<li><button class="item-lista botao-evento" data-id="${evento.id}" type="button">
      <strong>${escaparHtml(evento.nome)}</strong><span>${escaparHtml(formatarData(evento.data))} · ${escaparHtml(evento.local)}</span></button></li>`).join('');
    app.querySelectorAll('[data-id]').forEach((botao) => botao.addEventListener('click', () => {
      salvarEvento(eventos.find((evento) => evento.id === Number(botao.dataset.id)));
      irPara('/portoes');
    }));
  } catch (error) {
    if (!signal?.aborted) app.querySelector('#mensagem').textContent = error.message;
  }
}
