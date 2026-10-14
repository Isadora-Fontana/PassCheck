// Registra o Service Worker, que permite abrir o aplicativo sem internet.
// Só funciona na versão de produção (npm run build), porque o /sw.js é gerado no build.
// Em desenvolvimento (npm run dev) nada é registrado, para não atrapalhar as alterações.

export function registrarServiceWorker() {
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
