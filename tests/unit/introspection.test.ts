import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signAccessToken } from '../../src/lib/jwt.js';
import { parseServiceKeys, validServiceKey } from '../../src/middlewares/service-auth.middleware.js';

const mock = vi.hoisted(() => ({ has: vi.fn(), findUnique: vi.fn() }));
vi.mock('../../src/lib/store.js', () => ({
  denylist: { has: mock.has },
  lockout: {},
}));
vi.mock('../../src/lib/prisma.js', () => ({
  prisma: { user: { findUnique: mock.findUnique } },
}));
const { introspectAccessToken } = await import('../../src/services/introspection.service.js');
const firstKey = 'first-service-key-for-tests-with-ample-length';
const nextKey = 'next-service-key-for-tests-with-ample-length';

describe('introspection API keys', () => {
  it('supports independent keys for rotation', () => {
    const keys = parseServiceKeys(firstKey + ',' + nextKey);
    expect(validServiceKey(firstKey, keys)).toBe(true);
    expect(validServiceKey(nextKey, keys)).toBe(true);
    expect(validServiceKey(firstKey.slice(0, -1), keys)).toBe(false);
    expect(validServiceKey('', keys)).toBe(false);
  });
  it('rejects short or duplicate keys', () => {
    expect(() => parseServiceKeys('short')).toThrow();
    expect(() => parseServiceKeys(firstKey + ',' + firstKey)).toThrow();
  });
});
describe('revocation-aware introspection', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mock.has.mockResolvedValue(false);
    mock.findUnique.mockResolvedValue({ id: 'user-1', email: 'new@example.com', role: 'USER' });
  });
  it('uses current database role and email instead of stale JWT claims', async () => {
    const { token } = signAccessToken({ sub: 'user-1', email: 'old@example.com', role: 'ADMIN' });
    const result = await introspectAccessToken(token);
    expect(result).toMatchObject({ active: true, sub: 'user-1', email: 'new@example.com', role: 'USER' });
    expect(mock.findUnique).toHaveBeenCalledOnce();
  });
  it('returns only active false for invalid, revoked and deleted users', async () => {
    const { token } = signAccessToken({ sub: 'user-1', email: 'a@b.com', role: 'USER' });
    expect(await introspectAccessToken('not.a.jwt')).toEqual({ active: false });
    mock.has.mockResolvedValueOnce(true);
    expect(await introspectAccessToken(token)).toEqual({ active: false });
    mock.findUnique.mockResolvedValue(null);
    expect(await introspectAccessToken(token)).toEqual({ active: false });
  });
});
