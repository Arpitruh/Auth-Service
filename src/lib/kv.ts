/**
 * Shared key-value store abstraction for cross-instance state:
 *   - access-token denylist   (denylist:<jti>)
 *   - account lockout counters (lockout:<email>)
 *   - rate-limit counters      (handled by express-rate-limit's own store)
 *
 * The spec (Requirement 11.2) mandates Redis so this state is shared across
 * instances behind a load balancer. However, no Redis is provisioned in this
 * environment, so we ship a working in-memory implementation with real TTL
 * semantics behind a small interface. When REDIS_URL is configured, a Redis
 * implementation can be dropped in without touching any caller.
 *
 * IMPORTANT: the in-memory store is per-process. It is correct for a single
 * instance and for tests, but does NOT satisfy the multi-instance requirement.
 * Provision Redis and implement RedisKvStore before scaling horizontally.
 */
export interface KvStore {
  /** Get a value, or null if missing/expired. */
  get(key: string): Promise<string | null>;
  /** Set a value with a TTL in seconds. */
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Delete a key. */
  del(key: string): Promise<void>;
  /**
   * Atomically increment a counter. On first increment (creation), the TTL is
   * applied; subsequent increments keep the original expiry. Returns the new
   * count.
   */
  incr(key: string, ttlSeconds: number): Promise<number>;
  /** Whether a key currently exists (and is not expired). */
  has(key: string): Promise<boolean>;
  /** Release any resources (connections, timers). */
  close(): Promise<void>;
}

interface Entry {
  value: string;
  /** epoch ms when this entry expires. */
  expiresAt: number;
}

/**
 * In-memory KvStore with lazy + periodic TTL expiry.
 */
export class InMemoryKvStore implements KvStore {
  private readonly map = new Map<string, Entry>();
  private readonly sweeper: NodeJS.Timeout;

  constructor() {
    // Periodically evict expired entries so the map does not grow unbounded
    // with keys that are never read again. unref() so it never keeps the
    // process alive.
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref();
  }

  private isExpired(entry: Entry): boolean {
    return entry.expiresAt <= Date.now();
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.map) {
      if (entry.expiresAt <= now) this.map.delete(key);
    }
  }

  async get(key: string): Promise<string | null> {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (this.isExpired(entry)) {
      this.map.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.map.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    this.map.delete(key);
  }

  async incr(key: string, ttlSeconds: number): Promise<number> {
    const existing = this.map.get(key);
    if (existing && !this.isExpired(existing)) {
      const next = String(Number(existing.value) + 1);
      // Preserve the original expiry window (do not slide it on each incr).
      this.map.set(key, { value: next, expiresAt: existing.expiresAt });
      return Number(next);
    }
    this.map.set(key, { value: '1', expiresAt: Date.now() + ttlSeconds * 1000 });
    return 1;
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  async close(): Promise<void> {
    clearInterval(this.sweeper);
    this.map.clear();
  }
}

/**
 * Selects the KvStore implementation. Today this always returns the in-memory
 * store. When REDIS_URL support is added, branch here to return a
 * RedisKvStore(redisUrl) instead — no caller changes required.
 */
export function createKvStore(_redisUrl?: string | undefined): KvStore {
  // if (redisUrl) return new RedisKvStore(redisUrl);
  return new InMemoryKvStore();
}
