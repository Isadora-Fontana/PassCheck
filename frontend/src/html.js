// Evita que textos digitados (nome do evento, portão, local...) sejam
// interpretados como HTML quando colocados dentro de innerHTML.
export function escaparHtml(texto) {
  return String(texto ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Converte '2026-11-20' em '20/11/2026'.
export function formatarData(dataISO) {
  const [ano, mes, dia] = String(dataISO).split('-');
  return `${dia}/${mes}/${ano}`;
}
