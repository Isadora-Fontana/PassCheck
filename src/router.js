// Router simples baseado no hash da URL (ex.: #/eventos).
// Cada rota aponta para uma função que desenha a tela dentro de <main id="app">.

import { telaLogin } from './screens/login.js';
import { telaEventos } from './screens/eventos.js';
import { telaPortoes } from './screens/portoes.js';
import { telaPreparacao } from './screens/preparacao.js';
import { telaScanner } from './screens/scanner.js';
import { telaDashboard } from './screens/dashboard.js';

const rotas = {
  '/login': telaLogin,
  '/eventos': telaEventos,
  '/portoes': telaPortoes,
  '/preparacao': telaPreparacao,
  '/scanner': telaScanner,
  '/dashboard': telaDashboard,
};

function mostrarTelaAtual() {
  const caminho = location.hash.replace('#', '') || '/login';
  const desenharTela = rotas[caminho] || telaLogin;
  const app = document.getElementById('app');

  desenharTela(app);
  window.scrollTo(0, 0);
}

export function iniciarRouter() {
  window.addEventListener('hashchange', mostrarTelaAtual);
  mostrarTelaAtual();
}

export function irPara(caminho) {
  location.hash = caminho;
}
