// Tela de preparação do dispositivo.
// Baixa os ingressos de todos os portões do evento escolhido (por enquanto, dados
// simulados) e salva no IndexedDB, para que o dispositivo possa validar sem internet.
// Os ingressos dos outros portões permitem ao scanner identificar PORTÃO INCORRETO.
// O scanner só fica disponível depois que a preparação termina com sucesso.

import { irPara } from '../router.js';
import { buscarPortoes, buscarIngressos } from '../api.js';
import { obterEvento, obterPortao, salvarEvento, salvarPortao } from '../selecao.js';
import {
  obterOperacao,
  contarIngressos,
  contarIngressosDoPortao,
  contarValidacoesPendentes,
  salvarPreparacao,
} from '../db.js';

export async function telaPreparacao(app) {
  const evento = obterEvento();
  const portao = obterPortao();

  // Sem evento e portão escolhidos não há o que preparar.
  if (!evento || !portao) {
    irPara('/eventos');
    return;
  }

  app.innerHTML = `
    <header class="cabecalho">
      <a href="#/portoes">← Voltar</a>
      <h1>Preparar dispositivo</h1>
    </header>

    <section class="conteudo">
      <div class="cartao">
        <p><strong>Evento:</strong> ${evento.nome}</p>
        <p><strong>Portão:</strong> ${portao.nome}</p>
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
    } else if (operacaoAtual && pendentes > 0) {
      mostrarBloqueio(tela, operacaoAtual, pendentes);
    } else {
      mostrarInicio(tela, operacaoAtual);
    }
  } catch (erro) {
    mostrarErro(tela, erro);
  }
}

/**
 * Estado inicial: dispositivo ainda não preparado para este portão.
 * Se estava preparado para outro portão (sem pendências), avisa que será substituído.
 */
function mostrarInicio(tela, operacaoAtual) {
  const avisoTroca = operacaoAtual
    ? `<div class="aviso">
         Este dispositivo está preparado para
         <strong>${operacaoAtual.eventoNome} · ${operacaoAtual.portaoNome}</strong>.
         Ao continuar, os ingressos armazenados serão substituídos.
       </div>`
    : '';

  tela.acoes.innerHTML = `
    ${avisoTroca}
    <p class="subtitulo">
      Baixe os ingressos deste portão para que o dispositivo possa validar mesmo sem internet.
    </p>
    <button class="botao" type="button" id="botao-preparar">Preparar dispositivo</button>
  `;

  tela.acoes.querySelector('#botao-preparar').addEventListener('click', () => preparar(tela));
}

/**
 * Impede a troca de evento/portão enquanto houver validações pendentes
 * do portão atual, para que nenhuma validação se perca.
 */
function mostrarBloqueio(tela, operacaoAtual, pendentes) {
  tela.acoes.innerHTML = `
    <div class="aviso">
      Este dispositivo tem <strong>${pendentes} validação(ões) pendente(s)</strong> de
      sincronização em <strong>${operacaoAtual.eventoNome} · ${operacaoAtual.portaoNome}</strong>.
      Sincronize antes de trocar de evento ou portão.
    </div>
    <button class="botao" type="button" id="botao-voltar-operacao">Voltar para a operação atual</button>
  `;

  tela.acoes.querySelector('#botao-voltar-operacao').addEventListener('click', () => {
    salvarEvento({ id: operacaoAtual.eventoId, nome: operacaoAtual.eventoNome });
    salvarPortao({ id: operacaoAtual.portaoId, nome: operacaoAtual.portaoNome });
    irPara('/scanner');
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
    await salvarPreparacao(tela.evento, tela.portao, ingressos);

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
    <div class="aviso">Não foi possível preparar o dispositivo. ${erro.message}</div>
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
