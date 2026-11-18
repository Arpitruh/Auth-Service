import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

describe.skipIf(!process.env.RUN_CONTROL_TESTS)('isolated control-plane registry', () => {
  let registry: typeof import('../../src/control-plane/registry.js');
  let Pool: typeof import('pg').Pool;
  it('registers multiple applications without sharing their database bindings', async () => {
    registry = await import('../../src/control-plane/registry.js');
    ({ Pool } = await import('pg'));
    const first = await registry.registerApplication({
      slug: 'crm-' + randomUUID().slice(0, 8),
      name: 'CRM',
      redirectUris: ['https://crm.example.com/auth/callback'],
      provider: 'NEON',
      mode: 'MANAGED',
    });
    const second = await registry.registerApplication({
      slug: 'jobs-' + randomUUID().slice(0, 8),
      name: 'Jobs',
      redirectUris: ['https://jobs.example.com/auth/callback'],
      provider: 'POSTGRESQL',
      mode: 'EXTERNAL',
    });
    expect(first.clientId).not.toBe(second.clientId);
    expect(first.status).toBe('DRAFT');
    expect(first.ssoEnabled).toBe(false);
    expect(first.database.provisionState).toBe('PENDING');
    expect(second.database.mode).toBe('EXTERNAL');
    expect(first.redirectUris).toEqual(['https://crm.example.com/auth/callback']);
    expect(second.redirectUris).toEqual(['https://jobs.example.com/auth/callback']);
    expect(JSON.stringify(first)).not.toContain('secretRef');
    expect(await registry.getDatabaseBindingForAppId(first.id)).toBeNull();
    expect(await registry.getApplicationByClientId('authapp_invalid')).toBeNull();

    const control = new Pool({ connectionString: process.env.CONTROL_PLANE_DATABASE_URL });
    try {
      const rows = await control.query('SELECT count(*)::int AS n FROM "ControlApplication" WHERE "id" = ANY($1::uuid[])', [[first.id,second.id]]);
      expect(rows.rows[0].n).toBe(2);
      // Existing user data is not stored in the central application registry.
      const tables = await control.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
      expect(tables.rows.map(r => r.table_name)).not.toContain('User');
    } finally { await control.end(); }
  });

  it('requires exact validated redirects and rejects unsafe app definitions', async () => {
    registry = await import('../../src/control-plane/registry.js');
    await expect(registry.registerApplication({
      slug: 'bad-' + randomUUID().slice(0,8), name: 'Bad', provider: 'NEON', mode: 'MANAGED',
      redirectUris: ['https://*.example.com/callback'],
    })).rejects.toThrow();
    await expect(registry.registerApplication({
      slug: 'bad-' + randomUUID().slice(0,8), name: 'Bad', provider: 'POSTGRESQL', mode: 'MANAGED',
      redirectUris: ['https://valid.example.com/callback'],
    })).rejects.toThrow();
  });
});

afterAll(async () => {
  if (process.env.RUN_CONTROL_TESTS) {
    const registry = await import('../../src/control-plane/registry.js');
    await registry.closeControlPlane();
  }
});
