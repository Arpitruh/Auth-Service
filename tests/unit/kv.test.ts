import { describe, it, expect, afterEach } from 'vitest';
import { InMemoryKvStore } from '../../src/lib/kv.js';

describe('InMemoryKvStore', () => {
  let store: InMemoryKvStore;

  afterEach(async () => {
    await store?.close();
  });

  it('stores and retrieves a value', async () => {
    store = new InMemoryKvStore();
    await store.set('k', 'v', 60);
    expect(await store.get('k')).toBe('v');
    expect(await store.has('k')).toBe(true);
  });

  it('expires values after their TTL', async () => {
    store = new InMemoryKvStore();
    // 0-second TTL → already expired on next read.
    await store.set('k', 'v', 0);
    expect(await store.get('k')).toBeNull();
    expect(await store.has('k')).toBe(false);
  });

  it('increments and preserves the original expiry window', async () => {
    store = new InMemoryKvStore();
    expect(await store.incr('c', 60)).toBe(1);
    expect(await store.incr('c', 60)).toBe(2);
    expect(await store.incr('c', 60)).toBe(3);
    expect(await store.get('c')).toBe('3');
  });

  it('resets the counter after deletion', async () => {
    store = new InMemoryKvStore();
    await store.incr('c', 60);
    await store.del('c');
    expect(await store.incr('c', 60)).toBe(1);
  });
});
