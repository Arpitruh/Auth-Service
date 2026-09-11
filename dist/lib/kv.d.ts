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
/**
 * In-memory KvStore with lazy + periodic TTL expiry.
 */
export declare class InMemoryKvStore implements KvStore {
    private readonly map;
    private readonly sweeper;
    constructor();
    private isExpired;
    private sweep;
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttlSeconds: number): Promise<void>;
    del(key: string): Promise<void>;
    incr(key: string, ttlSeconds: number): Promise<number>;
    has(key: string): Promise<boolean>;
    close(): Promise<void>;
}
/**
 * Selects the KvStore implementation. Today this always returns the in-memory
 * store. When REDIS_URL support is added, branch here to return a
 * RedisKvStore(redisUrl) instead — no caller changes required.
 */
export declare function createKvStore(_redisUrl?: string | undefined): KvStore;
//# sourceMappingURL=kv.d.ts.map