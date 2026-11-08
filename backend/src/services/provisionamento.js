import { z } from 'zod';
import { credenciaisSchema } from '../validation/identidade.js';
import { hashSenha } from './senhas.js';
import { assertCurrentMigrations } from '../db/runtime.js';
import { createProvisionamentoRepository } from '../repositories/provisionamento.js';

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const operadorSchema = credenciaisSchema.extend({
  eventos: z.array(z.object({ eventoId: id, portoes: z.array(id).max(1000)
    .refine((items) => new Set(items).size === items.length) }).strict()).max(1000)
    .refine((items) => new Set(items.map((item) => item.eventoId)).size === items.length),
}).strict();

export async function provisionar(database, comando, body) {
  if (!['bootstrap', 'criar-operador'].includes(comando)) throw new Error('Comando inválido.');
  await assertCurrentMigrations(database);
  const dados = (comando === 'bootstrap' ? credenciaisSchema : operadorSchema).parse(body);
  const hash = await hashSenha(dados.senha);
  const repository = createProvisionamentoRepository(database);
  return repository.transacao(async () => {
    const admin = await repository.adminExiste();
    if ((comando === 'bootstrap' && admin) || (comando === 'criar-operador' && !admin)) {
      throw new Error('Estado administrativo incompatível com o comando.');
    }
    const papel = comando === 'bootstrap' ? 'ADMINISTRADOR' : 'OPERADOR';
    const userId = await repository.inserirUsuario(dados.usuario, hash, papel);
    for (const evento of dados.eventos ?? []) {
      await repository.concederEvento(userId, evento.eventoId);
      for (const portao of evento.portoes) {
        await repository.concederPortao(userId, evento.eventoId, portao);
      }
    }
    return { id: userId, usuario: dados.usuario, papel };
  });
}
