import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';

describe.skipIf(process.env.RUN_TENANT_TESTS !== '1')('verified tenant database routing', () => {
  const server = createApp();
  const password = 'VeryStrong1!Password';
  const registered: { appId: string; clientId: string; key: string; email: string }[] = [];

  it('requires backend caller authentication before touching a tenant database', async () => {
    const unauthorized = await request(server).post('/api/v2/tenant/login')
      .set('x-auth-client-id', 'authapp_' + 'x'.repeat(24))
      .send({ email: 'user@example.com', password });
    expect(unauthorized.status).toBe(401);
  });
  it('isolates users sharing exactly the same email across two databases', async () => {
    const { registerApplication } = await import('../../src/control-plane/registry.js');
    const { saveTenantConnectionSecret } = await import('../../src/provisioning/secrets.js');
    const { markApplicationDatabaseReady, activateApplication } = await import('../../src/control-plane/lifecycle.js');
    const { issueApplicationKey } = await import('../../src/tenant/client-credentials.js');
    for (const [n, dbName] of ['tenant_alpha_ci', 'tenant_beta_ci'].entries()) {
      const app = await registerApplication({
        name: 'Tenant ' + n, slug: 'tenant-route-' + randomUUID().slice(0,8),
        redirectUris: ['https://tenant' + n + '.example.com/auth/callback'],
        mode: 'EXTERNAL', provider: 'POSTGRESQL',
      });
      const secret = await saveTenantConnectionSecret(
        app.id, 'postgresql://postgres:postgres@127.0.0.1:5432/' + dbName + '?sslmode=disable',
      );
      await markApplicationDatabaseReady(app.id, secret, '20260911120000_hardening_token_lifecycle', 'system:test-provisioner');
      expect(await activateApplication(app.id, 'system:test-provisioner')).toBe(true);
      const key = await issueApplicationKey(app.id, 'test BFF');
      registered.push({ appId: app.id, clientId: app.clientId, key, email: 'same@example.com' });
    }
    const [first, second] = registered;
    const headers = (app: typeof first) => ({
      'x-auth-client-id': app.clientId, 'x-auth-client-key': app.key,
    });
    const r1 = await request(server).post('/api/v2/tenant/register').set(headers(first))
      .send({ email: first.email, password });
    const r2 = await request(server).post('/api/v2/tenant/register').set(headers(second))
      .send({ email: second.email, password });
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    const userA = r1.body.user as { id: string; email: string };
    const userB = r2.body.user as { id: string; email: string };
    expect(userA.email).toBe(userB.email);
    expect(userA.id).not.toBe(userB.id);
    const login1 = await request(server).post('/api/v2/tenant/login').set(headers(first))
      .send({ email: first.email, password });
    expect(login1.status).toBe(200);
    const tokenA = login1.body.accessToken as string;
    expect((await request(server).get('/api/v2/tenant/me').set(headers(first))
      .set('authorization', 'Bearer ' + tokenA)).status).toBe(200);
    // The same signed token is invalid in another app's audience and DB.
    expect((await request(server).get('/api/v2/tenant/me').set(headers(second))
      .set('authorization', 'Bearer ' + tokenA)).status).toBe(401);
    // And new tenant tokens must never authorize the old legacy API.
    expect((await request(server).get('/api/v1/auth/me')
      .set('authorization', 'Bearer ' + tokenA)).status).toBe(401);
    const { suspendApplication } = await import('../../src/control-plane/lifecycle.js');
    await suspendApplication(first.appId, 'system:test-provisioner');
    expect((await request(server).post('/api/v2/tenant/login').set(headers(first))
      .send({ email: first.email, password })).status).toBe(401);
    // Other app continues to operate.
    expect((await request(server).post('/api/v2/tenant/login').set(headers(second))
      .send({ email: second.email, password })).status).toBe(200);
    const { revokeApplicationKey, digestClientKey } = await import('../../src/tenant/client-credentials.js');
    await revokeApplicationKey(second.appId, digestClientKey(second.key));
    expect((await request(server).post('/api/v2/tenant/login').set(headers(second))
      .send({ email: second.email, password })).status).toBe(401);
  }, 30000);
  afterAll(async () => {
    if (process.env.RUN_TENANT_TESTS !== '1') return;
    const [{ tenantPool }, { closeTenantCredentials }, { closeSecretStore },
      { closeControlPlane }, { closeApplicationLifecycle }] = await Promise.all([
      import('../../src/tenant/database-pool.js'),
      import('../../src/tenant/client-credentials.js'),
      import('../../src/provisioning/secrets.js'),
      import('../../src/control-plane/registry.js'),
      import('../../src/control-plane/lifecycle.js'),
    ]);
    await tenantPool.close();
    await Promise.all([closeTenantCredentials(), closeSecretStore(),
      closeControlPlane(), closeApplicationLifecycle()]);
  });
});
