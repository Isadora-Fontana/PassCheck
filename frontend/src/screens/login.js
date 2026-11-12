import { sessao, obterIdentidade } from '../sessao.js';
import { verificarUsuarioOperacao, obterOperacao } from '../db.js';
import { irPara } from '../router.js';
import { sincronizarAgora } from '../sincronizacao.js';

export async function telaLogin(app, { signal } = {}) {
  if (obterIdentidade()) { irPara('/eventos'); return; }
  app.innerHTML = `
    <section class="conteudo login">
      <h1 class="logo"><img src="/images/logoGrandePassCheck.svg" alt="PassCheck" /></h1>
      <p class="subtitulo">Entre com sua conta para acessar os eventos autorizados.</p>
      <form class="formulario" id="form-login">
        <div class="campo"><label for="usuario">Usuário</label>
          <input id="usuario" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" minlength="3" maxlength="64" required /></div>
        <div class="campo"><label for="senha">Senha</label>
          <input id="senha" name="password" type="password" autocomplete="current-password" minlength="8" maxlength="14"
            pattern="(?=.*\\p{Lu})(?=.*[\\p{P}\\p{S}]).{8,14}" aria-describedby="regra-senha" required />
          <small id="regra-senha">De 8 a 14 caracteres, com uma letra maiúscula e um caractere especial.</small></div>
        <div id="erro-login" class="aviso" role="alert" hidden></div>
        <button class="botao" type="submit">Entrar</button>
      </form>
      <!-- Somente visual: o cadastro ainda não existe no backend, então o botão não tem ação. -->
      <button class="botao botao-secundario" type="button" id="cadastrar">Cadastrar</button>
      <a id="continuar-offline" class="botao botao-secundario" href="#/scanner" hidden>Continuar operação preparada</a>
      <p class="subtitulo">A operação preparada permanece neste dispositivo. Para acessar o servidor após recarregar a página, entre novamente.</p>
    </section>`;
  const form = app.querySelector('form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const botao = form.querySelector('button');
    const erro = form.querySelector('#erro-login');
    const campoSenha = form.querySelector('#senha');
    erro.hidden = true;
    botao.disabled = true;
    try {
      await sessao.entrar(form.querySelector('#usuario').value.trim().toLowerCase(), campoSenha.value,
        { signal, verificarUsuario: verificarUsuarioOperacao });
      // Com a conta conectada, envia o que ficou guardado no aparelho.
      sincronizarAgora();
      if (!signal?.aborted) irPara('/eventos');
    } catch (falha) {
      if (!signal?.aborted) { erro.textContent = falha.message; erro.hidden = false; }
    } finally { campoSenha.value = ''; botao.disabled = false; }
  });
  const operacao = await obterOperacao().catch(() => null);
  if (!signal?.aborted && operacao?.usuarioId) app.querySelector('#continuar-offline').hidden = false;
}
