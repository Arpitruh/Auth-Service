import { describe, it, expect } from 'vitest';
import { sha256, randomToken } from '../../src/lib/hash.js';

describe('sha256', () => {
  it('is deterministic for the same input', () => {
    expect(sha256('hello')).toBe(sha256('hello'));
  });

  it('produces different digests for different inputs', () => {
    expect(sha256('a')).not.toBe(sha256('b'));
  });

  it('returns a 64-char hex string', () => {
    expect(sha256('anything')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('randomToken', () => {
  it('produces unique, url-safe tokens', () => {
    const a = randomToken();
    const b = randomToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
