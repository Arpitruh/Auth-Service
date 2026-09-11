import { describe, it, expect } from 'vitest';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  remainingTtlSeconds,
} from '../../src/lib/jwt.js';

describe('access token', () => {
  it('signs with a generated jti and verifies round-trip', () => {
    const { token, jti } = signAccessToken({
      sub: 'user-1',
      email: 'a@b.com',
      role: 'USER',
    });
    expect(jti).toBeTruthy();

    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.email).toBe('a@b.com');
    expect(payload.role).toBe('USER');
    expect(payload.jti).toBe(jti);
  });

  it('generates a unique jti per call', () => {
    const a = signAccessToken({ sub: 'u', email: 'e', role: 'USER' });
    const b = signAccessToken({ sub: 'u', email: 'e', role: 'USER' });
    expect(a.jti).not.toBe(b.jti);
  });

  it('rejects a tampered token', () => {
    const { token } = signAccessToken({ sub: 'u', email: 'e', role: 'USER' });
    expect(() => verifyAccessToken(token + 'x')).toThrow();
  });
});

describe('refresh token', () => {
  it('signs and verifies with sub + jti', () => {
    const token = signRefreshToken({ sub: 'user-9', jti: 'jti-9' });
    const payload = verifyRefreshToken(token);
    expect(payload.sub).toBe('user-9');
    expect(payload.jti).toBe('jti-9');
  });
});

describe('remainingTtlSeconds', () => {
  it('returns 0 when exp is absent', () => {
    expect(remainingTtlSeconds({})).toBe(0);
  });

  it('never returns negative for a past expiry', () => {
    const past = Math.floor(Date.now() / 1000) - 100;
    expect(remainingTtlSeconds({ exp: past })).toBe(0);
  });

  it('returns a positive value for a future expiry', () => {
    const future = Math.floor(Date.now() / 1000) + 100;
    expect(remainingTtlSeconds({ exp: future })).toBeGreaterThan(0);
  });
});
