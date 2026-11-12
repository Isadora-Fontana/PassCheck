import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createTokens } from '../src/services/tokens.js';
import { fixtureIdentity, fixtureToken } from './helpers/auth.js';
import { readConfig } from './helpers/config.js';
import { memoryDatabase, snapshot } from './helpers/database.js';

const config = readConfig();
const tokens = createTokens(config);
const operadorComAcessoToken = await tokens.emitir({ id: 2, versao_token: 0 });
const operadorNovoToken = await tokens.emitir({ id: 4, versao_token: 0 });

// Usuários: 1 admin (fixture), 2 operador já liberado no evento 1/portão 1,
// 3 segundo admin, 4 operador sem nenhuma concessão, 5 operador inativo.
function setup(t) {
  const database = memoryDatabase(t);
  fixtureIdentity(database);
  database.exec(`INSERT INTO usuarios (id, usuario, senha_hash, papel)
      SELECT 2, 'operador-liberado', senha_hash, 'OPERADOR' FROM usuarios WHERE id=1;
    INSERT INTO usuarios (id, usuario, senha_hash, papel)
      SELECT 3, 'segundo-admin', senha_hash, 'ADMINISTRADOR' FROM usuarios WHERE id=1;
    INSERT INTO usuarios (id, usuario, senha_hash, papel)
      SELECT 4, 'operador-novo', senha_hash, 'OPERADOR' FROM usuarios WHERE id=1;
    INSERT INTO usuarios (id, usuario, senha_hash, papel, ativo)
      SELECT 5, 'operador-inativo', senha_hash, 'OPERADOR', 0 FROM usuarios WHERE id=1;
    INSERT INTO usuarios_eventos VALUES (2, 1);
    INSERT INTO usuarios_portoes VALUES (2, 1, 1)`);
  const app = createApp({ config, database, logger: { error() {} } });
  const call = (method, path, token = fixtureToken) => request(app)[method](path).set('Authorization', `Bearer ${token}`);
  const conceder = (eventoId, body, token) => call('post', `/eventos/${eventoId}/operadores`, token).send(body);
  const concessoes = () => ({
    eventos: database.prepare('SELECT usuario_id, evento_id FROM usuarios_eventos ORDER BY 1, 2').all(),
    portoes: database.prepare('SELECT usuario_id, evento_id, portao_id FROM usuarios_portoes ORDER BY 1, 2, 3').all(),
  });
  return { database, app, call, conceder, concessoes };
}

test('concessão: nega anônimo e operador antes de ler o corpo', async (t) => {
  const { app, conceder, concessoes } = setup(t);
  const antes = concessoes();
  await request(app).post('/eventos/1/operadores').set('Content-Type', 'application/json').send('{invalido').expect(401);
  await conceder(1, { usuarioId: 4, portaoId: 2 }, operadorComAcessoToken).expect(403);
  assert.deepEqual(concessoes(), antes);
});

test('concessão: aprova operador sem acesso, que passa a ver e baixar o evento no portão concedido', async (t) => {
  const { call, conceder, concessoes } = setup(t);
  await call('get', '/eventos/1/portoes/2/ingressos', operadorNovoToken).expect(403);

  const resposta = await conceder(1, { usuarioId: 4, portaoId: 2 }).expect(200);
  assert.deepEqual(resposta.body, { usuarioId: 4, eventoId: 1, portaoId: 2 });
  assert.deepEqual(concessoes().portoes.filter((c) => c.usuario_id === 4), [{ usuario_id: 4, evento_id: 1, portao_id: 2 }]);

  const me = await call('get', '/auth/me', operadorNovoToken).expect(200);
  assert.deepEqual(me.body.eventos, [{ eventoId: 1, portoesSincronizacao: [2] }]);
  const eventos = await call('get', '/eventos', operadorNovoToken).expect(200);
  assert.deepEqual(eventos.body.map((e) => e.id), [1]);
  // Lê todos os portões do evento (para PORTÃO INCORRETO offline), como os demais operadores.
  await call('get', '/eventos/1/portoes/2/ingressos', operadorNovoToken).expect(200);
  await call('get', '/eventos/1/portoes/1/ingressos', operadorNovoToken).expect(200);
  // Outro evento continua negado.
  await call('get', '/eventos/2/portoes/4/ingressos', operadorNovoToken).expect(403);
});

test('concessão: operador aprovado sincroniza no portão concedido e não no antigo após alteração', async (t) => {
  const { database, call, conceder } = setup(t);
  await conceder(1, { usuarioId: 4, portaoId: 2 }).expect(200);
  await call('post', '/auth/instalacoes', operadorNovoToken).send({ dispositivo: 'aparelho-operador-novo' }).expect(200);
  const lote = (portaoId, ingressoId, idLocal) => ({ eventoId: 1, portaoId, dispositivo: 'aparelho-operador-novo',
    validacoes: [{ idLocal, ingressoId, codigo: database.prepare('SELECT codigo FROM ingressos WHERE id=?').get(ingressoId).codigo,
      dataHora: '2026-11-20T22:00:00.000Z' }] });
  const confirmada = await call('post', '/sincronizacao', operadorNovoToken).send(lote(2, 6, '1')).expect(200);
  assert.equal(confirmada.body.resultados[0].status, 'CONFIRMADA');

  // Gestor altera o portão para o 3: o 2 deixa de ser permitido, o 3 passa a ser.
  await conceder(1, { usuarioId: 4, portaoId: 3 }).expect(200);
  await call('post', '/sincronizacao', operadorNovoToken).send(lote(2, 7, '2')).expect(403);
  const novoPortao = await call('post', '/sincronizacao', operadorNovoToken).send(lote(3, 10, '3')).expect(200);
  assert.equal(novoPortao.body.resultados[0].status, 'CONFIRMADA');
});

test('concessão: alterar portão substitui o anterior e repetir é idempotente', async (t) => {
  const { conceder, concessoes } = setup(t);
  await conceder(1, { usuarioId: 2, portaoId: 3 }).expect(200);
  await conceder(1, { usuarioId: 2, portaoId: 3 }).expect(200);
  assert.deepEqual(concessoes(), {
    eventos: [{ usuario_id: 2, evento_id: 1 }],
    portoes: [{ usuario_id: 2, evento_id: 1, portao_id: 3 }],
  });
  // Concessões em eventos diferentes são independentes.
  await conceder(2, { usuarioId: 2, portaoId: 5 }).expect(200);
  assert.deepEqual(concessoes().portoes, [
    { usuario_id: 2, evento_id: 1, portao_id: 3 },
    { usuario_id: 2, evento_id: 2, portao_id: 5 },
  ]);
});

test('concessão: recusa evento, operador ou portão inválidos sem gravar nada', async (t) => {
  const { database, conceder, concessoes } = setup(t);
  const antes = { concessoes: concessoes(), dados: snapshot(database) };
  const casos = [
    [999, { usuarioId: 4, portaoId: 2 }, 404, 'EVENTO_NAO_ENCONTRADO'],
    [1, { usuarioId: 999, portaoId: 2 }, 404, 'OPERADOR_NAO_ENCONTRADO'],
    [1, { usuarioId: 3, portaoId: 2 }, 404, 'OPERADOR_NAO_ENCONTRADO'], // administrador não é operador
    [1, { usuarioId: 5, portaoId: 2 }, 404, 'OPERADOR_NAO_ENCONTRADO'], // inativo
    [1, { usuarioId: 4, portaoId: 4 }, 422, 'PORTAO_INCOMPATIVEL'], // portão do evento 2
    [1, { usuarioId: 4, portaoId: 999 }, 422, 'PORTAO_INCOMPATIVEL'],
    [1, { usuarioId: '4', portaoId: 2 }, 400, 'DADOS_INVALIDOS'],
    [1, { usuarioId: 4 }, 400, 'DADOS_INVALIDOS'],
    [1, { usuarioId: 4, portaoId: 2, extra: true }, 400, 'DADOS_INVALIDOS'],
    [1, { usuarioId: 0, portaoId: 2 }, 400, 'DADOS_INVALIDOS'],
  ];
  for (const [eventoId, body, status, erro] of casos) {
    const resposta = await conceder(eventoId, body).expect(status);
    assert.equal(resposta.body.erro, erro, JSON.stringify(body));
  }
  assert.deepEqual({ concessoes: concessoes(), dados: snapshot(database) }, antes);
});
