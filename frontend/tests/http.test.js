import assert from 'node:assert/strict';
import test from 'node:test';
import { criarClienteHttp, ErroApi } from '../src/http.js';

test('transporte envia Bearer somente à base configurada, sem cookies e sem redirects', async () => {
  const calls = [];
  const http = criarClienteHttp({ base: '/api', origem: 'https://passcheck.example', obterToken: () => 'teste-opaco',
    fetchImpl: async (...args) => { calls.push(args); return Response.json([]); } });
  assert.deepEqual(await http('/eventos'), []);
  const [url, options] = calls[0];
  assert.equal(url, 'https://passcheck.example/api/eventos');
  assert.equal(options.headers.Authorization, 'Bearer teste-opaco');
  assert.equal(options.headers['Content-Type'], undefined);
  assert.equal(options.credentials, 'omit');
  assert.equal(options.redirect, 'error');
  assert.equal(options.cache, 'no-store');
  for (const path of ['//evil.example', 'https://evil.example', '/../eventos', '/eventos?token=teste']) {
    await assert.rejects(http(path), /Caminho/);
  }
  assert.equal(calls.length, 1);
  for (const base of ['//evil.example', 'http://api.example', 'https://user:pass@api.example', 'https://api.example/?key=secret']) {
    assert.throws(() => criarClienteHttp({ base }), /Configure/);
  }
});

test('login é público; logout 204 não tenta ler JSON', async () => {
  let options;
  const http = criarClienteHttp({ fetchImpl: async (_url, value) => { options = value; return new Response(null, { status: 204 }); } });
  assert.equal(await http('/auth/login', { method: 'POST', autenticado: false, body: { usuario: 'teste', senha: 'valor-ficticio' } }), undefined);
  assert.equal(options.headers.Authorization, undefined);
  assert.equal(options.headers['Content-Type'], 'application/json');
  await assert.rejects(http('/eventos'), { status: 401 });
});

test('401 invalida sessão; 403/429/503 preservam categoria e não repetem requisição', async () => {
  for (const status of [401, 403, 429, 503]) {
    let calls = 0;
    let invalidated = 0;
    const http = criarClienteHttp({ obterToken: () => 'teste', aoNaoAutenticado: () => invalidated++,
      fetchImpl: async () => { calls++; return Response.json({ erro: 'CODIGO', mensagem: '<script>não renderizar</script>' }, { status, headers: { 'Retry-After': '10' } }); } });
    await assert.rejects(http('/eventos'), (error) => error instanceof ErroApi && error.status === status
      && error.retryAfter === '10' && !error.message.includes('<script>'));
    assert.equal(calls, 1);
    assert.equal(invalidated, status === 401 ? 1 : 0);
  }
});

test('timeout cancela a chamada; falha de rede e HTML inesperado são tratados', async () => {
  const http = criarClienteHttp({ timeoutMs: 10, fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('cancelado', 'AbortError')), { once: true });
  }) });
  await assert.rejects(http('/health', { autenticado: false }), /demorou/);
  const html = criarClienteHttp({ fetchImpl: async () => new Response('<html>proxy</html>') });
  await assert.rejects(html('/health', { autenticado: false }), { codigo: 'CONTRATO' });
  const rede = criarClienteHttp({ fetchImpl: async () => { throw new TypeError('network'); } });
  await assert.rejects(rede('/health', { autenticado: false }), { codigo: 'REDE' });
});
