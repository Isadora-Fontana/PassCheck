import { writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

try {
  const origin = process.argv[2] || 'http://localhost:3000';
  const url = new URL(origin);
  if (url.origin !== origin || url.username || url.password
    || !(origin === 'http://localhost:3000' || (url.protocol === 'https:' && !url.port))) {
    throw new Error('Origem inválida.');
  }
  writeFileSync(new URL('../.env', import.meta.url), [
    'JWT_SECRET=' + randomBytes(32).toString('base64url'),
    'JWT_TTL_SECONDS=900', 'PUBLIC_ORIGIN=' + origin,
    'DOMAIN=' + url.hostname, '',
  ].join('\n'), { flag: 'wx', mode: 0o600 });
  console.log('.env do Docker criado com segredo aleatório privado. Origem:', origin);
} catch {
  console.error('Configuração não criada: o .env já existe ou a origem é inválida. Preserve o arquivo existente; use uma origem HTTPS sem caminho/porta ou http://localhost:3000.');
  process.exitCode = 1;
}
