import { databaseAccess, protectSqliteRepository } from '../db/access.js';

export function createProvisionamentoRepository(database) {
  const access = databaseAccess(database);
  if (database.dialect === 'postgres') {
    return {
      transacao: (fn) => access.transaction(fn),
      adminExiste: async () => (await access.query("SELECT 1 FROM usuarios WHERE papel = 'ADMINISTRADOR' LIMIT 1")).rows.length > 0,
      loginExiste: async (usuario) => (await access.query('SELECT 1 FROM usuarios WHERE usuario = $1', [usuario])).rows.length > 0,
      inserirUsuario: async (usuario, hash, papel) => (await access.query(
        'INSERT INTO usuarios(usuario,senha_hash,papel) VALUES ($1,$2,$3) RETURNING id', [usuario, hash, papel])).rows[0].id,
      concederEvento: (id, evento) => access.query('INSERT INTO usuarios_eventos(usuario_id,evento_id) VALUES ($1,$2)', [id, evento]),
      concederPortao: (id, evento, portao) => access.query('INSERT INTO usuarios_portoes(usuario_id,evento_id,portao_id) VALUES ($1,$2,$3)', [id, evento, portao]),
    };
  }
  return protectSqliteRepository(database, {
    transacao: (fn) => access.transaction(fn),
    adminExiste: () => Boolean(database.prepare("SELECT 1 FROM usuarios WHERE papel = 'ADMINISTRADOR' LIMIT 1").get()),
    loginExiste: (usuario) => Boolean(database.prepare('SELECT 1 FROM usuarios WHERE usuario = ?').get(usuario)),
    inserirUsuario: (usuario, hash, papel) => database.prepare('INSERT INTO usuarios(usuario,senha_hash,papel) VALUES (?,?,?)').run(usuario, hash, papel).lastInsertRowid,
    concederEvento: (id, evento) => database.prepare('INSERT INTO usuarios_eventos(usuario_id,evento_id) VALUES (?,?)').run(id, evento),
    concederPortao: (id, evento, portao) => database.prepare('INSERT INTO usuarios_portoes(usuario_id,evento_id,portao_id) VALUES (?,?,?)').run(id, evento, portao),
  });
}
