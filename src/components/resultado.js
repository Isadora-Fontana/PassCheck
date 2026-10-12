// Sobreposição em tela cheia com o resultado da validação.
// Fecha sozinha após alguns segundos (ou ao tocar) para liberar a próxima leitura.

const TEMPO_EXIBICAO_MS = 2000;

const resultados = {
  VALIDO: { titulo: 'VÁLIDO', icone: '✓', classe: 'resultado-valido' },
  JA_UTILIZADO: { titulo: 'JÁ UTILIZADO', icone: '!', classe: 'resultado-recusado' },
  INVALIDO: { titulo: 'INVÁLIDO', icone: '✕', classe: 'resultado-recusado' },
  PORTAO_INCORRETO: { titulo: 'PORTÃO INCORRETO', icone: '⇄', classe: 'resultado-recusado' },
};

export function mostrarResultado(status) {
  const resultado = resultados[status];

  const sobreposicao = document.createElement('div');
  sobreposicao.className = `resultado ${resultado.classe}`;
  sobreposicao.innerHTML = `
    <div class="resultado-icone">${resultado.icone}</div>
    <div class="resultado-titulo">${resultado.titulo}</div>
    <div class="resultado-dica">Toque para continuar</div>
  `;

  function fechar() {
    clearTimeout(temporizador);
    sobreposicao.remove();
  }

  const temporizador = setTimeout(fechar, TEMPO_EXIBICAO_MS);
  sobreposicao.addEventListener('click', fechar);

  document.body.appendChild(sobreposicao);
}
