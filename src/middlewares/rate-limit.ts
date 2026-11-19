import rateLimit, { ipKeyGenerator, type Options, type Store } from 'express-rate-limit';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { parseServiceKeys, validServiceKey } from './service-auth.middleware.js';
import { ENV } from '../config/env.js';
import { ErrorCode } from '../lib/errors.js';
import { kv } from '../lib/store.js';

/** Shared KV-backed limiter; no process-local counter when REDIS_URL is set. */
class KvRateLimitStore implements Store {
  private windowMs = 60_000;
  constructor(private readonly namespace: string) {}
  init(options: Options): void { this.windowMs = options.windowMs; }
  async increment(key: string): Promise<{ totalHits: number; resetTime: Date }> {
    const totalHits = await kv.incr('rate:' + this.namespace + ':' + key, Math.ceil(this.windowMs / 1000));
    return { totalHits, resetTime: new Date(Date.now() + this.windowMs) };
  }
  async decrement(key: string): Promise<void> { await kv.decr('rate:' + this.namespace + ':' + key); }
  async resetKey(key: string): Promise<void> { await kv.del('rate:' + this.namespace + ':' + key); }
}
// Authenticate the proxy before trusting its original-client IP. Do not use
// untrusted X-Forwarded-For / X-Client-IP directly from a public caller.
const trustedProxyKeys = parseServiceKeys(ENV.INTROSPECTION_API_KEYS);
export function loginClientIp(req: Pick<Request, 'ip' | 'header'>): string {
  const forwarded = req.header('x-original-client-ip');
  const key = req.header('x-auth-service-key');
  if (forwarded && isIP(forwarded) && validServiceKey(key, trustedProxyKeys)) return forwarded;
  return req.ip ?? '127.0.0.1';
}
function byIp(req: Request): string { return ipKeyGenerator(loginClientIp(req)); }
function byEmail(req: Request): string {
  const value = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  return createHash('sha256').update(value).digest('hex');
}
const shared: Partial<Options> = {
  windowMs: ENV.RATE_LIMIT_WINDOW_MINUTES * 60_000,
  limit: ENV.RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: ErrorCode.RATE_LIMITED, message: 'Too many attempts. Please try later.' } },
};

// Separate limits block IP spraying AND distributed attempts against one email.
export const loginRateLimiter = rateLimit({ ...shared, keyGenerator: byIp, store: new KvRateLimitStore('login-ip') });
export const loginEmailRateLimiter = rateLimit({ ...shared, keyGenerator: byEmail, store: new KvRateLimitStore('login-email') });
export const registerRateLimiter = rateLimit({ ...shared, keyGenerator: byIp, store: new KvRateLimitStore('register-ip') });
