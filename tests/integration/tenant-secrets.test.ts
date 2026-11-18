import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

describe.skipIf(!process.env.RUN_CONTROL_TESTS)('tenant secret isolation in central registry', () => {
  it('stores ciphertext separately from public app metadata', async () => {
    const { registerApplication, getApplicationByClientId } = await import('../../src/control-plane/registry.js');
    const { saveTenantConnectionSecret, resolveTenantConnectionSecret } = await import('../../src/provisioning/secrets.js');
    const app = await registerApplication({
      slug: 'vault-' + randomUUID().slice(0, 8), name: 'Secret Test',
      redirectUris: ['https://vault.example.com/callback'], mode: 'EXTERNAL', provider: 'POSTGRESQL',
    });
    const connection = 'postgresql://user:secret@vault.example.com/identity?sslmode=require';
    const ref = await saveTenantConnectionSecret(app.id, connection);
    expect(ref).toBe('secret://apps/' + app.id);
    expect(await resolveTenantConnectionSecret(ref)).toBe(connection);
    const publicMetadata = await getApplicationByClientId(app.clientId);
    expect(JSON.stringify(publicMetadata)).not.toContain('secret');
    expect(JSON.stringify(publicMetadata)).not.toContain('vault.example.com/identity');
  });
});
afterAll(async () => {
  if (process.env.RUN_CONTROL_TESTS) {
    const { closeSecretStore } = await import('../../src/provisioning/secrets.js');
    await closeSecretStore();
  }
});
