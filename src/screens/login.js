// Tela de login (apenas visual nesta versão, sem autenticação real).

import { irPara } from '../router.js';

export function telaLogin(app) {
  app.innerHTML = `
    <section class="conteudo login">
      <h1 class="logo">
        <img src="/images/logoGrandePassCheck.svg" alt="PassCheck" />
      </h1>
      <p class="subtitulo" style="text-align: center">Controle de acesso para eventos</p>

      <form class="formulario" id="form-login">
        <div class="campo">
          <label for="usuario">Usuário</label>
          <input id="usuario" type="text" autocomplete="username" />
        </div>
        <div class="campo">
          <label for="senha">Senha</label>
          <input id="senha" type="password" autocomplete="current-password" />
        </div>
        <button class="botao" type="submit">Entrar</button>
      </form>
    </section>
  `;

  const formulario = app.querySelector('#form-login');
  formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    irPara('/eventos');
  });
}
