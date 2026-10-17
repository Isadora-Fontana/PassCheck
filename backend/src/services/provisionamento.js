import { z } from 'zod';
import { credenciaisSchema } from '../validation/identidade.js';
import { hashSenha } from './senhas.js';
import { assertMigrationsCurrent } from '../db/migrate.js';

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const operadorSchema = credenciaisSchema.extend({
  eventos: z.array(z.object({ eventoId: id, portoes: z.array(id).max(1000)
    .refine((items) => new Set(items).size === items.length) }).strict()).max(1000)
    .refine((items) => new Set(items.map((item) => item.eventoId)).size === items.length),
}).strict();

export async function provisionar(database, comando, body) {
  if (!['bootstrap', 'criar-operador'].includes(comando)) throw new Error('Comando inválido.');
  assertMigrationsCurrent(database);
  const dados = (comando === 'bootstrap' ? credenciaisSchema : operadorSchema).parse(body);
  const hash = await hashSenha(dados.senha);
  return database.transaction(() => {
    const admin = database.prepare("SELECT 1 FROM usuarios WHERE papel = 'ADMINISTRADOR' LIMIT 1").get();
    if ((comando === 'bootstrap' && admin) || (comando === 'criar-operador' && !admin)) {
      throw new Error('Estado administrativo incompatível com o comando.');
    }
    const papel = comando === 'bootstrap' ? 'ADMINISTRADOR' : 'OPERADOR';
    const result = database.prepare('INSERT INTO usuarios (usuario, senha_hash, papel) VALUES (?, ?, ?)')
      .run(dados.usuario, hash, papel);
    for (const evento of dados.eventos ?? []) {
      database.prepare('INSERT INTO usuarios_eventos (usuario_id, evento_id) VALUES (?, ?)')
        .run(result.lastInsertRowid, evento.eventoId);
      for (const portao of evento.portoes) {
        database.prepare('INSERT INTO usuarios_portoes (usuario_id, evento_id, portao_id) VALUES (?, ?, ?)')
          .run(result.lastInsertRowid, evento.eventoId, portao);
      }
    }
    return { id: result.lastInsertRowid, usuario: dados.usuario, papel };
  }).immediate();
}
