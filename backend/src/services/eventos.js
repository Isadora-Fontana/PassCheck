import { HttpError } from '../middleware/errors.js';

export function createEventosService(repository) {
  async function exigirEvento(eventoId) {
    if (!(await repository.eventoExiste(eventoId))) {
      throw new HttpError(404, 'EVENTO_NAO_ENCONTRADO', 'Evento não encontrado.');
    }
  }

  return {
    async listarEventos() {
      return repository.listarEventos();
    },

    async obterResumo(eventoId) {
      const resumo = await repository.obterResumo(eventoId);
      if (!resumo) throw new HttpError(404, 'EVENTO_NAO_ENCONTRADO', 'Evento não encontrado.');
      const { evento, totalIngressos, entradas, portoes } = resumo;
      const counts = [totalIngressos, entradas, ...portoes.map((portao) => portao.entradas)];
      if (counts.some((count) => !Number.isSafeInteger(count) || count < 0)
        || entradas > totalIngressos
        || portoes.reduce((sum, portao) => sum + portao.entradas, 0) !== entradas) {
        throw new HttpError(500, 'INDICADORES_INCONSISTENTES', 'Não foi possível obter indicadores consistentes.');
      }
      return { evento, totalIngressos, entradas, restantes: totalIngressos - entradas, portoes };
    },

    async listarPortoes(eventoId) {
      await exigirEvento(eventoId);
      return repository.listarPortoes(eventoId);
    },

    async listarIngressos(eventoId, portaoId) {
      await exigirEvento(eventoId);
      if (!(await repository.portaoPertenceAoEvento(eventoId, portaoId))) {
        throw new HttpError(404, 'PORTAO_NAO_ENCONTRADO', 'Portão não encontrado neste evento.');
      }
      return repository.listarIngressos(eventoId, portaoId);
    },
  };
}
