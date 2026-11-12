// Detalhes de um evento para o GESTOR: código do evento, solicitações dos operadores
// (aprovar com portão, rejeitar, alterar portão), portões e ingressos com QR Code.
// Evento, portões, ingressos e a LIBERAÇÃO do operador (aprovar/alterar portão) usam a
// API real. O código do evento e a lista de solicitações ainda ficam no navegador
// (demonstração) até o back-end ter esses endpoints: veja acessoEvento.js.
import QRCode from 'qrcode';
import { irPara } from '../router.js';
import { buscarEventos, buscarPortoes, criarPortao, concederOperador } from '../api.js';
import { obterIdentidade } from '../sessao.js';
import { podeGerenciar, obterEventoGestaoId, criarIngressos, listarIngressosDoEvento } from '../gestao.js';
import { MAXIMO_POR_IMPORTACAO } from '../geracaoIngressos.js';
import { escaparHtml, formatarData } from '../html.js';
import { obterCodigoEvento, listarSolicitacoesDoEvento, aprovarSolicitacao, rejeitarSolicitacao,
  alterarPortaoAprovado, STATUS } from '../acessoEvento.js';

export async function telaGestaoEvento(app, { signal, mensagem = '' } = {}) {
  if (!obterIdentidade()) { irPara('/login'); return; }
  if (!podeGerenciar()) { irPara('/eventos'); return; }

  const eventoId = obterEventoGestaoId();
  const evento = (await buscarEventos({ signal })).find((item) => item.id === eventoId);
  if (signal?.aborted) return;
  if (!evento) { irPara('/gestor'); return; }

  const portoes = await buscarPortoes(evento.id, { signal });
  const ingressos = await listarIngressosDoEvento(evento.id, portoes, { signal });
  if (signal?.aborted) return;

  const codigoEvento = obterCodigoEvento(evento);
  const pendentes = listarSolicitacoesDoEvento(evento.id, STATUS.PENDENTE);
  const aprovadas = listarSolicitacoesDoEvento(evento.id, STATUS.APROVADA);

  app.innerHTML = `<header class="cabecalho nao-imprimir"><a href="#/gestor">← Voltar</a><h1>Evento</h1></header>
    <section class="conteudo">
      <div class="cartao nao-imprimir">
        <p><strong>${escaparHtml(evento.nome)}</strong></p>
        <p>${escaparHtml(formatarData(evento.data))} · ${escaparHtml(evento.local)}</p>
        <p class="subtitulo">Horário: ainda não registrado no servidor (aguardando back-end).</p>
      </div>
      <div class="codigo-evento nao-imprimir">
        <span>Código do evento</span>
        <strong>${codigoEvento}</strong>
        <small>Compartilhe com os operadores para que solicitem acesso.</small>
      </div>
      <div class="confirmacao nao-imprimir" id="mensagem" ${mensagem ? '' : 'hidden'}></div>
      <div class="aviso nao-imprimir" id="erro" role="alert" hidden></div>

      <h2 class="nao-imprimir">Solicitações pendentes</h2>
      <p class="aviso-campo nao-imprimir">Ao aprovar, o operador é liberado no servidor para operar o portão escolhido.
        O código e a lista de solicitações ainda ficam só neste navegador (aguardando back-end).</p>
      <div class="nao-imprimir">${pendentes.length ? pendentes.map((s) => desenharSolicitacao(s, portoes)).join('')
        : '<p class="subtitulo">Nenhuma solicitação pendente.</p>'}</div>

      <h2 class="nao-imprimir">Operadores aprovados</h2>
      <div class="nao-imprimir">${aprovadas.length ? aprovadas.map((s) => desenharAprovado(s, portoes)).join('')
        : '<p class="subtitulo">Nenhum operador aprovado.</p>'}</div>

      <h2 class="nao-imprimir">Portões</h2>
      <div class="nao-imprimir">${portoes.length ? portoes.map((portao) => desenharPortao(portao, ingressos)).join('')
        : '<p class="subtitulo">Nenhum portão cadastrado.</p>'}</div>

      <form class="cartao formulario nao-imprimir" id="form-portao" novalidate>
        <strong>Adicionar portão</strong>
        <div class="linha-portao">
          <input type="text" id="novo-portao" maxlength="200" placeholder="Nome do portão" aria-label="Nome do novo portão" />
          <input type="number" id="novo-portao-quantidade" class="campo-quantidade" min="0" max="${MAXIMO_POR_IMPORTACAO}"
                 value="0" aria-label="Ingressos do novo portão" />
        </div>
        <button class="botao botao-secundario" type="submit">Adicionar portão</button>
      </form>

      <h2 class="nao-imprimir">Ingressos (${ingressos.length})</h2>
      <div class="acoes nao-imprimir">
        <div class="campo"><label for="filtro-portao">Mostrar ingressos de</label>
          <select id="filtro-portao"><option value="">Todos os portões</option>
            ${portoes.map((portao) => `<option value="${portao.id}">${escaparHtml(portao.nome)}</option>`).join('')}
          </select></div>
        <button class="botao" type="button" id="imprimir" ${ingressos.length ? '' : 'disabled'}>Imprimir ingressos</button>
      </div>
      <div class="grade-ingressos" id="ingressos"></div>
    </section>`;

  const campoMensagem = app.querySelector('#mensagem');
  const campoErro = app.querySelector('#erro');
  campoMensagem.textContent = mensagem;
  const mostrarErro = (texto) => { campoErro.textContent = texto; campoErro.hidden = false; };
  const recarregar = (texto) => telaGestaoEvento(app, { signal, mensagem: texto });

  // Solicitações: aprovar (ou alterar o portão) exige escolher um portão do evento.
  // Primeiro o servidor libera o operador nesse portão; só então a solicitação é atualizada.
  async function acaoComPortao(botao, solicitacaoId, acao, textoSucesso) {
    const cartao = botao.closest('.solicitacao');
    const portao = portoes.find((item) => item.id === Number(cartao.querySelector('select').value));
    const solicitacao = [...pendentes, ...aprovadas].find((item) => item.id === solicitacaoId);
    if (!portao) { mostrarErro('Escolha um portão.'); return; }
    botao.disabled = true;
    try {
      await concederOperador(evento.id, solicitacao.operadorId, portao.id, { signal });
      acao(solicitacaoId, portao);
      recarregar(textoSucesso);
    } catch (falha) {
      botao.disabled = false;
      mostrarErro(falha.message + ' Nada foi alterado.');
    }
  }
  app.querySelectorAll('[data-aprovar]').forEach((botao) => botao.addEventListener('click', () =>
    acaoComPortao(botao, Number(botao.dataset.aprovar), aprovarSolicitacao, 'Solicitação aprovada. O operador já pode operar o portão escolhido.')));
  app.querySelectorAll('[data-rejeitar]').forEach((botao) => botao.addEventListener('click', () => {
    try { rejeitarSolicitacao(Number(botao.dataset.rejeitar)); recarregar('Solicitação rejeitada.'); }
    catch (falha) { mostrarErro(falha.message); }
  }));
  app.querySelectorAll('[data-alterar]').forEach((botao) => botao.addEventListener('click', () =>
    acaoComPortao(botao, Number(botao.dataset.alterar), alterarPortaoAprovado, 'Portão do operador alterado.')));

  // Ingressos com QR Code, de acordo com o filtro.
  const grade = app.querySelector('#ingressos');
  async function desenharIngressos() {
    const portaoId = Number(app.querySelector('#filtro-portao').value);
    const visiveis = portaoId ? ingressos.filter((ingresso) => ingresso.portaoId === portaoId) : ingressos;
    if (visiveis.length === 0) { grade.innerHTML = '<p class="subtitulo">Nenhum ingresso para mostrar.</p>'; return; }
    const cartoes = await Promise.all(visiveis.map((ingresso) => desenharIngresso(ingresso, evento)));
    if (!signal?.aborted) grade.innerHTML = cartoes.join('');
  }
  app.querySelector('#filtro-portao').addEventListener('change', desenharIngressos);
  app.querySelector('#imprimir').addEventListener('click', () => window.print());
  await desenharIngressos();

  // Adicionar ingressos a um portão existente.
  app.querySelectorAll('[data-adicionar]').forEach((botao) => botao.addEventListener('click', async () => {
    const portaoId = Number(botao.dataset.adicionar);
    const quantidade = Number(app.querySelector('#quantidade-' + portaoId).value);
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > MAXIMO_POR_IMPORTACAO) {
      mostrarErro(`Informe uma quantidade de 1 a ${MAXIMO_POR_IMPORTACAO}.`);
      return;
    }
    botao.disabled = true;
    try {
      const criados = await criarIngressos(evento.id, [{ portaoId, quantidade }], { signal });
      recarregar(criados + ' ingresso(s) criado(s).');
    } catch (erro) {
      botao.disabled = false;
      mostrarErro(erro.message + ' Confira a contagem de ingressos antes de tentar de novo.');
    }
  }));

  // Adicionar um portão (e, se informado, seus ingressos).
  app.querySelector('#form-portao').addEventListener('submit', async (envio) => {
    envio.preventDefault();
    const nome = app.querySelector('#novo-portao').value.trim();
    const quantidade = Number(app.querySelector('#novo-portao-quantidade').value);
    if (!nome) { mostrarErro('Informe o nome do portão.'); return; }
    if (portoes.some((portao) => portao.nome.toLowerCase() === nome.toLowerCase())) { mostrarErro('Já existe um portão com esse nome.'); return; }
    if (!Number.isInteger(quantidade) || quantidade < 0 || quantidade > MAXIMO_POR_IMPORTACAO) {
      mostrarErro(`Informe uma quantidade de 0 a ${MAXIMO_POR_IMPORTACAO}.`);
      return;
    }
    const botao = envio.currentTarget.querySelector('button[type="submit"]');
    botao.disabled = true;
    try {
      const portao = await criarPortao(evento.id, nome, { signal });
      if (quantidade > 0) await criarIngressos(evento.id, [{ portaoId: portao.id, quantidade }], { signal });
      recarregar('Portão "' + nome + '" adicionado' + (quantidade ? ' com ' + quantidade + ' ingresso(s).' : '.'));
    } catch (erro) {
      botao.disabled = false;
      mostrarErro(erro.message + ' Confira a lista de portões antes de tentar de novo.');
    }
  });
}

function opcoesPortao(portoes, selecionadoId) {
  return portoes.map((portao) => `<option value="${portao.id}" ${portao.id === selecionadoId ? 'selected' : ''}>${escaparHtml(portao.nome)}</option>`).join('');
}

function desenharSolicitacao(solicitacao, portoes) {
  return `<div class="cartao solicitacao">
      <p><strong>${escaparHtml(solicitacao.operadorNome)}</strong></p>
      <p class="subtitulo">Solicitado em ${new Date(solicitacao.criadaEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
      <div class="campo"><label for="portao-sol-${solicitacao.id}">Portão para este operador</label>
        <select id="portao-sol-${solicitacao.id}"><option value="">Escolha um portão</option>${opcoesPortao(portoes, null)}</select></div>
      <div class="grade-botoes">
        <button class="botao" type="button" data-aprovar="${solicitacao.id}">Aprovar</button>
        <button class="botao botao-secundario" type="button" data-rejeitar="${solicitacao.id}">Rejeitar</button>
      </div>
    </div>`;
}

function desenharAprovado(solicitacao, portoes) {
  return `<div class="cartao solicitacao">
      <p><strong>${escaparHtml(solicitacao.operadorNome)}</strong></p>
      <div class="campo"><label for="portao-apr-${solicitacao.id}">Portão atribuído</label>
        <select id="portao-apr-${solicitacao.id}">${opcoesPortao(portoes, solicitacao.portaoId)}</select></div>
      <button class="botao botao-secundario" type="button" data-alterar="${solicitacao.id}">Alterar portão</button>
    </div>`;
}

function desenharPortao(portao, ingressos) {
  const doPortao = ingressos.filter((ingresso) => ingresso.portaoId === portao.id);
  const utilizados = doPortao.filter((ingresso) => ingresso.utilizado).length;
  return `<div class="cartao solicitacao">
      <p><strong>${escaparHtml(portao.nome)}</strong></p>
      <p class="subtitulo">${doPortao.length} ingresso(s) · ${utilizados} utilizado(s)</p>
      <div class="linha-portao">
        <input type="number" id="quantidade-${portao.id}" class="campo-quantidade" min="1" max="${MAXIMO_POR_IMPORTACAO}"
               value="10" aria-label="Quantidade de ingressos a adicionar em ${escaparHtml(portao.nome)}" />
        <button class="botao botao-secundario" type="button" data-adicionar="${portao.id}">Adicionar ingressos</button>
      </div>
    </div>`;
}

/**
 * Cartão do ingresso: dados do evento + portão + QR Code do código.
 * O QR Code contém somente o código, que é o que o scanner procura no aparelho.
 */
async function desenharIngresso(ingresso, evento) {
  const qr = await QRCode.toString(ingresso.codigo, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  return `<article class="ingresso-cartao">
      <div class="ingresso-qr">${qr}</div>
      <strong class="ingresso-codigo">${escaparHtml(ingresso.codigo)}</strong>
      <p><strong>${escaparHtml(evento.nome)}</strong></p>
      <p>${escaparHtml(formatarData(evento.data))} · Horário a definir</p>
      <p>${escaparHtml(evento.local)}</p>
      <p>Acesso: <strong>${escaparHtml(ingresso.portaoNome)}</strong></p>
      ${ingresso.utilizado ? '<span class="selo-status selo-rejeitada">UTILIZADO</span>' : ''}
    </article>`;
}
