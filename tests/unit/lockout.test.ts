import { describe, it, expect, vi, beforeEach } from 'vitest';
import argon2 from 'argon2';

/**
 * Verifies account lockout logic against a mocked store + Prisma:
 *  - failures accumulate and, at the threshold, login is rejected without
 *    even consulting the DB;
 *  - a successful login resets the counter.
 */

const lockoutState = { count: 0 };

vi.mock('../../src/lib/store.js', () => ({
  denylist: { add: vi.fn(), has: vi.fn().mockResolvedValue(false) },
  lockout: {
    recordFailure: vi.fn(async () => ++lockoutState.count),
    failureCount: vi.fn(async () => lockoutState.count),
    reset: vi.fn(async () => {
      lockoutState.count = 0;
    }),
  },
  kv: {},
}));

const prismaMock = {
  user: { findUnique: vi.fn() },
  refreshToken: { create: vi.fn().mockResolvedValue({}) },
};
vi.mock('../../src/lib/prisma.js', () => ({ prisma: prismaMock }));

const { authService } = await import('../../src/services/auth.service.js');
const { lockout } = await import('../../src/lib/store.js');

beforeEach(() => {
  lockoutState.count = 0;
  vi.clearAllMocks();
});

describe('account lockout', () => {
  it('blocks login once the failure count reaches the threshold', async () => {
    lockoutState.count = 5; // LOCKOUT_THRESHOLD (test env)
    await expect(
      authService.login('a@b.com', 'whatever'),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    // Locked out before any DB lookup.
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('records a failure on wrong password', async () => {
    const hash = await argon2.hash('correct-horse');
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      role: 'USER',
      password: hash,
    });

    await expect(
      authService.login('a@b.com', 'wrong-password'),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(lockout.recordFailure).toHaveBeenCalled();
  });

  it('resets the counter on successful login', async () => {
    const hash = await argon2.hash('correct-horse');
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      role: 'USER',
      password: hash,
    });

    const result = await authService.login('a@b.com', 'correct-horse');
    expect(result.user.email).toBe('a@b.com');
    expect(lockout.reset).toHaveBeenCalledWith('a@b.com');
  });
});
