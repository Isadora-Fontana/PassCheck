// Sobreposição em tela cheia com o resultado da validação.
// Fecha sozinha após alguns segundos (ou ao tocar) para liberar a próxima leitura.

const TEMPO_EXIBICAO_MS = 2000;

const resultados = {
  VALIDO: { titulo: 'VÁLIDO', icone: '✓', classe: 'resultado-valido' },
  JA_UTILIZADO: { titulo: 'JÁ UTILIZADO', icone: '!', classe: 'resultado-recusado' },
  INVALIDO: { titulo: 'INVÁLIDO', icone: '✕', classe: 'resultado-recusado' },
  PORTAO_INCORRETO: { titulo: 'PORTÃO INCORRETO', icone: '⇄', classe: 'resultado-recusado' },
};

/**
 * Mostra o resultado em tela cheia.
 * @param {string} status   uma das chaves de `resultados`
 * @param {object} opcoes
 * @param {string} [opcoes.codigo]    código do ingresso lido, exibido abaixo do título
 * @param {Function} [opcoes.aoFechar] chamada quando a sobreposição é fechada
 */
export function mostrarResultado(status, { codigo, aoFechar } = {}) {
  const resultado = resultados[status];

  const sobreposicao = document.createElement('div');
  sobreposicao.className = `resultado ${resultado.classe}`;
  sobreposicao.innerHTML = `
    <div class="resultado-icone">${resultado.icone}</div>
    <div class="resultado-titulo">${resultado.titulo}</div>
    <div class="resultado-codigo"></div>
    <div class="resultado-dica">Toque para continuar</div>
  `;
  // textContent evita que o conteúdo do QR Code seja interpretado como HTML.
  sobreposicao.querySelector('.resultado-codigo').textContent = codigo || '';

  let fechada = false;

  function fechar() {
    if (fechada) return;
    fechada = true;
    clearTimeout(temporizador);
    sobreposicao.remove();
    if (aoFechar) aoFechar();
  }

  const temporizador = setTimeout(fechar, TEMPO_EXIBICAO_MS);
  sobreposicao.addEventListener('click', fechar);

  document.body.appendChild(sobreposicao);
}
