export function createIdentidadeRepository(database) {
  return {
    transacao: (fn) => database.transaction(fn).immediate(),
    porLogin: (usuario) => database.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(usuario),
    porId: (id) => database.prepare('SELECT * FROM usuarios WHERE id = ?').get(id),
    eventoPermitido: (id, evento) => Boolean(database.prepare(
      'SELECT 1 FROM usuarios_eventos WHERE usuario_id = ? AND evento_id = ?').get(id, evento)),
    portaoPermitido: (id, evento, portao) => Boolean(database.prepare(
      'SELECT 1 FROM usuarios_portoes WHERE usuario_id = ? AND evento_id = ? AND portao_id = ?').get(id, evento, portao)),
    eventos: (id) => database.prepare(`SELECT e.id, e.nome, e.data, e.local FROM eventos e
      JOIN usuarios_eventos ue ON ue.evento_id = e.id WHERE ue.usuario_id = ? ORDER BY e.id`).all(id),
    permissoes: (id) => database.prepare(`SELECT ue.evento_id, up.portao_id FROM usuarios_eventos ue
      LEFT JOIN usuarios_portoes up ON up.usuario_id = ue.usuario_id AND up.evento_id = ue.evento_id
      WHERE ue.usuario_id = ? ORDER BY ue.evento_id, up.portao_id`).all(id),
    instalacao: (dispositivo) => database.prepare('SELECT * FROM instalacoes WHERE dispositivo = ?').get(dispositivo),
    possuiRecibos: (dispositivo) => Boolean(database.prepare('SELECT 1 FROM recebimentos WHERE dispositivo = ? LIMIT 1').get(dispositivo)),
    registrar: (dispositivo, id) => database.prepare('INSERT INTO instalacoes (dispositivo, usuario_id) VALUES (?, ?)').run(dispositivo, id),
    revogar: (id) => database.prepare('UPDATE usuarios SET versao_token = versao_token + 1 WHERE id = ?').run(id),
  };
}
