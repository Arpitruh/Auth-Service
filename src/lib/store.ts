import { createKvStore, type KvStore } from './kv.js';
import { ENV } from '../config/env.js';

/**
 * Process-wide shared KV store instance (in-memory fallback today; Redis when
 * REDIS_URL is provided). Everything that needs cross-request/cross-instance
 * state — the access-token denylist and account-lockout counters — goes
 * through this single instance.
 */
export const kv: KvStore = createKvStore(ENV.REDIS_URL);

// ---- Access-token denylist -------------------------------------------------

const DENYLIST_PREFIX = 'denylist:';

export const denylist = {
  /**
   * Add an access-token jti to the denylist with a TTL equal to the token's
   * remaining lifetime, so the entry auto-expires exactly when the token would
   * have anyway.
   */
  async add(jti: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return;
    await kv.set(`${DENYLIST_PREFIX}${jti}`, '1', ttlSeconds);
  },

  /** Whether an access-token jti has been revoked. */
  async has(jti: string): Promise<boolean> {
    return kv.has(`${DENYLIST_PREFIX}${jti}`);
  },
};

// ---- Account lockout -------------------------------------------------------

const LOCKOUT_PREFIX = 'lockout:';

export const lockout = {
  /**
   * Record a failed login for an email and return the new consecutive-failure
   * count. The counter expires after the lockout window, so failures must be
   * consecutive within that window to accumulate.
   */
  async recordFailure(email: string, windowSeconds: number): Promise<number> {
    return kv.incr(`${LOCKOUT_PREFIX}${email}`, windowSeconds);
  },

  /** Current consecutive-failure count for an email (0 if none/expired). */
  async failureCount(email: string): Promise<number> {
    const raw = await kv.get(`${LOCKOUT_PREFIX}${email}`);
    return raw ? Number(raw) : 0;
  },

  /** Clear the failure counter (called on successful login). */
  async reset(email: string): Promise<void> {
    await kv.del(`${LOCKOUT_PREFIX}${email}`);
  },
};
