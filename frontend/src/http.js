// Transporte único da API. Nunca persiste credenciais nem repete escritas.
export class ErroApi extends Error {
  constructor(mensagem, { status = 0, codigo = 'REDE', retryAfter = null } = {}) {
    super(mensagem);
    this.name = 'ErroApi';
    Object.assign(this, { status, codigo, retryAfter });
  }
}

export function criarClienteHttp({ base = '/api', origem = globalThis.location?.origin ?? 'http://localhost',
  fetchImpl = globalThis.fetch, obterToken = () => null, aoNaoAutenticado = () => {}, timeoutMs = 15000 } = {}) {
  const urlBase = new URL(base, origem);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(urlBase.hostname);
  if ((!base.startsWith('/') && !/^https?:\/\//.test(base)) || base.startsWith('//')
    || urlBase.username || urlBase.password || urlBase.search || urlBase.hash
    || !(urlBase.protocol === 'https:' || (urlBase.protocol === 'http:' && local))) {
    throw new Error('Configure VITE_API_URL com /api ou uma URL HTTPS da API.');
  }
  const prefixo = urlBase.pathname.replace(/\/$/, '');
  // tipoConteudo: envia o corpo como texto já pronto (ex.: CSV); sem ele, o corpo é JSON.
  return async function requisitar(caminho, { method = 'GET', body, autenticado = true, signal, token: tokenExplicito, tipoConteudo } = {}) {
    if (!/^\/[a-zA-Z0-9/_-]*$/.test(caminho) || caminho.startsWith('//')) throw new Error('Caminho de API inválido.');
    if (tipoConteudo !== undefined && typeof body !== 'string') throw new Error('Corpo em texto inválido.');
    const token = tokenExplicito ?? (autenticado ? obterToken() : null);
    if (autenticado && !token) throw new ErroApi('Entre novamente para acessar o servidor.', { status: 401, codigo: 'SESSAO' });
    const controller = new AbortController();
    const cancelar = () => controller.abort();
    signal?.addEventListener('abort', cancelar, { once: true });
    if (signal?.aborted) controller.abort();
    const timer = setTimeout(cancelar, timeoutMs);
    try {
      const response = await fetchImpl(urlBase.origin + prefixo + caminho, {
        method, signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error',
        headers: { Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': tipoConteudo ?? 'application/json' } : {}),
          ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        ...(body !== undefined ? { body: tipoConteudo !== undefined ? body : JSON.stringify(body) } : {}),
      });
      if (response.status === 401 && autenticado) aoNaoAutenticado(token);
      let data;
      if (response.status !== 204) {
        try { data = await response.json(); } catch {
          throw new ErroApi('Resposta inesperada do servidor.', { status: response.status, codigo: 'CONTRATO' });
        }
      }
      if (!response.ok) {
        const mensagens = {
          401: autenticado ? 'Sua sessão expirou. Entre novamente.' : 'Usuário ou senha inválidos.',
          403: 'Você não tem permissão para esta operação.',
          429: 'Muitas tentativas. Aguarde antes de tentar novamente.',
          503: 'Servidor indisponível. Tente novamente em instantes.',
        };
        throw new ErroApi(mensagens[response.status] ?? 'Não foi possível concluir a solicitação.', {
          status: response.status, codigo: typeof data?.erro === 'string' ? data.erro : 'HTTP',
          retryAfter: response.headers.get('Retry-After'),
        });
      }
      return data;
    } catch (error) {
      if (error instanceof ErroApi || signal?.aborted) throw error;
      throw new ErroApi(controller.signal.aborted ? 'O servidor demorou para responder. Tente novamente.'
        : 'Não foi possível conectar ao servidor. Confira sua conexão.');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancelar);
    }
  };
}
