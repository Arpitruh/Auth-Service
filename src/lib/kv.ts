import { Redis } from 'ioredis';
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
  /** Atomic read-and-delete for one-time authorization codes. */
  consume(key: string): Promise<string | null>;
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
  /** Decrement a counter without extending its expiry. */
  decr(key: string): Promise<void>;
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

  async consume(key: string): Promise<string | null> {
    const value = await this.get(key);
    this.map.delete(key);
    return value;
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

  async decr(key: string): Promise<void> {
    const entry = this.map.get(key);
    if (entry && !this.isExpired(entry)) entry.value = String(Math.max(0, Number(entry.value) - 1));
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
 * Real shared storage for multi-instance deployments. Redis keys are scoped
 * to this service; counter increments and TTL installation are atomic.
 * All Redis failures propagate and deny authentication rather than silently
 * switching to process-local revocation state.
 */
export class RedisKvStore implements KvStore {
  private readonly redis: Redis;
  private connecting: Promise<void> | undefined;
  private lastConnectionIssue = 'NONE';
  constructor(url: string) {
    this.redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 10000,
      retryStrategy: (times) => Math.min(times * 250, 1500),
    });
    // Don't print raw Redis errors: upstream messages can include sensitive connection details.
    this.redis.on('error', (error: Error & { code?: string }) => {
      const code = typeof error.code === 'string' ? error.code : '';
      const message = error.message.toLowerCase();
      const reason = /wrongpass|noauth|authentication|invalid password/.test(message) ? 'AUTH' :
        /certificate|self.signed|unable to verify|tls/.test(message) ? 'TLS' :
        /timeout|timed out/.test(message) ? 'TIMEOUT' :
        /enotfound|getaddrinfo/.test(message) ? 'DNS' :
        /econnrefused|econnreset|ehostunreach|enetunreach/.test(code) ? 'NETWORK' : 'OTHER';
      this.lastConnectionIssue = reason;
      console.error('Redis connection failure:', { status: this.redis.status, reason, code: /^[A-Z_]+$/.test(code) ? code : 'UNKNOWN' });
    });
    this.redis.on('ready', () => { this.lastConnectionIssue = 'NONE'; });
  }
  private async ready(): Promise<Redis> {
    if (this.redis.status === 'ready') return this.redis;
    if (!this.connecting) {
      this.connecting = this.waitUntilReady().finally(() => { this.connecting = undefined; });
    }
    await this.connecting;
    return this.redis;
  }
  private async waitUntilReady(): Promise<void> {
    if (this.redis.status === 'ready') return;
    // connect() is only legal in the 'wait' state. In 'connecting' or
    // 'reconnecting', let ioredis finish its own transition.
    const status = this.redis.status;
    if (status === 'end') throw new Error('Redis connection ended');
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        clearTimeout(timer);
        this.redis.off('ready', onReady);
        this.redis.off('end', onEnd);
      };
      const onReady = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const onEnd = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Redis connection ended'));
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Redis readiness timeout: ' + this.lastConnectionIssue));
      }, 10000);
      this.redis.on('ready', onReady);
      this.redis.on('end', onEnd);
      if (this.redis.status === 'ready') { onReady(); return; }
      if (this.redis.status === 'wait') {
        this.redis.connect().catch(() => {
          // The connection error is classified by the event listener.
          // ioredis may schedule a reconnection; readiness timeout bounds this request.
        });
      }
    });
  }
  private key(value: string): string { return 'auth-service:' + value; }
  async get(key: string): Promise<string | null> {
    return (await this.ready()).get(this.key(key));
  }
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await (await this.ready()).set(this.key(key), value, 'EX', Math.max(1, Math.ceil(ttlSeconds)));
  }
  async consume(key: string): Promise<string | null> {
    return (await this.ready()).getdel(this.key(key));
  }
  async del(key: string): Promise<void> {
    await (await this.ready()).del(this.key(key));
  }
  async incr(key: string, ttlSeconds: number): Promise<number> {
    const client = await this.ready();
    const script = "local n=redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return n";
    return Number(await client.eval(script, 1, this.key(key), Math.max(1, Math.ceil(ttlSeconds)).toString()));
  }
  async decr(key: string): Promise<void> {
    const client = await this.ready();
    const script = "if redis.call('EXISTS',KEYS[1])==1 then local n=redis.call('DECR',KEYS[1]); if n<0 then redis.call('SET',KEYS[1],'0','KEEPTTL') end end; return 1";
    await client.eval(script, 1, this.key(key));
  }
  async has(key: string): Promise<boolean> { return (await this.get(key)) !== null; }
  async close(): Promise<void> { this.redis.disconnect(); }
}

/** Without Redis this is usable for local single-instance development only. */
export function createKvStore(redisUrl?: string): KvStore {
  return redisUrl ? new RedisKvStore(redisUrl) : new InMemoryKvStore();
}
