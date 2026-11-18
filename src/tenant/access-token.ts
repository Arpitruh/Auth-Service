import { randomUUID } from 'node:crypto';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { ENV } from '../config/env.js';

/** Phase 3 token is deliberately distinct from legacy tokens.
 * It can never be used to authorize legacy endpoints.
 */
export interface TenantIdentity {
  sub: string;
  email: string;
  role: string;
  appId: string;
  clientId: string;
  jti: string;
  exp: number;
}
export function issueTenantAccessToken(
  appId: string, clientId: string, user: { id: string; email: string; role: string },
): string {
  if (!ENV.TENANT_JWT_SECRET) throw new Error('Tenant token issuance is disabled');
  return jwt.sign({ sub: user.id, email: user.email, role: user.role, appId, jti: randomUUID() },
    ENV.TENANT_JWT_SECRET,
    { algorithm: 'HS256', issuer: ENV.TENANT_TOKEN_ISSUER,
      audience: clientId, expiresIn: '15m', header: { alg: 'HS256', typ: 'tenant+jwt' } });
}
/** Checks signature, required tenant claim, issuer, audience and user identity.
 * This is server-to-server BFF token validation, NOT full OIDC.
 */
export function verifyTenantAccessToken(token: string, appId: string, clientId: string): TenantIdentity {
  if (!ENV.TENANT_JWT_SECRET) throw new Error('Tenant tokens are disabled');
  const payload = jwt.verify(token, ENV.TENANT_JWT_SECRET, {
    algorithms: ['HS256'], issuer: ENV.TENANT_TOKEN_ISSUER,
    audience: clientId,
  });
  if (!payload || typeof payload === 'string' || jwt.decode(token, { complete: true })?.header.typ !== 'tenant+jwt') {
    throw new Error('Invalid tenant access token');
  }
  const claims = payload as JwtPayload & { email?: unknown; role?: unknown; appId?: unknown; jti?: unknown };
  if (claims.appId !== appId || typeof claims.sub !== 'string' ||
      typeof claims.email !== 'string' || typeof claims.role !== 'string' ||
      typeof claims.jti !== 'string' || typeof claims.exp !== 'number') {
    throw new Error('Tenant access token does not match this application');
  }
  return { sub: claims.sub, email: claims.email, role: claims.role,
    appId, clientId, jti: claims.jti, exp: claims.exp };
}
