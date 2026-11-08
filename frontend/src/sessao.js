import { criarClienteHttp, ErroApi } from './http.js';

export const PAPEIS = { ADMINISTRADOR: 'ADMINISTRADOR', OPERADOR: 'OPERADOR' };
const idValido = (id) => Number.isSafeInteger(id) && id > 0;
export function validarIdentidade(data) {
  if (!idValido(data?.usuario?.id) || typeof data.usuario.usuario !== 'string'
    || !Object.values(PAPEIS).includes(data.usuario.papel)
    || data.acessoGlobal !== (data.usuario.papel === PAPEIS.ADMINISTRADOR)
    || !Array.isArray(data.eventos) || data.eventos.some((item) => !idValido(item.eventoId)
      || !Array.isArray(item.portoesSincronizacao) || item.portoesSincronizacao.some((id) => !idValido(id)))) {
    throw new ErroApi('Identidade inválida recebida do servidor.', { codigo: 'CONTRATO' });
  }
  return data;
}
export function criarSessao(opcoes = {}) {
  let token = null;
  let identidade = null;
  let geracao = 0;
  const requisitar = criarClienteHttp({ ...opcoes, obterToken: () => token,
    aoNaoAutenticado: (enviado) => { if (token === enviado) { token = null; identidade = null; } } });
  return {
    requisitar,
    obterIdentidade: () => identidade ? structuredClone(identidade) : null,
    async atualizarIdentidade({ signal } = {}) {
      const enviado = token;
      const me = validarIdentidade(await requisitar('/auth/me', { signal }));
      if (token !== enviado || signal?.aborted) throw new Error('A sessão mudou. Entre novamente.');
      identidade = me;
      return structuredClone(me);
    },
    async entrar(usuario, senha, { signal, verificarUsuario = async () => {} } = {}) {
      const tentativa = ++geracao;
      token = null;
      identidade = null;
      const login = await requisitar('/auth/login', { method: 'POST', body: { usuario, senha }, autenticado: false, signal });
      if (typeof login?.accessToken !== 'string' || !login.accessToken || login.tokenType !== 'Bearer'
        || !Number.isInteger(login.expiresIn) || login.expiresIn <= 0) {
        throw new ErroApi('Resposta de login inválida.', { codigo: 'CONTRATO' });
      }
      const me = validarIdentidade(await requisitar('/auth/me', { token: login.accessToken, signal }));
      await verificarUsuario(me.usuario.id);
      if (tentativa !== geracao || signal?.aborted) throw new Error('Login cancelado.');
      token = login.accessToken;
      identidade = me;
      return structuredClone(me);
    },
    async sair() {
      geracao++;
      try { if (token) await requisitar('/auth/logout', { method: 'POST' }); }
      finally { token = null; identidade = null; }
    },
  };
}
export const sessao = criarSessao({ base: import.meta.env?.VITE_API_URL || '/api' });
export const requisitar = (...args) => sessao.requisitar(...args);
export const obterIdentidade = () => sessao.obterIdentidade();
export function podeOperar(eventoId, portaoId) {
  const me = obterIdentidade();
  return Boolean(me && (me.acessoGlobal || me.eventos.some((evento) => evento.eventoId === eventoId
    && evento.portoesSincronizacao.includes(portaoId))));
}
