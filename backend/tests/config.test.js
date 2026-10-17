import assert from 'node:assert/strict';
import test from 'node:test';
import { readConfig } from './helpers/config.js';
import { resolve } from 'node:path';
import { backendDirectory, ConfigurationError } from '../src/config.js';

test('configuração local tem padrões restritos e caminho relativo ao backend', () => {
  const config = readConfig({});
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 3000);
  assert.equal(config.databasePath, resolve(backendDirectory, 'data/passcheck.sqlite'));
  assert.deepEqual(config.corsOrigins, ['http://localhost:5173', 'http://localhost:4173']);
});

test('converte porta e normaliza lista de origens exatas', () => {
  const config = readConfig({
    PORT: '3100', DATABASE_PATH: ':memory:',
    CORS_ORIGINS: 'https://app.example.com, http://localhost:5173,https://app.example.com',
  });
  assert.equal(config.port, 3100);
  assert.equal(config.databasePath, ':memory:');
  assert.deepEqual(config.corsOrigins, ['https://app.example.com', 'http://localhost:5173']);
});

test('rejeita configuração inválida sem revelar valores recebidos', () => {
  const cases = [
    { PORT: '0' }, { PORT: '65536' }, { PORT: '3000abc' }, { PORT: '' },
    { NODE_ENV: 'invalid' }, { HOST: '*' }, { DATABASE_PATH: ' ' },
    { CORS_ORIGINS: '*' }, { CORS_ORIGINS: '' }, { CORS_ORIGINS: 'null' },
    { CORS_ORIGINS: 'https://*.example.com' }, { CORS_ORIGINS: 'https://example.com/' },
    { CORS_ORIGINS: 'https://example.com/path' }, { CORS_ORIGINS: 'http://example.com,' },
    { CORS_ORIGINS: 'https://user:test-secret@example.com' },
    { CORS_ORIGINS: 'file:///tmp' },
  ];
  for (const environment of cases) {
    assert.throws(() => readConfig(environment), (error) => {
      assert(error instanceof ConfigurationError);
      assert(error.message.includes(Object.keys(environment)[0]));
      assert(!error.message.includes('test-secret'));
      return true;
    });
  }
});

test('produção exige lista explícita de origens', () => {
  assert.throws(() => readConfig({ NODE_ENV: 'production' }), /CORS_ORIGINS/);
  const config = readConfig({ NODE_ENV: 'production', CORS_ORIGINS: 'https://app.example.com' });
  assert.deepEqual(config.corsOrigins, ['https://app.example.com']);
});
