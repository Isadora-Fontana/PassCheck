import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

export function normalizeLoginIp(value) {
  if (typeof value !== 'string' || value.includes('%') || !isIP(value)) return 'unknown';
  if (isIP(value) === 4) return value;
  const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const [left, right] = canonical.split('::');
  const leading = left ? left.split(':') : [];
  const trailing = right ? right.split(':') : [];
  const words = right === undefined ? leading
    : [...leading, ...Array(8 - leading.length - trailing.length).fill('0'), ...trailing];
  const numbers = words.map((word) => parseInt(word, 16));
  if (numbers.slice(0, 5).every((n) => n === 0) && numbers[5] === 65535) {
    return [numbers[6] >> 8, numbers[6] & 255, numbers[7] >> 8, numbers[7] & 255].join('.');
  }
  // Evita renovar a cota apenas alternando endereços dentro da mesma rede IPv6.
  return numbers.slice(0, 4).map((n) => n.toString(16)).join(':') + '::/64';
}

export function loginLimitKey(ip, secret) {
  return createHmac('sha256', Buffer.from(secret, 'base64url'))
    .update('passcheck:login-ip:v1:').update(normalizeLoginIp(ip)).digest('hex');
}

export function createLoginLimit(database, secret) {
  const memory = new Map();
  return async (ip) => {
    const key = loginLimitKey(ip, secret);
    if (database.dialect !== 'postgres') {
      const now = Date.now();
      for (const [id, entry] of memory) if (entry.until <= now) memory.delete(id);
      const entry = memory.get(key);
      if (entry?.total >= 10) return { allowed: false, retryAfter: Math.max(1, Math.ceil((entry.until - now) / 1000)) };
      if (!entry && memory.size >= 1000) return { allowed: false, retryAfter: 1 };
      memory.set(key, { total: (entry?.total ?? 0) + 1, until: entry?.until ?? now + 900000 });
      return { allowed: true };
    }
    // Transação independente das escritas de negócio; não usa os locks das 11 tabelas.
    // O lock transacional serializa também a capacidade global e funciona no pooler.
    return database.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(724110, hashtext($1))', [database.schema]);
      await tx.query('DELETE FROM login_limites WHERE expira_em <= clock_timestamp()');
      const { rows: [entry] } = await tx.query(`SELECT tentativas,
        GREATEST(1, ceil(extract(epoch FROM (expira_em - clock_timestamp()))))::integer AS retry_after
        FROM login_limites WHERE chave=$1`, [key]);
      if (entry?.tentativas >= 10) return { allowed: false, retryAfter: entry.retry_after };
      if (entry) {
        await tx.query('UPDATE login_limites SET tentativas=tentativas+1 WHERE chave=$1', [key]);
      } else {
        const { rows: [{ total }] } = await tx.query('SELECT count(*) AS total FROM login_limites');
        if (total >= 1000) return { allowed: false, retryAfter: 1 };
        await tx.query("INSERT INTO login_limites(chave,tentativas,expira_em) VALUES($1,1,clock_timestamp()+interval '15 minutes')", [key]);
      }
      return { allowed: true };
    });
  };
}
