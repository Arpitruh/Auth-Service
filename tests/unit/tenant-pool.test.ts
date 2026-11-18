import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { TenantDatabasePool } from '../../src/tenant/database-pool.js';
import type { VerifiedTenant } from '../../src/tenant/client-credentials.js';

const app = (id: string): VerifiedTenant => ({
  id, clientId:'authapp_' + 'A'.repeat(24), status:'ACTIVE',
  secretRef:'secret://apps/' + id, schemaVersion:'20260911120000_hardening_token_lifecycle',
});
describe('bounded and leased tenant connections', () => {
  const url = 'postgresql://user:password@tenant.example.neon.tech/tenantdb?sslmode=require';
  it('reuses a client's connection and closes the least recently used idle client', async () => {
    const created: { $disconnect: ReturnType<typeof vi.fn>; $queryRaw: ReturnType<typeof vi.fn> }[] = [];
    const pool = new TenantDatabasePool(1, 0, async () => url, () => {
      const fake = { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
        $disconnect: vi.fn().mockResolvedValue(undefined) };
      created.push(fake);
      return fake as unknown as PrismaClient;
    });
    await pool.withTenant(app('app-one'), async () => 'one');
    await pool.withTenant(app('app-one'), async () => 'same');
    expect(created).toHaveLength(1);
    await pool.withTenant(app('app-two'), async () => 'two');
    expect(created).toHaveLength(2);
    expect(created[0].$disconnect).toHaveBeenCalledOnce();
    await pool.close();
    expect(created[1].$disconnect).toHaveBeenCalledOnce();
  });
  it('never evicts a tenant while an operation is using its database', async () => {
    const pool = new TenantDatabasePool(1, 0, async () => url, () => ({
      $queryRaw: vi.fn().mockResolvedValue([]), $disconnect: vi.fn().mockResolvedValue(undefined),
    }) as unknown as PrismaClient);
    let release!: () => void;
    const keepOpen = new Promise<void>(resolve => { release = resolve; });
    let entered!: () => void;
    const active = new Promise<void>(resolve => { entered = resolve; });
    const first = pool.withTenant(app('busy'), async () => {
      entered();
      await keepOpen;
    });
    await active;
    await expect(pool.withTenant(app('other'), async () => 'other')).rejects.toThrow('busy');
    release();
    await first;
    await pool.close();
  });
});
