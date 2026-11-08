import { z } from 'zod';

export const credenciaisSchema = z.object({
  usuario: z.string().trim().toLowerCase().min(3).max(64).regex(/^[a-z0-9][a-z0-9._-]*$/),
  senha: z.string().min(8).max(14)
    .regex(/\p{Lu}/u, 'A senha precisa de uma letra maiúscula.')
    .regex(/[\p{P}\p{S}]/u, 'A senha precisa de um caractere especial.'),
}).strict();

export const dispositivoSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/)
  .refine((value) => value === value.trim() && !value.startsWith('seed:'));
