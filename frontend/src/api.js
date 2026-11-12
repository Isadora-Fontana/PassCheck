import { requisitar } from './sessao.js';
import { ErroApi } from './http.js';

const idValido = (id) => Number.isSafeInteger(id) && id > 0;
function idCaminho(id) {
  if (!idValido(id)) throw new Error('Identificador inválido.');
  return String(id);
}
function lista(data, validar) {
  if (!Array.isArray(data) || !data.every(validar)) {
    throw new ErroApi('Dados inesperados recebidos do servidor.', { codigo: 'CONTRATO' });
  }
  return data;
}
export async function buscarEventos(opcoes) {
  return lista(await requisitar('/eventos', opcoes), (item) => idValido(item?.id)
    && ['nome', 'data', 'local'].every((campo) => typeof item[campo] === 'string'));
}
export async function buscarPortoes(eventoId, opcoes) {
  return lista(await requisitar('/eventos/' + idCaminho(eventoId) + '/portoes', opcoes),
    (item) => idValido(item?.id) && item.eventoId === eventoId && typeof item.nome === 'string');
}
export async function buscarIngressos(eventoId, portaoId, opcoes) {
  return lista(await requisitar('/eventos/' + idCaminho(eventoId) + '/portoes/' + idCaminho(portaoId) + '/ingressos', opcoes),
    (item) => idValido(item?.id) && item.eventoId === eventoId && item.portaoId === portaoId
      && typeof item.codigo === 'string' && typeof item.utilizado === 'boolean');
}
export async function registrarInstalacao(dispositivo, opcoes) {
  const data = await requisitar('/auth/instalacoes', { ...opcoes, method: 'POST', body: { dispositivo } });
  if (data?.dispositivo !== dispositivo) throw new ErroApi('Registro de instalação inválido.', { codigo: 'CONTRATO' });
  return data;
}

const MOTIVOS_RECUSA = new Set(['INGRESSO_JA_UTILIZADO', 'EVENTO_INEXISTENTE', 'PORTAO_INEXISTENTE',
  'PORTAO_INCOMPATIVEL', 'INGRESSO_INEXISTENTE', 'CODIGO_INCOMPATIVEL', 'EVENTO_INCOMPATIVEL',
  'IDEMPOTENCIA_DIVERGENTE']);

/**
 * Confere a resposta do POST /sincronizacao contra o lote enviado, antes de gravar qualquer coisa.
 * Exige exatamente um resultado por validação, na mesma ordem, com status e campos do contrato.
 * Se algo não bater, nada é reconhecido: o lote continua na fila e será reenviado.
 */
export function validarResultados(lote, data) {
  const resultados = data?.resultados;
  const valido = Array.isArray(resultados) && resultados.length === lote.validacoes.length
    && resultados.every((resultado, posicao) => {
      if (resultado?.idLocal !== lote.validacoes[posicao].idLocal) return false;
      const final = resultado.status === 'JA_PROCESSADA' ? resultado.resultadoOriginal : resultado.status;
      if (final === 'CONFIRMADA') return idValido(resultado.validacaoId);
      if (final === 'CONFLITO' || final === 'REJEITADA') return MOTIVOS_RECUSA.has(resultado.motivo);
      return false;
    });
  if (!valido) throw new ErroApi('Resposta de sincronização inesperada. A fila foi preservada.', { codigo: 'CONTRATO' });
  return resultados;
}

// POST /sincronizacao — envia um lote de validações locais.
export async function enviarValidacoes(lote, opcoes) {
  return validarResultados(lote, await requisitar('/sincronizacao', { ...opcoes, method: 'POST', body: lote }));
}

// ---------- Cadastro de eventos e ingressos (somente ADMINISTRADOR no backend atual) ----------

// POST /eventos — o servidor aceita somente nome, data (AAAA-MM-DD) e local; ainda não há horário.
export async function criarEvento({ nome, data, local }, opcoes) {
  const evento = await requisitar('/eventos', { ...opcoes, method: 'POST', body: { nome, data, local } });
  if (!idValido(evento?.id) || evento.nome !== nome || evento.data !== data) {
    throw new ErroApi('Resposta inesperada ao criar o evento.', { codigo: 'CONTRATO' });
  }
  return evento;
}

// POST /eventos/:eventoId/portoes
export async function criarPortao(eventoId, nome, opcoes) {
  const portao = await requisitar('/eventos/' + idCaminho(eventoId) + '/portoes', { ...opcoes, method: 'POST', body: { nome } });
  if (!idValido(portao?.id) || portao.eventoId !== eventoId) {
    throw new ErroApi('Resposta inesperada ao criar o portão.', { codigo: 'CONTRATO' });
  }
  return portao;
}

// POST /eventos/:eventoId/ingressos/importar — corpo em CSV; tudo ou nada.
export async function importarIngressos(eventoId, csv, opcoes) {
  const resposta = await requisitar('/eventos/' + idCaminho(eventoId) + '/ingressos/importar',
    { ...opcoes, method: 'POST', body: csv, tipoConteudo: 'text/csv; charset=utf-8' });
  if (resposta?.eventoId !== eventoId || !Number.isSafeInteger(resposta.importados)) {
    throw new ErroApi('Resposta inesperada ao importar ingressos.', { codigo: 'CONTRATO' });
  }
  return resposta.importados;
}

// POST /eventos/:eventoId/operadores — aprovação do gestor: libera o operador no evento,
// em um único portão (enviar outro portão substitui o anterior).
export async function concederOperador(eventoId, usuarioId, portaoId, opcoes) {
  const resposta = await requisitar('/eventos/' + idCaminho(eventoId) + '/operadores',
    { ...opcoes, method: 'POST', body: { usuarioId, portaoId } });
  if (resposta?.eventoId !== eventoId || resposta.usuarioId !== usuarioId || resposta.portaoId !== portaoId) {
    throw new ErroApi('Resposta inesperada ao liberar o operador.', { codigo: 'CONTRATO' });
  }
  return resposta;
}
