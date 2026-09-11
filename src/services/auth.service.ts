import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { ENV, REFRESH_TOKEN_TTL_DAYS } from '../config/env.js';
import {
  ErrorCode,
  conflict,
  unauthorized,
} from '../lib/errors.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  verifyAccessToken,
  remainingTtlSeconds,
} from '../lib/jwt.js';
import { sha256 } from '../lib/hash.js';
import { denylist, lockout } from '../lib/store.js';
import { logger } from '../lib/logger.js';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface PublicUser {
  id: string;
  email: string;
  role: string;
}

/** Optional request metadata captured at token issuance. */
export interface IssueContext {
  device?: string | undefined;
  ip?: string | undefined;
}

function toPublicUser(user: {
  id: string;
  email: string;
  role: string;
}): PublicUser {
  return { id: user.id, email: user.email, role: user.role };
}

function refreshExpiryDate(): Date {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Issues a fresh access/refresh pair. The refresh token's SHA-256 hash (never
 * the plaintext) is persisted, keyed by its `jti`, so it can be rotated and
 * revoked later. Requirement 1 (hashing at rest) + Requirement 2 (rotation).
 */
async function issueTokens(
  user: PublicUser,
  ctx: IssueContext = {},
): Promise<AuthTokens> {
  const jti = randomUUID();

  const { token: accessToken } = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });
  const refreshToken = signRefreshToken({ sub: user.id, jti });

  await prisma.refreshToken.create({
    data: {
      id: jti,
      token: sha256(refreshToken),
      userId: user.id,
      expiresAt: refreshExpiryDate(),
      device: ctx.device ?? null,
      ip: ctx.ip ?? null,
    },
  });

  return { accessToken, refreshToken };
}

const LOCKOUT_WINDOW_SECONDS = ENV.LOCKOUT_WINDOW_MINUTES * 60;

export const authService = {
  async register(
    email: string,
    password: string,
    ctx: IssueContext = {},
  ): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    // Email is already normalized + validated by the Zod layer, but we rely on
    // the unique constraint as the source of truth for idempotency.
    const passwordHash = await argon2.hash(password);

    let user;
    try {
      user = await prisma.user.create({
        data: { email, password: passwordHash },
      });
    } catch (err) {
      // Unique-constraint violation → account already exists (idempotent 409).
      if (isUniqueViolation(err)) {
        throw conflict('An account with this email already exists.');
      }
      throw err;
    }

    const publicUser = toPublicUser(user);
    const tokens = await issueTokens(publicUser, ctx);
    logger.info({ userId: user.id, event: 'register' }, 'user registered');
    return { user: publicUser, tokens };
  },

  async login(
    email: string,
    password: string,
    ctx: IssueContext = {},
  ): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    // Account lockout (Requirement 6): independent of IP-based rate limiting.
    const failures = await lockout.failureCount(email);
    if (failures >= ENV.LOCKOUT_THRESHOLD) {
      // Generic message; we do not confirm the account exists or its state.
      logger.warn({ email, event: 'login_locked' }, 'login blocked by lockout');
      throw unauthorized(
        'Invalid email or password.',
        ErrorCode.INVALID_CREDENTIALS,
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Same error for missing user and bad password to avoid user enumeration.
    const invalid = () =>
      unauthorized('Invalid email or password.', ErrorCode.INVALID_CREDENTIALS);

    if (!user) {
      await recordFailedLogin(email);
      throw invalid();
    }

    const valid = await argon2.verify(user.password, password);
    if (!valid) {
      await recordFailedLogin(email);
      throw invalid();
    }

    // Success: clear the failure counter (Requirement 6.4).
    await lockout.reset(email);

    const publicUser = toPublicUser(user);
    const tokens = await issueTokens(publicUser, ctx);
    logger.info({ userId: user.id, event: 'login' }, 'login success');
    return { user: publicUser, tokens };
  },

  /**
   * Rotates a refresh token with reuse detection (Requirements 2 & 3).
   *
   * The presented token is hashed and matched against its DB row (by jti). If
   * the row is missing, already revoked, or the hash does not match, this is a
   * reuse/compromise signal: the ENTIRE token family for that user is revoked
   * and the attempt is rejected. Otherwise the row is marked revoked and a new
   * pair is issued.
   */
  async refresh(
    presentedToken: string | undefined,
    ctx: IssueContext = {},
  ): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    if (!presentedToken) {
      throw unauthorized('Refresh token missing.');
    }

    let payload;
    try {
      payload = verifyRefreshToken(presentedToken);
    } catch {
      throw unauthorized(
        'Invalid or expired refresh token.',
        ErrorCode.TOKEN_EXPIRED,
      );
    }

    const presentedHash = sha256(presentedToken);
    const stored = await prisma.refreshToken.findUnique({
      where: { id: payload.jti },
    });

    // Reuse detection: the row is gone, already revoked, or the hash mismatches.
    if (!stored || stored.revokedAt !== null || stored.token !== presentedHash) {
      await revokeFamily(payload.sub, 'reuse_detected');
      logger.error(
        { userId: payload.sub, jti: payload.jti, event: 'token_reuse' },
        'refresh token reuse detected; family revoked',
      );
      throw unauthorized(
        'Refresh token has been revoked.',
        ErrorCode.TOKEN_REUSE,
      );
    }

    if (stored.expiresAt.getTime() < Date.now()) {
      await prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });
      throw unauthorized(
        'Refresh token has expired.',
        ErrorCode.TOKEN_EXPIRED,
      );
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw unauthorized('User no longer exists.');
    }

    const publicUser = toPublicUser(user);

    // Issue the successor first so we can record its hash on the old row.
    const tokens = await issueTokens(publicUser, ctx);

    // Mark the presented token revoked and link to its successor (audit trail).
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: {
        revokedAt: new Date(),
        replacedByToken: sha256(tokens.refreshToken),
      },
    });

    logger.info(
      { userId: user.id, event: 'refresh' },
      'refresh token rotated',
    );
    return { user: publicUser, tokens };
  },

  /**
   * Logout: revokes the presented refresh token's row and adds the presented
   * access token's jti to the denylist so it cannot be used for its remaining
   * lifetime (Requirement 4).
   */
  async logout(
    refreshTokenValue: string | undefined,
    accessTokenValue: string | undefined,
  ): Promise<void> {
    if (refreshTokenValue) {
      try {
        const payload = verifyRefreshToken(refreshTokenValue);
        await prisma.refreshToken.updateMany({
          where: { id: payload.jti, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      } catch {
        // Invalid refresh token — nothing to revoke.
      }
    }

    if (accessTokenValue) {
      try {
        const payload = verifyAccessToken(accessTokenValue);
        await denylist.add(payload.jti, remainingTtlSeconds(payload));
      } catch {
        // Invalid access token — nothing to denylist.
      }
    }
  },
};

/** Records a failed login attempt against the lockout counter. */
async function recordFailedLogin(email: string): Promise<void> {
  const count = await lockout.recordFailure(email, LOCKOUT_WINDOW_SECONDS);
  logger.warn(
    { email, failures: count, event: 'login_failure' },
    'login failure recorded',
  );
}

/** Revokes every non-revoked refresh token for a user (family revocation). */
async function revokeFamily(userId: string, reason: string): Promise<void> {
  const result = await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  logger.warn(
    { userId, revoked: result.count, reason, event: 'family_revoked' },
    'refresh token family revoked',
  );
}

/** Detects a Prisma unique-constraint violation (P2002) without importing the enum. */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
}
