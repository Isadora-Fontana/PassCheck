import { buscarEventos, buscarPortoes } from '../api.js';
import { obterIdentidade, podeOperar, sessao } from '../sessao.js';
import { obterEvento, salvarEvento, salvarPortao } from '../selecao.js';
import { irPara } from '../router.js';
import { escaparHtml } from '../html.js';

export async function telaPortoes(app, { signal } = {}) {
  if (!obterIdentidade()) { irPara('/login'); return; }
  await sessao.atualizarIdentidade({ signal });
  const escolhido = obterEvento();
  if (!escolhido) { irPara('/eventos'); return; }
  app.innerHTML = `<header class="cabecalho"><a href="#/eventos">← Voltar</a><h1>Selecionar portão</h1></header>
    <section class="conteudo"><p id="evento"></p><p id="mensagem" role="status">Carregando portões...</p><ul class="lista" id="portoes"></ul></section>`;
  const evento = (await buscarEventos({ signal })).find((item) => item.id === escolhido.id);
  if (!evento) throw new Error('Este evento não está disponível para sua conta.');
  salvarEvento(evento);
  const portoes = (await buscarPortoes(evento.id, { signal })).filter((portao) => podeOperar(evento.id, portao.id));
  if (signal?.aborted) return;
  app.querySelector('#evento').textContent = evento.nome;
  app.querySelector('#mensagem').textContent = portoes.length ? 'Selecione o portão autorizado para este dispositivo.' : 'Nenhum portão autorizado para operação. Procure o responsável pelo sistema.';
  app.querySelector('#portoes').innerHTML = portoes.map((portao) => `<li><button type="button" class="item-lista botao-evento" data-id="${portao.id}">${escaparHtml(portao.nome)}</button></li>`).join('');
  app.querySelectorAll('[data-id]').forEach((botao) => botao.addEventListener('click', () => {
    salvarPortao(portoes.find((portao) => portao.id === Number(botao.dataset.id)));
    irPara('/preparacao');
  }));
}
