// Tela de login de DEMONSTRAÇÃO.
// Não há autenticação real: o usuário apenas escolhe com qual perfil quer testar.
// A autenticação real será integrada depois com o back-end.

import { entrarComo, irParaInicioDoPerfil, PERFIS } from '../demo/perfilDemo.js';

export function telaLogin(app) {
  app.innerHTML = `
    <section class="conteudo login">
      <h1 class="logo">
        <img src="/images/logoGrandePassCheck.svg" alt="PassCheck" />
      </h1>
      <p class="subtitulo" style="text-align: center">Controle de acesso para eventos</p>

      <div class="aviso">
        <strong>Modo demonstração.</strong> Não há autenticação real:
        escolha um perfil para testar o sistema.
      </div>

      <div class="acoes">
        <button class="botao" type="button" data-perfil="${PERFIS.GESTOR}">Entrar como gestor (demo)</button>
        <button class="botao" type="button" data-perfil="${PERFIS.OPERADOR}">Entrar como operador (demo)</button>
      </div>
    </section>
  `;

  app.querySelectorAll('[data-perfil]').forEach((botao) => {
    botao.addEventListener('click', () => {
      entrarComo(botao.dataset.perfil);
      irParaInicioDoPerfil();
    });
  });
}
