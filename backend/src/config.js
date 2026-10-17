import { existsSync } from 'node:fs';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import { z } from 'zod';

export const backendDirectory = fileURLToPath(new URL('../', import.meta.url));

const localOrigins = 'http://localhost:5173,http://localhost:4173';

function isExactOrigin(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol)
      && url.origin === value
      && !value.includes('*');
  } catch {
    return false;
  }
}

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().refine((value) => isIP(value) !== 0).default('127.0.0.1'),
  PORT: z.string().regex(/^\d+$/).transform(Number)
    .pipe(z.number().int().min(1).max(65535)).default(3000),
  DATABASE_PATH: z.string().trim().min(1).default('./data/passcheck.sqlite'),
  JWT_SECRET: z.string().regex(/^[A-Za-z0-9_-]+$/).refine((value) => {
    const bytes = Buffer.from(value, 'base64url');
    return bytes.length >= 32 && bytes.length <= 64 && bytes.toString('base64url') === value;
  }),
  JWT_TTL_SECONDS: z.string().regex(/^\d+$/).transform(Number)
    .pipe(z.number().int().min(60).max(3600)).default(900),
  CORS_ORIGINS: z.string().transform((value) => value.split(',').map((origin) => origin.trim()))
    .pipe(z.array(z.string().refine(isExactOrigin)).min(1)).optional(),
}).superRefine((value, context) => {
  if (value.NODE_ENV === 'production' && !value.CORS_ORIGINS) {
    context.addIssue({ code: 'custom', path: ['CORS_ORIGINS'], message: 'Obrigatória em production.' });
  }
});

export class ConfigurationError extends Error {}

// Não inclui os valores recebidos na mensagem: podem conter dados sensíveis.
export function readConfig(environment = process.env) {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path[0]))];
    throw new ConfigurationError(`Configuração inválida. Verifique: ${fields.join(', ')}.`);
  }

  const values = result.data;
  return {
    nodeEnv: values.NODE_ENV,
    jwtSecret: values.JWT_SECRET,
    jwtTtlSeconds: values.JWT_TTL_SECONDS,
    host: values.HOST,
    port: values.PORT,
    databasePath: values.DATABASE_PATH === ':memory:'
      ? ':memory:' : resolve(backendDirectory, values.DATABASE_PATH),
    corsOrigins: [...new Set(values.CORS_ORIGINS ?? localOrigins.split(','))],
  };
}

export function loadConfig() {
  const envPath = resolve(backendDirectory, '.env');
  if (existsSync(envPath)) loadEnvFile(envPath);
  return readConfig();
}
