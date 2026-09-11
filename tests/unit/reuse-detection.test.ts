import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Proves the highest-value security behavior WITHOUT a live DB: presenting an
 * already-rotated (revoked) refresh token must revoke the ENTIRE token family
 * for that user, not merely 401. Prisma and the KV store are mocked so the
 * service logic is exercised in isolation.
 */

// --- Mock the KV-backed store (denylist/lockout) ---
vi.mock('../../src/lib/store.js', () => ({
  denylist: { add: vi.fn(), has: vi.fn().mockResolvedValue(false) },
  lockout: {
    recordFailure: vi.fn(),
    failureCount: vi.fn().mockResolvedValue(0),
    reset: vi.fn(),
  },
  kv: { set: vi.fn(), get: vi.fn(), del: vi.fn(), incr: vi.fn(), has: vi.fn(), close: vi.fn() },
}));

// --- Mock Prisma ---
const prismaMock = {
  refreshToken: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  user: { findUnique: vi.fn() },
};
vi.mock('../../src/lib/prisma.js', () => ({ prisma: prismaMock }));

// Import AFTER mocks are registered.
const { authService } = await import('../../src/services/auth.service.js');
const { signRefreshToken } = await import('../../src/lib/jwt.js');
const { sha256 } = await import('../../src/lib/hash.js');
const { HttpError, ErrorCode } = await import('../../src/lib/errors.js');

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 0 });
});

describe('refresh reuse detection', () => {
  it('revokes the whole family when a revoked token is presented', async () => {
    const jti = 'family-jti';
    const userId = 'user-42';
    const token = signRefreshToken({ sub: userId, jti });

    // The stored row exists but is ALREADY revoked → reuse signal.
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: jti,
      token: sha256(token),
      userId,
      revokedAt: new Date(), // already rotated
      expiresAt: new Date(Date.now() + 100000),
    });

    await expect(authService.refresh(token)).rejects.toMatchObject({
      code: ErrorCode.TOKEN_REUSE,
    });

    // The critical assertion: family revocation was invoked for this user
    // over all non-revoked rows.
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId, revokedAt: null },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
  });

  it('revokes the family when the token row is missing entirely', async () => {
    const jti = 'gone-jti';
    const userId = 'user-7';
    const token = signRefreshToken({ sub: userId, jti });

    prismaMock.refreshToken.findUnique.mockResolvedValue(null);

    await expect(authService.refresh(token)).rejects.toBeInstanceOf(HttpError);
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId, revokedAt: null } }),
    );
  });

  it('revokes the family on a hash mismatch (forged/stale token value)', async () => {
    const jti = 'mismatch-jti';
    const userId = 'user-99';
    const token = signRefreshToken({ sub: userId, jti });

    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: jti,
      token: sha256('a-different-token'), // stored hash does not match presented
      userId,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 100000),
    });

    await expect(authService.refresh(token)).rejects.toMatchObject({
      code: ErrorCode.TOKEN_REUSE,
    });
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId, revokedAt: null } }),
    );
  });

  it('rotates normally for a valid, non-revoked token (no family revocation)', async () => {
    const jti = 'valid-jti';
    const userId = 'user-1';
    const token = signRefreshToken({ sub: userId, jti });

    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: jti,
      token: sha256(token),
      userId,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 100000),
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: userId,
      email: 'a@b.com',
      role: 'USER',
    });
    prismaMock.refreshToken.create.mockResolvedValue({});
    prismaMock.refreshToken.update.mockResolvedValue({});

    const result = await authService.refresh(token);
    expect(result.tokens.accessToken).toBeTruthy();
    expect(result.tokens.refreshToken).toBeTruthy();

    // Old row marked revoked + linked to successor; family NOT bulk-revoked.
    expect(prismaMock.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: jti },
        data: expect.objectContaining({
          revokedAt: expect.any(Date),
          replacedByToken: expect.any(String),
        }),
      }),
    );
    // updateMany (family revocation) must NOT have been called on the happy path.
    expect(prismaMock.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});
