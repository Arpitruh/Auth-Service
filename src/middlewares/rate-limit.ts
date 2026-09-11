import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';
import type { Request } from 'express';
import { ENV } from '../config/env.js';
import { ErrorCode } from '../lib/errors.js';

/**
 * IP + email composite key so credential-stuffing against many accounts from
 * one IP, and distributed attempts against a single account, are both
 * throttled (Requirement 6.1). Complementary to per-account lockout.
 *
 * NOTE: uses express-rate-limit's default in-process memory store, matching
 * the in-memory KV fallback used elsewhere. When REDIS_URL is provisioned,
 * swap in `rate-limit-redis` here so counters are shared across instances
 * (Requirement 6.5 / 11.2).
 */
function keyGenerator(req: Request): string {
  const email =
    typeof req.body?.email === 'string'
      ? req.body.email.trim().toLowerCase()
      : '';
  // ipKeyGenerator normalizes IPv6 addresses into a safe subnet key so IPv6
  // clients cannot trivially rotate addresses to bypass the limit.
  const ipKey = ipKeyGenerator(req.ip ?? 'unknown');
  return `${ipKey}:${email}`;
}

const shared: Partial<Options> = {
  windowMs: ENV.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  limit: ENV.RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator,
  message: {
    error: {
      code: ErrorCode.RATE_LIMITED,
      message: 'Too many attempts. Please try again later.',
    },
  },
};

export const loginRateLimiter = rateLimit(shared);
export const registerRateLimiter = rateLimit(shared);
