import { HttpError } from '../middleware/errors.js';

export function createEventosService(repository) {
  function exigirEvento(eventoId) {
    if (!repository.eventoExiste(eventoId)) {
      throw new HttpError(404, 'EVENTO_NAO_ENCONTRADO', 'Evento não encontrado.');
    }
  }

  return {
    listarEventos() {
      return repository.listarEventos();
    },

    obterResumo(eventoId) {
      const resumo = repository.obterResumo(eventoId);
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

    listarPortoes(eventoId) {
      exigirEvento(eventoId);
      return repository.listarPortoes(eventoId);
    },

    listarIngressos(eventoId, portaoId) {
      exigirEvento(eventoId);
      if (!repository.portaoPertenceAoEvento(eventoId, portaoId)) {
        throw new HttpError(404, 'PORTAO_NAO_ENCONTRADO', 'Portão não encontrado neste evento.');
      }
      return repository.listarIngressos(eventoId, portaoId);
    },
  };
}
