import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/store.js', () => ({
  denylist: { add: vi.fn(), has: vi.fn().mockResolvedValue(false) },
  lockout: {
    recordFailure: vi.fn(), failureCount: vi.fn().mockResolvedValue(0), reset: vi.fn(),
  },
  kv: { set: vi.fn(), get: vi.fn(), del: vi.fn(), incr: vi.fn(), has: vi.fn(), close: vi.fn() },
}));

const prismaMock = {
  $transaction: vi.fn(),
  refreshToken: {
    create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(),
  },
  user: { findUnique: vi.fn() },
};
vi.mock('../../src/lib/prisma.js', () => ({ prisma: prismaMock }));

const { authService } = await import('../../src/services/auth.service.js');
const { signRefreshToken } = await import('../../src/lib/jwt.js');
const { sha256 } = await import('../../src/lib/hash.js');
const { HttpError, ErrorCode } = await import('../../src/lib/errors.js');

beforeEach(() => {
  vi.resetAllMocks();
  prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.$transaction.mockImplementation(async (callback: (db: typeof prismaMock) => Promise<unknown>) => callback(prismaMock));
});

describe('refresh reuse detection and atomic rotation', () => {
  it('revokes the family when a revoked token is presented', async () => {
    const token = signRefreshToken({ sub: 'user-42', jti: 'family-jti' });
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: 'family-jti', userId: 'user-42', token: sha256(token),
      revokedAt: new Date(), expiresAt: new Date(Date.now() + 100000),
    });
    await expect(authService.refresh(token)).rejects.toMatchObject({ code: ErrorCode.TOKEN_REUSE });
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-42', revokedAt: null } }),
    );
  });

  it('revokes the family when the row is missing', async () => {
    const token = signRefreshToken({ sub: 'user-7', jti: 'missing-jti' });
    prismaMock.refreshToken.findUnique.mockResolvedValue(null);
    await expect(authService.refresh(token)).rejects.toBeInstanceOf(HttpError);
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-7', revokedAt: null } }),
    );
  });

  it('revokes the family if the persisted hash mismatches', async () => {
    const token = signRefreshToken({ sub: 'user-99', jti: 'hash-jti' });
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: 'hash-jti', userId: 'user-99', token: sha256('wrong'),
      revokedAt: null, expiresAt: new Date(Date.now() + 100000),
    });
    await expect(authService.refresh(token)).rejects.toMatchObject({ code: ErrorCode.TOKEN_REUSE });
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-99', revokedAt: null } }),
    );
  });

  it('atomically claims the old token before issuing its successor', async () => {
    const token = signRefreshToken({ sub: 'user-1', jti: 'valid-jti' });
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: 'valid-jti', userId: 'user-1', token: sha256(token),
      revokedAt: null, expiresAt: new Date(Date.now() + 100000),
    });
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com', role: 'USER' });
    prismaMock.refreshToken.create.mockResolvedValue({});
    prismaMock.refreshToken.update.mockResolvedValue({});
    const result = await authService.refresh(token);
    expect(result.tokens.refreshToken).toBeTruthy();
    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'valid-jti', token: sha256(token), revokedAt: null }),
      }),
    );
    expect(prismaMock.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'valid-jti' },
        data: expect.objectContaining({ replacedByToken: expect.any(String) }),
      }),
    );
    expect(prismaMock.refreshToken.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', revokedAt: null } }),
    );
  });

  it('rejects a losing compare-and-swap without creating a successor', async () => {
    const token = signRefreshToken({ sub: 'user-1', jti: 'cas-jti' });
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: 'cas-jti', userId: 'user-1', token: sha256(token),
      revokedAt: null, expiresAt: new Date(Date.now() + 100000),
    });
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com', role: 'USER' });
    prismaMock.refreshToken.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    await expect(authService.refresh(token)).rejects.toMatchObject({ code: ErrorCode.TOKEN_REUSE });
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });
});
