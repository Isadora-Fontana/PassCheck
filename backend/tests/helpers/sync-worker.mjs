import { startServer } from '../../src/server.js';
import { readConfig } from './config.js';
import { fixtureIdentity, fixtureToken } from './auth.js';
import { openDatabase } from '../../src/db/connection.js';

const [mode, databasePath] = process.argv.slice(2);
if (mode === 'api') {
  const running = await startServer({ ...readConfig({ NODE_ENV: 'test', DATABASE_PATH: databasePath }), port: 0 });
  fixtureIdentity(running.database);
  process.on('message', async (command) => {
    if (command === 'close') {
      await running.close();
      process.disconnect();
    }
  });
  process.send({ type: 'ready', token: fixtureToken, pid: process.pid, url: `http://127.0.0.1:${running.server.address().port}` });
} else if (mode === 'lock') {
  const database = openDatabase(databasePath);
  process.on('message', (command) => {
    if (command === 'lock') {
      database.exec('BEGIN IMMEDIATE');
      process.send({ type: 'locked' });
    } else if (command === 'release') {
      database.exec('ROLLBACK');
      process.send({ type: 'released' });
    } else if (command === 'close') {
      if (database.inTransaction) database.exec('ROLLBACK');
      database.close();
      process.disconnect();
    }
  });
  process.send({ type: 'ready', pid: process.pid });
}
