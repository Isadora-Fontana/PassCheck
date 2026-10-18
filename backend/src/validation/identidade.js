import { z } from 'zod';

export const credenciaisSchema = z.object({
  usuario: z.string().trim().toLowerCase().min(3).max(64).regex(/^[a-z0-9][a-z0-9._-]*$/),
  senha: z.string().min(12).max(128).refine((value) => Buffer.byteLength(value, 'utf8') <= 512),
}).strict();

export const dispositivoSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/)
  .refine((value) => value === value.trim() && !value.startsWith('seed:'));
