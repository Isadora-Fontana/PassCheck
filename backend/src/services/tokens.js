import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { HttpError } from '../middleware/errors.js';

export function naoAutenticado() {
  return new HttpError(401, 'NAO_AUTENTICADO', 'Autenticação necessária.');
}

export function createTokens(config) {
  const secret = Buffer.from(config.jwtSecret, 'base64url');
  return {
    emitir(usuario) {
      return new SignJWT({ ver: usuario.versao_token })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setIssuer('passcheck-backend').setAudience('passcheck-pwa')
        .setSubject(String(usuario.id)).setIssuedAt()
        .setExpirationTime(`${config.jwtTtlSeconds}s`).setJti(randomUUID()).sign(secret);
    },
    async verificar(authorization) {
      if (typeof authorization !== 'string' || authorization.length > 4096
        || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/i.test(authorization)) throw naoAutenticado();
      try {
        const { payload } = await jwtVerify(authorization.slice(7), secret, {
          algorithms: ['HS256'], typ: 'JWT', issuer: 'passcheck-backend', audience: 'passcheck-pwa',
          requiredClaims: ['sub', 'iat', 'exp', 'jti', 'ver'],
        });
        const id = Number(payload.sub);
        if (!Number.isSafeInteger(id) || id <= 0 || String(id) !== payload.sub
          || !Number.isSafeInteger(payload.ver) || payload.ver < 0
          || !Number.isSafeInteger(payload.iat) || payload.iat > Math.floor(Date.now() / 1000)
          || !Number.isSafeInteger(payload.exp) || payload.exp <= payload.iat
          || payload.exp - payload.iat > config.jwtTtlSeconds
          || typeof payload.jti !== 'string' || !payload.jti.length) throw naoAutenticado();
        return { id, versao_token: payload.ver };
      } catch { throw naoAutenticado(); }
    },
  };
}
