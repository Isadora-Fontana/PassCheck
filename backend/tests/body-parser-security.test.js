import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { backendDirectory } from '../src/config.js';

const execute = promisify(execFile);

test('body-parser: gzip com bytes extras não encerra a API (GHSA-27r3-jxmh-p828)', async () => {
  // Processo descartável: uma regressão que cause uncaughtException deve falhar
  // este teste, sem derrubar o runner e sem usar o banco/porta da aplicação local.
  const script = `
    import assert from 'node:assert/strict';
    import { randomBytes } from 'node:crypto';
    import { gzipSync } from 'node:zlib';
    import { createServer, request } from 'node:http';
    import { setTimeout as delay } from 'node:timers/promises';
    import { createApp } from './src/app.js';
    import { readConfig } from './src/config.js';
    import { openDatabase } from './src/db/connection.js';
    const database = openDatabase(':memory:');
    const config = readConfig({ JWT_SECRET: randomBytes(32).toString('base64url') });
    const server = createServer(createApp({ config, database, logger: { error() {} } }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const send = (path, body) => new Promise((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port: server.address().port, path,
        method: body ? 'POST' : 'GET', headers: body ? {
          'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'Content-Length': body.length,
        } : {} }, res => {
          res.resume();
          res.on('end', () => resolve(res.statusCode));
          res.on('error', reject);
        });
      req.on('error', reject);
      req.end(body);
    });
    try {
      const compressed = gzipSync(Buffer.from('{}'));
      assert.equal(await send('/rota-inexistente', compressed), 404);
      const status = await send('/rota-inexistente', Buffer.concat([compressed, Buffer.from([255, 255])]));
      assert.ok(status >= 400 && status < 600);
      await delay(100);
      assert.equal(await send('/health'), 200);
      console.log('processo preservado');
    } finally {
      await new Promise(resolve => server.close(resolve));
      database.close();
    }
  `;
  const result = await execute(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: backendDirectory, timeout: 15000,
  });
  assert.equal(result.stdout.trim(), 'processo preservado');
});
