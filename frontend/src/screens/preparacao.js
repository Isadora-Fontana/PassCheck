// Tela de preparação do dispositivo.
// Baixa os ingressos de todos os portões do evento atribuído ao operador (por enquanto,
// dados simulados) e salva no IndexedDB, para que o dispositivo possa validar sem internet.
// Os ingressos dos outros portões permitem ao scanner identificar PORTÃO INCORRETO;
// somente os do portão atribuído podem ser validados.
// O scanner só fica disponível depois que a preparação termina com sucesso.

import { irPara } from '../router.js';
import { buscarPortoes, buscarIngressos } from '../api.js';
import { obterAtribuicao } from '../demo/armazenamentoDemo.js';
import { exigirPerfil, OPERADOR_DEMO, PERFIS } from '../demo/perfilDemo.js';
import { obterEvento } from '../selecao.js';
import { escaparHtml } from '../html.js';
import {
  obterOperacao,
  contarIngressos,
  contarIngressosDoPortao,
  contarValidacoesPendentes,
  salvarPreparacao,
} from '../db.js';

export async function telaPreparacao(app) {
  if (!exigirPerfil(PERFIS.OPERADOR)) return;

  // Evento escolhido em "Meus eventos". O operador só prepara eventos aprovados,
  // sempre com o portão atribuído pelo gestor daquele evento.
  const eventoEscolhido = obterEvento();
  const atribuicao = eventoEscolhido ? obterAtribuicao(OPERADOR_DEMO.id, eventoEscolhido.id) : null;
  if (!atribuicao) {
    irPara('/operador');
    return;
  }
  const { evento, portao } = atribuicao;

  app.innerHTML = `
    <header class="cabecalho">
      <a href="#/operador">← Voltar</a>
      <h1>Preparar dispositivo</h1>
    </header>

    <section class="conteudo">
      <div class="cartao">
        <p><strong>Evento:</strong> ${escaparHtml(evento.nome)}</p>
        <p><strong>Portão:</strong> ${escaparHtml(portao.nome)}</p>
        <p><strong>Ingressos deste portão:</strong> <span id="quantidade-portao">—</span></p>
        <p><strong>Ingressos do evento:</strong> <span id="quantidade-evento">—</span></p>
      </div>

      <ul class="etapas" id="etapas"></ul>
      <div class="acoes" id="acoes">
        <p class="subtitulo">Verificando dados do dispositivo...</p>
      </div>
    </section>
  `;

  const tela = {
    evento,
    portao,
    // Vira true somente depois que o operador confirma a troca de operação.
    descartarOperacaoAnterior: false,
    quantidadePortao: app.querySelector('#quantidade-portao'),
    quantidadeEvento: app.querySelector('#quantidade-evento'),
    etapas: app.querySelector('#etapas'),
    acoes: app.querySelector('#acoes'),
  };

  try {
    const operacaoAtual = await obterOperacao();
    const pendentes = await contarValidacoesPendentes();

    const mesmoPortao =
      operacaoAtual !== null &&
      operacaoAtual.eventoId === evento.id &&
      operacaoAtual.portaoId === portao.id;

    if (mesmoPortao) {
      await mostrarQuantidades(tela);
      mostrarPreparado(tela, 'Este dispositivo já está preparado para este portão.');
    } else if (operacaoAtual) {
      mostrarTroca(tela, operacaoAtual, pendentes);
    } else {
      mostrarInicio(tela);
    }
  } catch (erro) {
    mostrarErro(tela, erro);
  }
}

/**
 * Estado inicial: dispositivo ainda não preparado.
 */
function mostrarInicio(tela) {
  tela.acoes.innerHTML = `
    <p class="subtitulo">
      Baixe os ingressos deste portão para que o dispositivo possa validar mesmo sem internet.
    </p>
    <button class="botao" type="button" id="botao-preparar">Preparar dispositivo</button>
  `;

  tela.acoes.querySelector('#botao-preparar').addEventListener('click', () => preparar(tela));
}

/**
 * O dispositivo está preparado para outro evento/portão.
 * A troca é permitida (decisão do MVP), mas só depois de aviso e confirmação,
 * porque descarta os dados locais da operação anterior, inclusive validações pendentes.
 */
function mostrarTroca(tela, operacaoAtual, pendentes) {
  const avisoPendentes =
    pendentes > 0
      ? `<p class="alerta-pendentes">
           Atenção: <strong>${pendentes} validação(ões) pendente(s)</strong> ainda não
           foram sincronizadas e serão <strong>perdidas</strong>.
         </p>`
      : '<p>Não há validações pendentes.</p>';

  tela.acoes.innerHTML = `
    <div class="aviso">
      <p>
        Este dispositivo está preparado para
        <strong>${escaparHtml(operacaoAtual.eventoNome)} · ${escaparHtml(operacaoAtual.portaoNome)}</strong>.
        Ao trocar, os dados locais dessa operação serão descartados.
      </p>
      ${avisoPendentes}
    </div>
    <label class="confirmacao-troca">
      <input type="checkbox" id="confirmar-troca" />
      Confirmo a troca e o descarte dos dados locais da operação anterior.
    </label>
    <button class="botao" type="button" id="botao-preparar" disabled>Descartar e preparar</button>
  `;

  const caixa = tela.acoes.querySelector('#confirmar-troca');
  const botao = tela.acoes.querySelector('#botao-preparar');

  caixa.addEventListener('change', () => {
    botao.disabled = !caixa.checked;
  });
  botao.addEventListener('click', () => {
    if (!caixa.checked) return;
    tela.descartarOperacaoAnterior = true;
    preparar(tela);
  });
}

/**
 * Baixa os ingressos e grava no IndexedDB, mostrando o andamento.
 */
async function preparar(tela) {
  tela.etapas.innerHTML = '';
  tela.acoes.innerHTML = '';

  try {
    registrarEtapa(tela, 'Buscando portões do evento...');
    const portoesDoEvento = await buscarPortoes(tela.evento.id);

    // Baixa os ingressos de cada portão do evento, um de cada vez.
    const ingressos = [];
    for (const portaoDoEvento of portoesDoEvento) {
      registrarEtapa(tela, `Baixando ingressos do ${portaoDoEvento.nome}...`);
      const recebidos = await buscarIngressos(tela.evento.id, portaoDoEvento.id);
      ingressos.push(...recebidos);
    }

    registrarEtapa(tela, `${ingressos.length} ingressos recebidos. Salvando no dispositivo...`);
    await salvarPreparacao(tela.evento, tela.portao, ingressos, {
      descartarOperacaoAnterior: tela.descartarOperacaoAnterior,
    });

    // Depois de concluída, uma nova preparação é do mesmo portão: não há mais o que descartar.
    tela.descartarOperacaoAnterior = false;
    await mostrarQuantidades(tela);
    mostrarPreparado(tela, 'Dispositivo preparado para trabalhar offline.');
  } catch (erro) {
    mostrarErro(tela, erro);
  }
}

/**
 * Dispositivo pronto: libera o acesso ao scanner.
 */
function mostrarPreparado(tela, mensagem) {
  tela.acoes.innerHTML = `
    <div class="confirmacao">✓ ${mensagem}</div>
    <a class="botao" href="#/scanner">Iniciar operação</a>
    <button class="botao botao-secundario" type="button" id="botao-preparar">Preparar novamente</button>
  `;

  tela.acoes.querySelector('#botao-preparar').addEventListener('click', () => preparar(tela));
}

function mostrarErro(tela, erro) {
  tela.acoes.innerHTML = `
    <div class="aviso">Não foi possível preparar o dispositivo. ${escaparHtml(erro.message)}</div>
    <button class="botao" type="button" id="botao-preparar">Tentar novamente</button>
  `;

  tela.acoes.querySelector('#botao-preparar').addEventListener('click', () => preparar(tela));
}

async function mostrarQuantidades(tela) {
  tela.quantidadePortao.textContent = await contarIngressosDoPortao(tela.portao.id);
  tela.quantidadeEvento.textContent = await contarIngressos();
}

function registrarEtapa(tela, texto) {
  const item = document.createElement('li');
  item.textContent = texto;
  tela.etapas.appendChild(item);
}
