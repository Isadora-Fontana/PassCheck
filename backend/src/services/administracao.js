import { databaseUnavailable } from '../db/access.js';
import { HttpError } from '../middleware/errors.js';
import { lerCsv, rejeitarLinhas } from './csv.js';

function exigirIdSeguro(id) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Identificador persistido inválido.');
}

export function createAdministracaoService(repository, identidade) {
  async function executar(principal, action, leitura = false) {
    try {
      return await (leitura ? repository.leitura : repository.transacao)(async () => {
        const admin = await identidade.exigirAdministrador(principal);
        return action(admin);
      });
    } catch (error) {
      if (databaseUnavailable(error)) {
        throw new HttpError(503, 'BANCO_INDISPONIVEL', 'Não foi possível concluir a operação. Tente novamente.');
      }
      throw error;
    }
  }
  async function eventoExistente(id) {
    const evento = await repository.evento(id);
    if (!evento) throw new HttpError(404, 'EVENTO_NAO_ENCONTRADO', 'Evento não encontrado.');
    return evento;
  }
  return {
    criarEvento(principal, dados) {
      return executar(principal, async () => {
        const evento = await repository.criarEvento(dados);
        exigirIdSeguro(evento.id);
        return evento;
      });
    },
    atualizarEvento(principal, id, dados) {
      return executar(principal, async () => repository.atualizarEvento(id, { ...await eventoExistente(id), ...dados }));
    },
    criarPortao(principal, eventoId, { nome }) {
      return executar(principal, async () => {
        await eventoExistente(eventoId);
        const portao = await repository.criarPortao(eventoId, nome);
        exigirIdSeguro(portao.id);
        return portao;
      });
    },
    /**
     * Aprovação do gestor: concede ao operador o evento e um único portão desse evento.
     * Reaplicar com outro portão substitui o anterior (alterar portão). Idempotente.
     * Atenção: validações ainda não enviadas do portão anterior passam a ser recusadas
     * no envio (403); a troca deve ser feita quando a fila do operador estiver em dia.
     */
    concederOperador(principal, eventoId, { usuarioId, portaoId }) {
      return executar(principal, async () => {
        await eventoExistente(eventoId);
        const operador = await repository.usuario(usuarioId);
        if (!operador || !operador.ativo || operador.papel !== 'OPERADOR') {
          throw new HttpError(404, 'OPERADOR_NAO_ENCONTRADO', 'Operador não encontrado.');
        }
        if (!(await repository.portaoDoEvento(portaoId, eventoId))) {
          throw new HttpError(422, 'PORTAO_INCOMPATIVEL', 'O portão não pertence a este evento.');
        }
        await repository.concederEvento(usuarioId, eventoId);
        await repository.definirPortao(usuarioId, eventoId, portaoId);
        return { usuarioId, eventoId, portaoId };
      });
    },
    importar(principal, eventoId, buffer) {
      return executar(principal, async () => {
        await eventoExistente(eventoId);
        const rows = lerCsv(buffer);
        const io = await repository.prepararImportacao();
        const codigos = new Map();
        for (const row of rows) {
          if (row.codigo !== undefined) {
            codigos.set(row.codigo, (codigos.get(row.codigo) ?? 0) + 1);
            if (await io.codigoExiste(row.codigo)) row.motivos.push('CODIGO_JA_CADASTRADO');
          }
          if (row.eventoId !== undefined && row.eventoId !== eventoId) row.motivos.push('EVENTO_INCOMPATIVEL');
          if (row.portaoId !== undefined && !(await io.portaoPertence(eventoId, row.portaoId))) row.motivos.push('PORTAO_INCOMPATIVEL');
        }
        for (const row of rows) if (codigos.get(row.codigo) > 1) row.motivos.push('CODIGO_DUPLICADO_NO_ARQUIVO');
        const invalidas = rows.filter((row) => row.motivos.length);
        if (invalidas.length) rejeitarLinhas(invalidas);
        for (const row of rows) exigirIdSeguro(await io.inserir(row));
        return { eventoId, importados: rows.length };
      });
    },
    listarPendencias(principal, eventoId, query) {
      return executar(principal, async () => {
        await eventoExistente(eventoId);
        const rows = await repository.listarPendencias(eventoId, query);
        const pendencias = rows.slice(0, query.limite);
        return { pendencias, proximoCursor: rows.length > query.limite ? pendencias.at(-1).recebimentoId : null };
      }, true);
    },
    resolver(principal, recebimentoId, { justificativa }) {
      return executar(principal, async (admin) => {
        const recibo = await repository.recibo(recebimentoId);
        if (!recibo) throw new HttpError(404, 'PENDENCIA_NAO_ENCONTRADA', 'Pendência não encontrada.');
        if (!['CONFLITO', 'REJEITADA'].includes(recibo.status)) {
          throw new HttpError(409, 'RECIBO_NAO_RESOLVIVEL', 'Somente conflitos ou rejeições podem ser resolvidos.');
        }
        if (await repository.resolucao(recebimentoId)) throw new HttpError(409, 'PENDENCIA_JA_RESOLVIDA', 'Pendência já resolvida.');
        const resolucao = await repository.resolver(recebimentoId, admin.id, justificativa);
        exigirIdSeguro(resolucao.id);
        return { recebimentoId, statusOriginal: recibo.status, statusAdministrativo: 'RESOLVIDA', resolucao };
      });
    },
  };
}
