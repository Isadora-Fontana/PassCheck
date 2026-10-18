import { randomBytes } from 'node:crypto';
import supertest from 'supertest';
import { createApp as realCreateApp } from '../../src/app.js';
import { createTokens } from '../../src/services/tokens.js';
import { createIdentidadeRepository } from '../../src/repositories/identidade.js';
import { createIdentidadeService } from '../../src/services/identidade.js';
import { readConfig } from './config.js';

export const principal = { id: 1, versao_token: 0 };
export const fixtureToken = await createTokens(readConfig()).emitir(principal);
const hash = `scrypt$131072$8$1$${randomBytes(16).toString('base64url')}$${randomBytes(64).toString('base64url')}`;
const devices = ['971b6382-28ad-4f06-9d71-97ef1ada8df0', 'device-A', 'device-B', 'device-C',
  'resumo-device-A', 'resumo-device-B', 'resumo-http'];

// Identidade exclusiva dos bancos isolados de regressão; tokens passam pelo verificador real.
export function fixtureIdentity(database) {
  database.prepare("INSERT OR IGNORE INTO usuarios (id, usuario, senha_hash, papel) VALUES (1, 'regressao', ?, 'ADMINISTRADOR')").run(hash);
  for (const device of devices) database.prepare('INSERT OR IGNORE INTO instalacoes (dispositivo, usuario_id) VALUES (?, 1)').run(device);
  return createIdentidadeService(createIdentidadeRepository(database), createTokens(readConfig()), readConfig());
}

export function createApp(options) {
  fixtureIdentity(options.database);
  return realCreateApp(options);
}

export default function request(app) {
  const client = supertest(app);
  for (const method of ['get', 'post', 'options']) {
    const original = client[method].bind(client);
    client[method] = (...args) => original(...args).set('Authorization', `Bearer ${fixtureToken}`);
  }
  return client;
}
