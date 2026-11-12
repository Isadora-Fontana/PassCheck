// Geração de ingressos pelo próprio sistema.
// O ingresso no servidor é apenas: código + evento + portão. O QR Code guarda somente
// o código (ex.: PC-7KQ2M9XA); data, local e portão vêm do evento na hora de exibir.

// Sem 0/O e 1/I/L, para evitar confusão ao conferir o código impresso.
const CARACTERES = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TAMANHO_CODIGO = 8;
// Limite do servidor por importação: 1000 ingressos.
export const MAXIMO_POR_IMPORTACAO = 1000;

/**
 * Sorteia um código com gerador criptográfico (difícil de adivinhar).
 * Descarta sorteios acima do maior múltiplo do alfabeto para não favorecer letras.
 */
function sortearCodigo() {
  const limite = Math.floor(256 / CARACTERES.length) * CARACTERES.length;
  let codigo = 'PC-';
  while (codigo.length < 3 + TAMANHO_CODIGO) {
    const [byte] = crypto.getRandomValues(new Uint8Array(1));
    if (byte < limite) codigo += CARACTERES[byte % CARACTERES.length];
  }
  return codigo;
}

/**
 * Gera `quantidade` códigos diferentes entre si e diferentes dos já existentes.
 * A unicidade global é garantida pelo servidor, que recusa a importação inteira
 * se algum código já estiver cadastrado.
 */
export function gerarCodigos(quantidade, existentes = new Set()) {
  const codigos = new Set();
  while (codigos.size < quantidade) {
    const codigo = sortearCodigo();
    if (!existentes.has(codigo)) codigos.add(codigo);
  }
  return [...codigos];
}

/**
 * Monta o CSV exigido pelo servidor: cabeçalho codigo,eventoId,portaoId.
 * @param {Array<{ codigo: string, eventoId: number, portaoId: number }>} ingressos
 */
export function montarCsv(ingressos) {
  return ['codigo,eventoId,portaoId', ...ingressos.map((i) => `${i.codigo},${i.eventoId},${i.portaoId}`)].join('\n') + '\n';
}

/**
 * Divide a lista em partes de no máximo 1000 ingressos (limite por importação).
 */
export function dividirEmImportacoes(ingressos) {
  const partes = [];
  for (let inicio = 0; inicio < ingressos.length; inicio += MAXIMO_POR_IMPORTACAO) {
    partes.push(ingressos.slice(inicio, inicio + MAXIMO_POR_IMPORTACAO));
  }
  return partes;
}
