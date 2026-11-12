// Criar evento pela API real: nome, data, horário, local e portões,
// cada portão com a quantidade de ingressos a gerar.
//
// Ordem: cria o evento → cria cada portão → gera e importa os ingressos.
// O servidor não tem uma operação única para tudo; se algo falhar no meio,
// o que já foi criado fica salvo e a tela do evento permite concluir.
import { irPara } from '../router.js';
import { criarEvento, criarPortao } from '../api.js';
import { obterIdentidade } from '../sessao.js';
import { podeGerenciar, criarIngressos, selecionarEventoGestao } from '../gestao.js';
import { MAXIMO_POR_IMPORTACAO } from '../geracaoIngressos.js';

const QUANTIDADE_PADRAO = 10;

export function telaGestaoNovoEvento(app) {
  if (!obterIdentidade()) { irPara('/login'); return; }
  if (!podeGerenciar()) { irPara('/eventos'); return; }

  app.innerHTML = `<header class="cabecalho"><a href="#/gestor">← Voltar</a><h1>Criar evento</h1></header>
    <section class="conteudo">
      <form class="formulario" id="form-evento" novalidate>
        <div class="campo"><label for="nome">Nome do evento</label>
          <input id="nome" type="text" maxlength="200" required /></div>
        <div class="campo"><label for="data">Data</label>
          <input id="data" type="date" required /></div>
        <div class="campo"><label for="horario">Horário</label>
          <input id="horario" type="time" />
          <small class="aviso-campo">O horário ainda não é salvo: o servidor aceita apenas a data. Aguardando atualização do back-end.</small></div>
        <div class="campo"><label for="local">Local</label>
          <input id="local" type="text" maxlength="300" required /></div>

        <fieldset class="campo grupo-portoes">
          <legend>Portões e quantidade de ingressos</legend>
          <div id="lista-portoes"></div>
          <button class="botao botao-secundario" type="button" id="adicionar-portao">+ Adicionar portão</button>
        </fieldset>

        <div class="aviso" id="erro-formulario" role="alert" hidden></div>
        <button class="botao" type="submit" id="salvar">Criar evento e ingressos</button>
      </form>
      <ul class="etapas" id="etapas"></ul>
      <div class="acoes" id="depois"></div>
    </section>`;

  const listaPortoes = app.querySelector('#lista-portoes');
  const erroFormulario = app.querySelector('#erro-formulario');

  /**
   * Linha de portão: nome + quantidade de ingressos. "Remover" só aparece com mais de uma linha.
   */
  function adicionarLinhaPortao() {
    const linha = document.createElement('div');
    linha.className = 'linha-portao';
    linha.innerHTML = `
      <input type="text" class="nome-portao" maxlength="200" placeholder="Ex.: Portão A" aria-label="Nome do portão" />
      <input type="number" class="campo-quantidade" min="0" max="${MAXIMO_POR_IMPORTACAO}" step="1"
             value="${QUANTIDADE_PADRAO}" aria-label="Quantidade de ingressos deste portão" />
      <button class="botao botao-secundario" type="button">Remover</button>`;
    linha.querySelector('button').addEventListener('click', () => { linha.remove(); atualizarRemover(); });
    listaPortoes.appendChild(linha);
    atualizarRemover();
  }

  function atualizarRemover() {
    const linhas = listaPortoes.querySelectorAll('.linha-portao');
    linhas.forEach((linha) => { linha.querySelector('button').hidden = linhas.length === 1; });
  }

  function mostrarErro(texto) {
    erroFormulario.textContent = texto;
    erroFormulario.hidden = false;
  }

  /**
   * Lê e confere o formulário. Devolve null (e mostra o erro) se algo estiver errado.
   */
  function lerFormulario() {
    const nome = app.querySelector('#nome').value.trim();
    const data = app.querySelector('#data').value;
    const local = app.querySelector('#local').value.trim();
    const portoes = [...listaPortoes.querySelectorAll('.linha-portao')].map((linha) => ({
      nome: linha.querySelector('.nome-portao').value.trim(),
      quantidade: Number(linha.querySelector('.campo-quantidade').value),
    })).filter((portao) => portao.nome !== '');

    let erro = '';
    const nomes = portoes.map((portao) => portao.nome.toLowerCase());
    if (!nome || !data || !local) erro = 'Preencha nome, data e local do evento.';
    else if (portoes.length === 0) erro = 'Cadastre pelo menos um portão.';
    else if (new Set(nomes).size !== nomes.length) erro = 'Há portões com o mesmo nome.';
    else if (portoes.some((portao) => !Number.isInteger(portao.quantidade) || portao.quantidade < 0
      || portao.quantidade > MAXIMO_POR_IMPORTACAO)) {
      erro = `A quantidade de ingressos de cada portão deve ser um número inteiro de 0 a ${MAXIMO_POR_IMPORTACAO}.`;
    }

    if (erro) {
      mostrarErro(erro);
      return null;
    }
    return { nome, data, local, portoes };
  }

  adicionarLinhaPortao();
  app.querySelector('#adicionar-portao').addEventListener('click', () => {
    adicionarLinhaPortao();
    listaPortoes.lastElementChild.querySelector('.nome-portao').focus();
  });

  app.querySelector('#form-evento').addEventListener('submit', async (envio) => {
    envio.preventDefault();
    erroFormulario.hidden = true;
    const dados = lerFormulario();
    if (!dados) return;

    const botao = app.querySelector('#salvar');
    const etapas = app.querySelector('#etapas');
    const depois = app.querySelector('#depois');
    const etapa = (texto) => { const item = document.createElement('li'); item.textContent = texto; etapas.appendChild(item); };
    botao.disabled = true;
    etapas.replaceChildren();
    depois.replaceChildren();

    let evento = null;
    try {
      etapa('Criando o evento...');
      evento = await criarEvento({ nome: dados.nome, data: dados.data, local: dados.local });
      selecionarEventoGestao(evento.id);

      const pedidos = [];
      for (const portao of dados.portoes) {
        etapa('Criando ' + portao.nome + '...');
        const criado = await criarPortao(evento.id, portao.nome);
        if (portao.quantidade > 0) pedidos.push({ portaoId: criado.id, quantidade: portao.quantidade });
      }

      const total = pedidos.reduce((soma, pedido) => soma + pedido.quantidade, 0);
      if (total > 0) {
        etapa('Gerando ' + total + ' ingressos com QR Code...');
        await criarIngressos(evento.id, pedidos);
      }
      etapa('Pronto! Abrindo o evento...');
      irPara('/gestor/evento');
    } catch (erro) {
      botao.disabled = false;
      if (!evento) {
        mostrarErro(erro.message + ' Nenhum dado foi criado.');
        return;
      }
      // O evento já existe no servidor: não repetir a criação; concluir pela tela do evento.
      botao.hidden = true;
      mostrarErro('O evento foi criado, mas a etapa seguinte falhou: ' + erro.message
        + ' Abra o evento para conferir o que foi salvo e concluir (portões e ingressos).');
      depois.innerHTML = '<a class="botao" href="#/gestor/evento">Abrir o evento</a>';
    }
  });
}
