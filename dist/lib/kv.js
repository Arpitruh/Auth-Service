/**
 * In-memory KvStore with lazy + periodic TTL expiry.
 */
export class InMemoryKvStore {
    map = new Map();
    sweeper;
    constructor() {
        // Periodically evict expired entries so the map does not grow unbounded
        // with keys that are never read again. unref() so it never keeps the
        // process alive.
        this.sweeper = setInterval(() => this.sweep(), 60_000);
        this.sweeper.unref();
    }
    isExpired(entry) {
        return entry.expiresAt <= Date.now();
    }
    sweep() {
        const now = Date.now();
        for (const [key, entry] of this.map) {
            if (entry.expiresAt <= now)
                this.map.delete(key);
        }
    }
    async get(key) {
        const entry = this.map.get(key);
        if (!entry)
            return null;
        if (this.isExpired(entry)) {
            this.map.delete(key);
            return null;
        }
        return entry.value;
    }
    async set(key, value, ttlSeconds) {
        this.map.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    }
    async del(key) {
        this.map.delete(key);
    }
    async incr(key, ttlSeconds) {
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
    async has(key) {
        return (await this.get(key)) !== null;
    }
    async close() {
        clearInterval(this.sweeper);
        this.map.clear();
    }
}
/**
 * Selects the KvStore implementation. Today this always returns the in-memory
 * store. When REDIS_URL support is added, branch here to return a
 * RedisKvStore(redisUrl) instead — no caller changes required.
 */
export function createKvStore(_redisUrl) {
    // if (redisUrl) return new RedisKvStore(redisUrl);
    return new InMemoryKvStore();
}
//# sourceMappingURL=kv.js.map