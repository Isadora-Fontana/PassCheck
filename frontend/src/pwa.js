// Registra o Service Worker, que permite abrir o aplicativo sem internet.
// Só funciona na versão de produção (npm run build), porque o /sw.js é gerado no build.
// Em desenvolvimento (npm run dev) nada é registrado, para não atrapalhar as alterações.
// Também pede ao navegador que não apague os dados locais (veja solicitarArmazenamentoPersistente).

export function registrarServiceWorker() {
  solicitarArmazenamentoPersistente();

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      const registro = await navigator.serviceWorker.register('/sw.js');

      // O navegador já procura versões novas ao abrir o aplicativo.
      // Também procuramos quando a internet volta e quando o app volta a ficar visível,
      // porque no iPhone o aplicativo instalado pode ficar aberto por muito tempo.
      const procurarAtualizacao = () => registro.update().catch(() => {});
      window.addEventListener('online', procurarAtualizacao);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) procurarAtualizacao();
      });
    } catch (erro) {
      console.warn('Não foi possível registrar o Service Worker:', erro);
    }
  });
}

/**
 * Pede ao navegador armazenamento persistente, para que o IndexedDB (ingressos e
 * validações pendentes) e o localStorage não sejam apagados automaticamente
 * quando faltar espaço no aparelho.
 *
 * É apenas um pedido: o navegador decide se concede (o Chrome, por exemplo, decide
 * sozinho, sem perguntar ao usuário). Se não conceder ou não tiver suporte, o
 * aplicativo funciona normalmente, mas os dados continuam sujeitos à limpeza
 * automática do navegador. Executada uma vez por abertura do aplicativo e
 * somente se a persistência ainda não tiver sido concedida.
 *
 * @returns {Promise<boolean>} true somente se a persistência estiver concedida
 */
export async function solicitarArmazenamentoPersistente() {
  const storage = navigator.storage;
  if (!storage || typeof storage.persist !== 'function' || typeof storage.persisted !== 'function') {
    return false;
  }

  try {
    if (await storage.persisted()) return true;

    const concedido = await storage.persist();
    if (!concedido) {
      console.info(
        'Armazenamento persistente não concedido pelo navegador: os dados locais podem ser apagados se faltar espaço.'
      );
    }
    return concedido;
  } catch (erro) {
    console.warn('Não foi possível solicitar armazenamento persistente:', erro);
    return false;
  }
}
