// Formulário de criação de evento do gestor (demonstração):
// nome, data, local e cadastro dos portões.

import { irPara } from '../router.js';
import { criarEvento } from '../demo/armazenamentoDemo.js';
import { exigirPerfil, selecionarEventoGestor, PERFIS } from '../demo/perfilDemo.js';

export function telaGestorNovoEvento(app) {
  if (!exigirPerfil(PERFIS.GESTOR)) return;

  app.innerHTML = `
    <header class="cabecalho">
      <a href="#/gestor">← Voltar</a>
      <h1>Criar evento</h1>
    </header>

    <section class="conteudo">
      <form class="formulario" id="form-evento" novalidate>
        <div class="campo">
          <label for="nome">Nome do evento</label>
          <input id="nome" type="text" maxlength="80" required />
        </div>
        <div class="campo">
          <label for="data">Data</label>
          <input id="data" type="date" required />
        </div>
        <div class="campo">
          <label for="local">Local</label>
          <input id="local" type="text" maxlength="80" required />
        </div>

        <fieldset class="campo grupo-portoes">
          <legend>Portões</legend>
          <div id="lista-portoes"></div>
          <button class="botao botao-secundario" type="button" id="adicionar-portao">+ Adicionar portão</button>
        </fieldset>

        <div class="aviso" id="erro-formulario" hidden></div>
        <button class="botao" type="submit">Salvar evento</button>
      </form>
    </section>
  `;

  const listaPortoes = app.querySelector('#lista-portoes');
  const erroFormulario = app.querySelector('#erro-formulario');

  /**
   * Acrescenta um campo de portão. O botão "Remover" só aparece quando há mais de um.
   */
  function adicionarCampoPortao(valor = '') {
    const linha = document.createElement('div');
    linha.className = 'linha-portao';
    linha.innerHTML = `
      <input type="text" maxlength="40" placeholder="Ex.: Portão A" aria-label="Nome do portão" />
      <button class="botao botao-secundario" type="button">Remover</button>
    `;
    linha.querySelector('input').value = valor;
    linha.querySelector('button').addEventListener('click', () => {
      linha.remove();
      atualizarBotoesRemover();
    });
    listaPortoes.appendChild(linha);
    atualizarBotoesRemover();
  }

  function atualizarBotoesRemover() {
    const linhas = listaPortoes.querySelectorAll('.linha-portao');
    linhas.forEach((linha) => {
      linha.querySelector('button').hidden = linhas.length === 1;
    });
  }

  function mostrarErro(mensagem) {
    erroFormulario.textContent = mensagem;
    erroFormulario.hidden = false;
  }

  adicionarCampoPortao();
  app.querySelector('#adicionar-portao').addEventListener('click', () => {
    adicionarCampoPortao();
    listaPortoes.lastElementChild.querySelector('input').focus();
  });

  app.querySelector('#form-evento').addEventListener('submit', (evento) => {
    evento.preventDefault();

    const nome = app.querySelector('#nome').value.trim();
    const data = app.querySelector('#data').value;
    const local = app.querySelector('#local').value.trim();
    const nomesPortoes = [...listaPortoes.querySelectorAll('input')]
      .map((campo) => campo.value.trim())
      .filter((nomePortao) => nomePortao !== '');

    if (!nome || !data || !local) {
      mostrarErro('Preencha o nome, a data e o local do evento.');
      return;
    }
    if (nomesPortoes.length === 0) {
      mostrarErro('Cadastre pelo menos um portão.');
      return;
    }
    const nomesEmMinusculas = nomesPortoes.map((nomePortao) => nomePortao.toLowerCase());
    if (new Set(nomesEmMinusculas).size !== nomesEmMinusculas.length) {
      mostrarErro('Há portões com o mesmo nome. Use nomes diferentes.');
      return;
    }

    const eventoCriado = criarEvento({ nome, data, local, nomesPortoes });
    selecionarEventoGestor(eventoCriado.id);
    irPara('/gestor/evento');
  });
}
