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
