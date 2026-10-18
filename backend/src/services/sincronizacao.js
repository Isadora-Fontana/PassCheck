import { createHash } from 'node:crypto';
import { HttpError } from '../middleware/errors.js';

function hash(content) {
  return createHash('sha256').update(content).digest('hex');
}

function exigirIdSeguro(id) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Identificador persistido inválido.');
  return id;
}

export function createSincronizacaoService(repository, identidade) {
  function processarItem(lote, item, correlacaoId) {
    const content = JSON.stringify({
      eventoId: lote.eventoId, portaoId: lote.portaoId, ingressoId: item.ingressoId,
      codigo: item.codigo, dataHora: item.dataHora,
    });
    const original = repository.buscarRecibo(lote.dispositivo, item.idLocal);
    if (original) {
      if (original.conteudo_normalizado !== content) {
        repository.auditarDivergencia(original.id, correlacaoId, hash(original.conteudo_normalizado), hash(content));
        return { idLocal: item.idLocal, status: 'REJEITADA', motivo: 'IDEMPOTENCIA_DIVERGENTE' };
      }
      if (original.status === 'CONFIRMADA') {
        if (original.validacao_ingresso_id !== item.ingressoId) throw new Error('Confirmação inconsistente.');
        return { idLocal: item.idLocal, status: 'JA_PROCESSADA', resultadoOriginal: original.status,
          validacaoId: exigirIdSeguro(original.validacao_id) };
      }
      return { idLocal: item.idLocal, status: 'JA_PROCESSADA', resultadoOriginal: original.status, motivo: original.motivo };
    }

    function recusar(motivo, status = 'REJEITADA') {
      repository.inserirRecibo(lote.dispositivo, item.idLocal, content, status, motivo);
      return { idLocal: item.idLocal, status, motivo };
    }

    if (!repository.eventoExiste(lote.eventoId)) return recusar('EVENTO_INEXISTENTE');
    const portao = repository.buscarPortao(lote.portaoId);
    if (!portao) return recusar('PORTAO_INEXISTENTE');
    if (portao.evento_id !== lote.eventoId) return recusar('PORTAO_INCOMPATIVEL');
    const ingresso = repository.buscarIngresso(item.ingressoId);
    if (!ingresso) return recusar('INGRESSO_INEXISTENTE');
    if (ingresso.codigo !== item.codigo) return recusar('CODIGO_INCOMPATIVEL');
    if (ingresso.evento_id !== lote.eventoId) return recusar('EVENTO_INCOMPATIVEL');
    if (ingresso.portao_id !== lote.portaoId) return recusar('PORTAO_INCOMPATIVEL');
    if (ingresso.utilizado !== Number(ingresso.validacao_id !== null)) throw new Error('Estado de utilização inconsistente.');
    if (ingresso.validacao_id !== null) return recusar('INGRESSO_JA_UTILIZADO', 'CONFLITO');

    const receiptId = repository.inserirRecibo(lote.dispositivo, item.idLocal, content, 'CONFIRMADA', null);
    const validacaoId = repository.inserirValidacao(item.ingressoId, receiptId, item.dataHora);
    return { idLocal: item.idLocal, status: 'CONFIRMADA', validacaoId: exigirIdSeguro(validacaoId) };
  }

  return {
    sincronizar(lote, correlacaoId, principal) {
      const resultados = [];
      try {
        for (const item of lote.validacoes) {
          resultados.push(repository.transacao(() => {
            identidade.exigirSincronizacao(principal, lote);
            return processarItem(lote, item, correlacaoId);
          }));
        }
      } catch (error) {
        if (error.code === 'SQLITE_BUSY' || error.code?.startsWith('SQLITE_BUSY_')) {
          throw new HttpError(503, 'BANCO_INDISPONIVEL', 'Não foi possível concluir o lote. Tente novamente.');
        }
        throw error;
      }
      return { resultados };
    },
  };
}
