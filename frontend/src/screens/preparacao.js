// Preparação online, seguida de validação local independente da API.
import { irPara } from '../router.js';
import { buscarEventos, buscarPortoes, buscarIngressos, registrarInstalacao } from '../api.js';
import { obterIdentidade, podeOperar, sessao } from '../sessao.js';
import { obterEvento, obterPortao } from '../selecao.js';
import { escaparHtml } from '../html.js';
import { obterOperacao, obterIdDispositivo, contarValidacoesPendentes,
  contarIngressosDoPortao, salvarPreparacao } from '../db.js';

export async function telaPreparacao(app, { signal } = {}) {
  if (!obterIdentidade()) { irPara('/login'); return; }
  const me = await sessao.atualizarIdentidade({ signal });
  const escolhido = obterEvento();
  const portaoEscolhido = obterPortao();
  if (!escolhido || !portaoEscolhido || !podeOperar(escolhido.id, portaoEscolhido.id)) {
    irPara('/eventos'); return;
  }
  app.innerHTML = `<header class="cabecalho"><a href="#/eventos">← Voltar</a><h1>Preparar dispositivo</h1></header>
    <section class="conteudo"><div id="contexto" class="cartao"></div>
      <p id="mensagem" role="status">Verificando preparação...</p>
      <ul class="etapas" id="etapas"></ul>
      <div class="acoes"><button class="botao" id="preparar" disabled>Preparar dispositivo</button>
        <a class="botao botao-secundario" id="continuar" href="#/scanner" hidden>Iniciar operação</a></div>
    </section>`;
  const mensagem = app.querySelector('#mensagem');
  const botao = app.querySelector('#preparar');
  const continuar = app.querySelector('#continuar');
  const evento = (await buscarEventos({ signal })).find((item) => item.id === escolhido.id);
  if (!evento) throw new Error('Evento não autorizado.');
  const portoes = await buscarPortoes(evento.id, { signal });
  const portao = portoes.find((item) => item.id === portaoEscolhido.id);
  if (!portao || !podeOperar(evento.id, portao.id)) throw new Error('Portão não autorizado.');
  const operacao = await obterOperacao();
  const pendentes = await contarValidacoesPendentes();
  if (signal?.aborted) return;
  const mesma = operacao?.usuarioId === me.usuario.id && operacao.eventoId === evento.id && operacao.portaoId === portao.id;
  app.querySelector('#contexto').innerHTML = `<p><strong>Evento:</strong> ${escaparHtml(evento.nome)}</p><p><strong>Portão:</strong> ${escaparHtml(portao.nome)}</p>`;
  continuar.hidden = !mesma;
  if (pendentes && !mesma) {
    mensagem.textContent = 'Há validações pendentes na operação anterior. A troca está bloqueada e os dados foram preservados.';
    return;
  }
  mensagem.textContent = mesma ? 'Dispositivo preparado. Você pode continuar ou atualizar o download.'
    : 'Baixe os ingressos para operar sem internet. A preparação anterior será substituída após o download completo.';
  botao.disabled = false;
  botao.addEventListener('click', async () => {
    botao.disabled = true;
    continuar.hidden = true;
    const etapas = app.querySelector('#etapas');
    etapas.replaceChildren();
    const etapa = (texto) => { const li = document.createElement('li'); li.textContent = texto; etapas.appendChild(li); };
    try {
      await sessao.atualizarIdentidade({ signal });
      if (!podeOperar(evento.id, portao.id)) throw new Error('Sua permissão para este portão mudou.');
      etapa('Registrando instalação desta conta...');
      const dispositivo = await obterIdDispositivo(me.usuario.id);
      await registrarInstalacao(dispositivo, { signal });
      const ingressos = [];
      for (const item of portoes) {
        etapa('Baixando ingressos de ' + item.nome + '...');
        ingressos.push(...await buscarIngressos(evento.id, item.id, { signal }));
      }
      if (signal?.aborted) return;
      await sessao.atualizarIdentidade({ signal });
      await salvarPreparacao(evento, portao, ingressos, { usuarioId: me.usuario.id, dispositivo,
        confirmarIdentidade: () => !signal?.aborted && obterIdentidade()?.usuario.id === me.usuario.id && podeOperar(evento.id, portao.id) });
      if (signal?.aborted) return;
      mensagem.textContent = 'Dispositivo preparado: ' + await contarIngressosDoPortao(portao.id) + ' ingressos deste portão; ' + ingressos.length + ' no evento.';
      continuar.hidden = false;
      botao.textContent = 'Atualizar download';
    } catch (error) {
      if (!signal?.aborted) { mensagem.textContent = error.message + ' Os dados anteriores foram preservados.'; continuar.hidden = !mesma; }
    } finally { botao.disabled = false; }
  });
}
