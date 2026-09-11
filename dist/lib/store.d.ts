import { type KvStore } from './kv.js';
/**
 * Process-wide shared KV store instance (in-memory fallback today; Redis when
 * REDIS_URL is provided). Everything that needs cross-request/cross-instance
 * state — the access-token denylist and account-lockout counters — goes
 * through this single instance.
 */
export declare const kv: KvStore;
export declare const denylist: {
    /**
     * Add an access-token jti to the denylist with a TTL equal to the token's
     * remaining lifetime, so the entry auto-expires exactly when the token would
     * have anyway.
     */
    add(jti: string, ttlSeconds: number): Promise<void>;
    /** Whether an access-token jti has been revoked. */
    has(jti: string): Promise<boolean>;
};
export declare const lockout: {
    /**
     * Record a failed login for an email and return the new consecutive-failure
     * count. The counter expires after the lockout window, so failures must be
     * consecutive within that window to accumulate.
     */
    recordFailure(email: string, windowSeconds: number): Promise<number>;
    /** Current consecutive-failure count for an email (0 if none/expired). */
    failureCount(email: string): Promise<number>;
    /** Clear the failure counter (called on successful login). */
    reset(email: string): Promise<void>;
};
//# sourceMappingURL=store.d.ts.map