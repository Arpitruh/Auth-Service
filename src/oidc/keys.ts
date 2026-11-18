import { createPrivateKey, createPublicKey } from 'node:crypto';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { ENV } from '../config/env.js';

export interface OidcSigner {
  publicJwk: Record<string, unknown>;
  signIdToken(data: { sub: string; aud: string; nonce: string; email: string; authTime: number }): string;
  signAccessToken(data: { sub: string; aud: string; appId: string; scope: string }): string;
  verifyAccessToken(token: string): JwtPayload;
}
export function buildOidcSigner(pem: string, kid: string, issuer: string): OidcSigner {
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(kid)) throw new Error('Invalid OIDC key ID');
  const privateKey = createPrivateKey(pem);
  if (privateKey.asymmetricKeyType !== 'rsa' ||
      (privateKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new Error('OIDC signing key must be RSA >=2048');
  const publicKey = createPublicKey(privateKey);
  const jwk = publicKey.export({ format: 'jwk' });
  return {
    publicJwk: { ...jwk, kid, use: 'sig', alg: 'RS256' },
    signIdToken(data) {
      return jwt.sign({ sub: data.sub, nonce: data.nonce, email: data.email,
        email_verified: false, auth_time: data.authTime }, privateKey,
        { algorithm: 'RS256', issuer, audience: data.aud, expiresIn: '5m', keyid: kid });
    },
    signAccessToken(data) {
      return jwt.sign({ sub: data.sub, scope: data.scope, appId: data.appId, token_use: 'access' },
        privateKey, { algorithm: 'RS256', issuer, audience: data.aud,
          expiresIn: '5m', keyid: kid });
    },
    verifyAccessToken(token) {
      const result = jwt.verify(token, publicKey, { algorithms: ['RS256'], issuer });
      if (typeof result === 'string' || result.token_use !== 'access' ||
          typeof result.appId !== 'string' || typeof result.sub !== 'string') {
        throw new Error('Invalid access token claims');
      }
      return result;
    },
  };
}
let cached: OidcSigner | null = null;
export function oidcSigner(): OidcSigner {
  if (cached) return cached;
  if (!ENV.OIDC_PRIVATE_KEY_B64 || !ENV.OIDC_KEY_ID || !ENV.OIDC_ISSUER) {
    throw new Error('OIDC signing keys not configured');
  }
  cached = buildOidcSigner(Buffer.from(ENV.OIDC_PRIVATE_KEY_B64, 'base64').toString('utf8'),
    ENV.OIDC_KEY_ID, ENV.OIDC_ISSUER);
  return cached;
}
