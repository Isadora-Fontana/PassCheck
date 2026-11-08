import assert from 'node:assert/strict';
import test from 'node:test';
import { criarSessao } from '../src/sessao.js';

const me = { usuario: { id: 1, usuario: 'teste', papel: 'OPERADOR' }, acessoGlobal: false,
  eventos: [{ eventoId: 1, portoesSincronizacao: [1] }] };
const login = { accessToken: 'token-ficticio', tokenType: 'Bearer', expiresIn: 900 };
test('sessão só é publicada após /me e validação do proprietário local', async () => {
  const calls = [];
  const session = criarSessao({ fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/login')) return Response.json(login);
    if (url.endsWith('/logout')) return new Response(null, { status: 204 });
    return Response.json(me);
  } });
  let verificado = false;
  await session.entrar('teste', 'senha-ficticia', { verificarUsuario: async (id) => {
    assert.equal(id, 1); assert.equal(session.obterIdentidade(), null); verificado = true;
  } });
  assert(verificado);
  assert.deepEqual(session.obterIdentidade(), me);
  const copia = session.obterIdentidade(); copia.eventos[0].portoesSincronizacao.push(99);
  assert.deepEqual(session.obterIdentidade(), me);
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(calls[1].options.headers.Authorization, 'Bearer token-ficticio');
  await session.sair();
  assert.equal(session.obterIdentidade(), null);
  await assert.rejects(session.requisitar('/eventos'), { status: 401 });
});

test('identidade inválida e pendências de outro usuário impedem publicar sessão', async () => {
  for (const invalid of [false, true]) {
    const session = criarSessao({ fetchImpl: async (url) => Response.json(url.endsWith('/login') ? login :
      invalid ? { ...me, acessoGlobal: true } : me) });
    await assert.rejects(session.entrar('teste', 'senha-ficticia', { verificarUsuario: async () => { throw new Error('Pendências de outro usuário'); } }));
    assert.equal(session.obterIdentidade(), null);
    await assert.rejects(session.requisitar('/eventos'), { status: 401 });
  }
});

test('login cancelado e logout com falha de rede não conservam credenciais', async () => {
  const controller = new AbortController();
  const session = criarSessao({ fetchImpl: async (url) => {
    if (url.endsWith('/logout')) throw new TypeError('offline');
    return Response.json(url.endsWith('/login') ? login : me);
  } });
  await assert.rejects(session.entrar('teste', 'senha-ficticia', { signal: controller.signal,
    verificarUsuario: async () => controller.abort() }));
  assert.equal(session.obterIdentidade(), null);
  await session.entrar('teste', 'senha-ficticia');
  await assert.rejects(session.sair(), /conectar/);
  assert.equal(session.obterIdentidade(), null);
});

test('atualização de identidade observa concessões revogadas no servidor', async () => {
  let atual = me;
  const session = criarSessao({ fetchImpl: async (url) => Response.json(url.endsWith('/login') ? login : atual) });
  await session.entrar('teste', 'senha-ficticia');
  atual = { ...me, eventos: [{ eventoId: 1, portoesSincronizacao: [] }] };
  await session.atualizarIdentidade();
  assert.deepEqual(session.obterIdentidade().eventos[0].portoesSincronizacao, []);
});
