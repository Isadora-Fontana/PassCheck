import { z } from 'zod';

const texto = (max, min = 1) => z.string().trim().min(min).max(max)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value));
export const idSchema = z.string().regex(/^[0-9]+$/).refine((value) => value === value.trim())
  .transform(Number).pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));
export const eventoParams = z.object({ eventoId: idSchema });
export const recebimentoParams = z.object({ recebimentoId: idSchema });
export const eventoSchema = z.object({
  nome: texto(200),
  data: z.string().regex(/^(?!0000)[0-9]{4}-[0-9]{2}-[0-9]{2}$/).refine((value) => {
    const time = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
  }),
  local: texto(300),
}).strict();
export const atualizarEventoSchema = eventoSchema.partial().refine((value) => Object.keys(value).length > 0);
export const portaoSchema = z.object({ nome: texto(200) }).strict();
export const resolucaoSchema = z.object({ justificativa: texto(1000, 10) }).strict();
const cursor = z.string().regex(/^(0|[1-9][0-9]*)$/).transform(Number)
  .pipe(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER));
export const pendenciasQuery = z.object({
  estado: z.enum(['PENDENTE', 'RESOLVIDA', 'TODAS']).default('PENDENTE'),
  apos: cursor.default(0),
  limite: z.string().regex(/^[1-9][0-9]*$/).transform(Number).pipe(z.number().int().min(1).max(100)).default(50),
}).strict();
export const codigoSchema = z.string().min(1).max(128)
  .refine((value) => value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value));
export const csvIdSchema = z.string().regex(/^[1-9][0-9]*$/).transform(Number)
  .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));
