import rateLimit, { ipKeyGenerator, type Options, type Store } from 'express-rate-limit';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
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
function byIp(req: Request): string { return ipKeyGenerator(req.ip ?? '127.0.0.1'); }
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
