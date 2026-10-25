// Router simples baseado no hash da URL (ex.: #/eventos).
// Cada rota aponta para uma função que desenha a tela dentro de <main id="app">.

import { telaLogin } from './screens/login.js';
import { telaPreparacao } from './screens/preparacao.js';
import { telaScanner } from './screens/scanner.js';
import { telaDashboard } from './screens/dashboard.js';
import { telaGestorPainel } from './screens/gestor-painel.js';
import { telaGestorNovoEvento } from './screens/gestor-novo-evento.js';
import { telaGestorEvento } from './screens/gestor-evento.js';
import { telaOperador } from './screens/operador.js';
import { irParaInicioDoPerfil } from './demo/perfilDemo.js';

// As telas de seleção livre de evento/portão (screens/eventos.js e screens/portoes.js)
// continuam no projeto, mas estão desativadas: com os perfis de demonstração, o operador
// só usa o evento e o portão atribuídos pelo gestor (tela #/operador).
function redirecionarParaInicio() {
  irParaInicioDoPerfil();
}

const rotas = {
  '/login': telaLogin,
  '/eventos': redirecionarParaInicio,
  '/portoes': redirecionarParaInicio,
  '/preparacao': telaPreparacao,
  '/scanner': telaScanner,
  '/dashboard': telaDashboard,

  // Perfis de demonstração
  '/gestor': telaGestorPainel,
  '/gestor/novo-evento': telaGestorNovoEvento,
  '/gestor/evento': telaGestorEvento,
  '/operador': telaOperador,
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
