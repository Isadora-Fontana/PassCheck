import { HttpError } from '../middleware/errors.js';
import { naoAutenticado } from './tokens.js';
import { verificarSenha } from './senhas.js';

const publico = ({ id, usuario, papel }) => ({ id, usuario, papel });
const negado = () => new HttpError(403, 'ACESSO_NEGADO', 'Acesso não permitido.');

export function createIdentidadeService(repository, tokens, config) {
  let verificacoes = 0;
  function atual(principal) {
    if (!principal) throw naoAutenticado();
    const usuario = repository.porId(principal.id);
    if (!usuario?.ativo || usuario.versao_token !== principal.versao_token) throw naoAutenticado();
    return usuario;
  }
  function exigirEvento(principal, eventoId) {
    const usuario = atual(principal);
    if (usuario.papel !== 'ADMINISTRADOR' && !repository.eventoPermitido(usuario.id, eventoId)) throw negado();
    return usuario;
  }
  return {
    atual, exigirEvento,
    async autenticar(authorization) { return atual(await tokens.verificar(authorization)); },
    async login({ usuario, senha }) {
      if (verificacoes >= 2) throw new HttpError(429, 'LIMITE_DE_TENTATIVAS', 'Tente novamente mais tarde.');
      verificacoes++;
      try {
        const conta = repository.porLogin(usuario);
        const valido = await verificarSenha(senha, conta?.senha_hash);
        if (!valido || !conta?.ativo) throw new HttpError(401, 'CREDENCIAIS_INVALIDAS', 'Credenciais inválidas.');
        const vigente = atual(conta);
        return { accessToken: await tokens.emitir(vigente), tokenType: 'Bearer',
          expiresIn: config.jwtTtlSeconds, usuario: publico(vigente) };
      } finally { verificacoes--; }
    },
    listarEventos(principal, service) {
      const usuario = atual(principal);
      return usuario.papel === 'ADMINISTRADOR' ? service.listarEventos() : repository.eventos(usuario.id);
    },
    me(principal) {
      const usuario = atual(principal);
      const eventos = new Map();
      if (usuario.papel !== 'ADMINISTRADOR') {
        for (const row of repository.permissoes(usuario.id)) {
          if (!eventos.has(row.evento_id)) eventos.set(row.evento_id, { eventoId: row.evento_id, portoesSincronizacao: [] });
          if (row.portao_id !== null) eventos.get(row.evento_id).portoesSincronizacao.push(row.portao_id);
        }
      }
      return { usuario: publico(usuario), acessoGlobal: usuario.papel === 'ADMINISTRADOR', eventos: [...eventos.values()] };
    },
    logout(principal) { repository.transacao(() => repository.revogar(atual(principal).id)); },
    registrar(principal, dispositivo) {
      return repository.transacao(() => {
        const usuario = atual(principal);
        const instalacao = repository.instalacao(dispositivo);
        if (instalacao) {
          if (!instalacao.ativo || instalacao.usuario_id !== usuario.id) throw negado();
        } else {
          if (repository.possuiRecibos(dispositivo)) throw negado();
          repository.registrar(dispositivo, usuario.id);
        }
        return { dispositivo };
      });
    },
    exigirSincronizacao(principal, lote) {
      const usuario = exigirEvento(principal, lote.eventoId);
      if (usuario.papel !== 'ADMINISTRADOR'
        && !repository.portaoPermitido(usuario.id, lote.eventoId, lote.portaoId)) throw negado();
      const instalacao = repository.instalacao(lote.dispositivo);
      if (!instalacao?.ativo || instalacao.usuario_id !== usuario.id) throw negado();
    },
  };
}
