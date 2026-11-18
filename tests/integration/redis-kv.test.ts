import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { RedisKvStore } from '../../src/lib/kv.js';

describe.skipIf(!process.env.RUN_REDIS_TESTS)('shared Redis key/value state', () => {
  it('persists values across store instances and expires them', async () => {
    const url = process.env.REDIS_TEST_URL ?? 'redis://127.0.0.1:6379';
    const a = new RedisKvStore(url);
    const b = new RedisKvStore(url);
    const key = 'test:' + randomUUID();
    try {
      await a.set(key, '1', 2);
      expect(await b.get(key)).toBe('1');
      const counts = await Promise.all(Array.from({ length: 10 }, () => b.incr(key + ':counter', 3)));
      expect(counts.slice().sort((x, y) => x - y)).toEqual([1,2,3,4,5,6,7,8,9,10]);
      expect(await a.get(key + ':counter')).toBe('10');
      await a.del(key);
      expect(await b.get(key)).toBeNull();
    } finally {
      await Promise.all([a.close(), b.close()]);
    }
  });
});
