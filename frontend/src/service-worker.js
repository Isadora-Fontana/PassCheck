// Service Worker do PassCheck.
// Guarda em cache os arquivos do aplicativo para que ele abra sem internet.
//
// Este arquivo é um modelo: no `npm run build`, o vite.config.js substitui
// VERSAO e ARQUIVOS_DO_APP pelos valores reais e gera o arquivo final /sw.js.
//
// Importante: o Service Worker cuida apenas dos ARQUIVOS do aplicativo.
// Os dados (ingressos, operação e validações pendentes) ficam no IndexedDB,
// que nunca é tocado aqui. Atualizar o aplicativo não apaga esses dados.

const VERSAO = '__VERSAO__';
const ARQUIVOS_DO_APP = ['__ARQUIVOS__'];

const PREFIXO_CACHE = 'passcheck-app-';
const NOME_CACHE = PREFIXO_CACHE + VERSAO;

// Instalação: baixa e guarda todos os arquivos desta versão.
// Se algum arquivo falhar, a versão nova não é instalada e a antiga continua valendo.
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(NOME_CACHE)
      // cache: 'reload' garante que os arquivos venham do servidor, e não do cache HTTP.
      .then((cache) => cache.addAll(ARQUIVOS_DO_APP.map((url) => new Request(url, { cache: 'reload' }))))
      // Ativa a versão nova sem esperar o aplicativo ser fechado por completo.
      .then(() => self.skipWaiting())
  );
});

// Ativação: apaga os caches de versões antigas do aplicativo.
// Só remove caches com o prefixo do PassCheck; o IndexedDB não é afetado.
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomes) =>
        Promise.all(
          nomes
            .filter((nome) => nome.startsWith(PREFIXO_CACHE) && nome !== NOME_CACHE)
            .map((nome) => caches.delete(nome))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Requisições: responde com os arquivos do cache; se não estiverem lá, busca na rede.
self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  const url = new URL(pedido.url);

  // Só cuida de leituras (GET) do próprio site. Chamadas à API e a outros
  // endereços seguem direto para a rede, sem cache.
  if (pedido.method !== 'GET' || url.origin !== self.location.origin) return;

  // Abrir ou recarregar o aplicativo: sempre entrega o index.html do cache.
  // As telas usam endereços com # (ex.: /#/scanner), então todas usam o mesmo arquivo.
  if (pedido.mode === 'navigate') {
    evento.respondWith(
      caches.match('/index.html', { cacheName: NOME_CACHE }).then((resposta) => resposta || fetch(pedido))
    );
    return;
  }

  evento.respondWith(
    caches.match(pedido, { cacheName: NOME_CACHE }).then((resposta) => resposta || fetch(pedido))
  );
});
