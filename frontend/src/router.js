import { telaLogin } from './screens/login.js';
import { telaEventos } from './screens/eventos.js';
import { telaPortoes } from './screens/portoes.js';
import { telaPreparacao } from './screens/preparacao.js';
import { telaScanner } from './screens/scanner.js';
import { telaDashboard } from './screens/dashboard.js';

// As telas demo permanecem no fonte, fora das rotas da aplicação integrada.
const rotas = {
  '/login': telaLogin, '/eventos': telaEventos, '/portoes': telaPortoes,
  '/preparacao': telaPreparacao, '/scanner': telaScanner, '/dashboard': telaDashboard,
  '/gestor': telaEventos, '/operador': telaEventos,
};
let navegacao;
async function mostrarTelaAtual() {
  navegacao?.abort();
  const controller = new AbortController();
  navegacao = controller;
  const caminho = location.hash.replace('#', '') || '/login';
  const app = document.getElementById('app');
  try {
    await (rotas[caminho] || telaLogin)(app, { signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) return;
    app.innerHTML = '<section class="conteudo"><p class="aviso" role="alert"></p><a class="botao" href="#/login">Entrar novamente</a><a class="botao botao-secundario" href="#/eventos">Voltar aos eventos</a></section>';
    app.querySelector('p').textContent = error.message || 'Não foi possível abrir esta tela.';
  }
  if (!controller.signal.aborted) window.scrollTo(0, 0);
}
export function iniciarRouter() {
  window.addEventListener('hashchange', mostrarTelaAtual);
  mostrarTelaAtual();
}
export function irPara(caminho) { location.hash = caminho; }
