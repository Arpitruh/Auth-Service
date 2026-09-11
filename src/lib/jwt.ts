import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { ENV } from '../config/env.js';

type ExpiresIn = NonNullable<SignOptions['expiresIn']>;

export interface AccessTokenPayload {
  sub: string; // user id
  email: string;
  role: string;
  jti: string; // unique token id, used for the logout denylist
  iat?: number; // issued-at (added by jwt on verify)
  exp?: number; // expiry (added by jwt on verify)
}

export interface RefreshTokenPayload {
  sub: string; // user id
  jti: string; // unique token id, also stored in DB for revocation
  iat?: number;
  exp?: number;
}

/** Fields the caller supplies; jti is generated here. */
export type AccessTokenClaims = Omit<AccessTokenPayload, 'jti'>;

/**
 * Signs an access token, generating a unique `jti` claim so the token can be
 * individually revoked via the denylist on logout (Requirement 4.1).
 */
export function signAccessToken(claims: AccessTokenClaims): {
  token: string;
  jti: string;
} {
  const jti = randomUUID();
  const payload: AccessTokenPayload = { ...claims, jti };
  const options: SignOptions = { expiresIn: ENV.ACCESS_TOKEN_TTL as ExpiresIn };
  return { token: jwt.sign(payload, ENV.JWT_ACCESS_SECRET, options), jti };
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  const options: SignOptions = {
    expiresIn: ENV.REFRESH_TOKEN_TTL as ExpiresIn,
  };
  return jwt.sign(payload, ENV.JWT_REFRESH_SECRET, options);
}

/**
 * Verifies a token against the current secret, then (if configured) against a
 * previous secret for a rotation grace window (Requirement 12.4). Throws if
 * neither verifies.
 */
function verifyWithGrace<T>(
  token: string,
  current: string,
  previous: string | undefined,
): T {
  try {
    return jwt.verify(token, current) as T;
  } catch (err) {
    if (previous) {
      return jwt.verify(token, previous) as T;
    }
    throw err;
  }
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return verifyWithGrace<AccessTokenPayload>(
    token,
    ENV.JWT_ACCESS_SECRET,
    ENV.JWT_ACCESS_SECRET_PREVIOUS,
  );
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return verifyWithGrace<RefreshTokenPayload>(
    token,
    ENV.JWT_REFRESH_SECRET,
    ENV.JWT_REFRESH_SECRET_PREVIOUS,
  );
}

/**
 * Remaining lifetime of a decoded token in seconds (>= 0). Used to set the
 * denylist TTL so an entry expires exactly when the token would have.
 */
export function remainingTtlSeconds(payload: { exp?: number }): number {
  if (!payload.exp) return 0;
  return Math.max(0, payload.exp - Math.floor(Date.now() / 1000));
}
