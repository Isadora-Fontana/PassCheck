import { HttpError } from '../middleware/errors.js';
import { naoAutenticado } from './tokens.js';
import { verificarSenha } from './senhas.js';

const publico = ({ id, usuario, papel }) => ({ id, usuario, papel });
const negado = () => new HttpError(403, 'ACESSO_NEGADO', 'Acesso não permitido.');

export function createIdentidadeService(repository, tokens, config) {
  let verificacoes = 0;
  async function atual(principal) {
    if (!principal) throw naoAutenticado();
    const usuario = await repository.porId(principal.id);
    if (!usuario?.ativo || usuario.versao_token !== principal.versao_token) throw naoAutenticado();
    return usuario;
  }
  async function exigirEvento(principal, eventoId) {
    const usuario = await atual(principal);
    if (usuario.papel !== 'ADMINISTRADOR' && !(await repository.eventoPermitido(usuario.id, eventoId))) throw negado();
    return usuario;
  }
  return {
    atual, exigirEvento,
    leitura: (fn) => repository.leitura(fn),
    async exigirAdministrador(principal) {
      const usuario = await atual(principal);
      if (usuario.papel !== 'ADMINISTRADOR') throw negado();
      return usuario;
    },
    async autenticar(authorization) { return atual(await tokens.verificar(authorization)); },
    async login({ usuario, senha }) {
      if (verificacoes >= 2) throw new HttpError(429, 'LIMITE_DE_TENTATIVAS', 'Tente novamente mais tarde.');
      verificacoes++;
      try {
        const conta = await repository.porLogin(usuario);
        const valido = await verificarSenha(senha, conta?.senha_hash);
        if (!valido || !conta?.ativo) throw new HttpError(401, 'CREDENCIAIS_INVALIDAS', 'Credenciais inválidas.');
        const vigente = await atual(conta);
        return { accessToken: await tokens.emitir(vigente), tokenType: 'Bearer',
          expiresIn: config.jwtTtlSeconds, usuario: publico(vigente) };
      } finally { verificacoes--; }
    },
    async listarEventos(principal, service) {
      return repository.leitura(async () => {
        const usuario = await atual(principal);
        return usuario.papel === 'ADMINISTRADOR' ? service.listarEventos() : repository.eventos(usuario.id);
      });
    },
    async me(principal) {
      return repository.leitura(async () => {
        const usuario = await atual(principal);
        const eventos = new Map();
        if (usuario.papel !== 'ADMINISTRADOR') {
          for (const row of await repository.permissoes(usuario.id)) {
            if (!eventos.has(row.evento_id)) eventos.set(row.evento_id, { eventoId: row.evento_id, portoesSincronizacao: [] });
            if (row.portao_id !== null) eventos.get(row.evento_id).portoesSincronizacao.push(row.portao_id);
          }
        }
        return { usuario: publico(usuario), acessoGlobal: usuario.papel === 'ADMINISTRADOR', eventos: [...eventos.values()] };
      });
    },
    async logout(principal) { return repository.transacao(async () => repository.revogar((await atual(principal)).id)); },
    async registrar(principal, dispositivo) {
      return repository.transacao(async () => {
        const usuario = await atual(principal);
        const instalacao = await repository.instalacao(dispositivo);
        if (instalacao) {
          if (!instalacao.ativo || instalacao.usuario_id !== usuario.id) throw negado();
        } else {
          if (await repository.possuiRecibos(dispositivo)) throw negado();
          await repository.registrar(dispositivo, usuario.id);
        }
        return { dispositivo };
      });
    },
    async exigirSincronizacao(principal, lote) {
      const usuario = await exigirEvento(principal, lote.eventoId);
      if (usuario.papel !== 'ADMINISTRADOR'
        && !(await repository.portaoPermitido(usuario.id, lote.eventoId, lote.portaoId))) throw negado();
      const instalacao = await repository.instalacao(lote.dispositivo);
      if (!instalacao?.ativo || instalacao.usuario_id !== usuario.id) throw negado();
    },
  };
}
