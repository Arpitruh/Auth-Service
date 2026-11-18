import { describe, it, expect, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

const mock = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock('../../src/lib/prisma.js', () => ({ prisma: { user: { findUnique: mock.findUnique } } }));
const { requireRole } = await import('../../src/middlewares/auth.middleware.js');

describe('admin role checks', () => {
  it('rejects an old ADMIN JWT after demotion', async () => {
    mock.findUnique.mockResolvedValueOnce({ role: 'USER' });
    const req = { user: { id: 'u1', role: 'ADMIN', email: 'e@example.com', jti: '1' } } as Request;
    const next = vi.fn();
    await requireRole('ADMIN')(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]?.[0]).toMatchObject({ statusCode: 403 });
  });
  it('looks up the current role before accepting', async () => {
    mock.findUnique.mockResolvedValueOnce({ role: 'ADMIN' });
    const req = { user: { id: 'u1', role: 'USER', email: 'e@example.com', jti: '1' } } as Request;
    const next = vi.fn();
    await requireRole('ADMIN')(req, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith();
    expect(req.user?.role).toBe('ADMIN');
  });
});
