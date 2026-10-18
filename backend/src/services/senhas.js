import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const options = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const prefix = 'scrypt$131072$8$1$';
const dummy = `${prefix}${randomBytes(16).toString('base64url')}$${randomBytes(64).toString('base64url')}`;

export async function hashSenha(senha) {
  const salt = randomBytes(16);
  const key = await derive(senha, salt, 64, options);
  return `${prefix}${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verificarSenha(senha, encoded = dummy) {
  const match = /^scrypt\$131072\$8\$1\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{86})$/.exec(encoded);
  if (!match) {
    await verificarSenha(senha, dummy);
    return false;
  }
  const key = await derive(senha, Buffer.from(match[1], 'base64url'), 64, options);
  return timingSafeEqual(key, Buffer.from(match[2], 'base64url'));
}
