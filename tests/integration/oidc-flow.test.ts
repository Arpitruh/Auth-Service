import { randomUUID, createPublicKey } from 'node:crypto';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { pkceChallenge } from '../../src/oidc/pkce.js';

describe.skipIf(process.env.RUN_TENANT_TESTS !== '1' || !process.env.OIDC_PRIVATE_KEY_B64)(
  'hosted OIDC Authorization Code + PKCE (isolated tenant)', () => {
    const app = createApp();
    const verifier = 'v'.repeat(50);
    const redirectUri = 'https://oidc-rp.example.com/callback';
    let clientId: string;
    let appId: string;
    let email: string;
    const password = 'SecurePassword1!';
    let code = '';

    it('registers a tenant user separately and rejects unregistered redirects', async () => {
      const [{ registerApplication }, { saveTenantConnectionSecret },
        { markApplicationDatabaseReady, activateApplication }, { tenantPool }] = await Promise.all([
        import('../../src/control-plane/registry.js'),
        import('../../src/provisioning/secrets.js'),
        import('../../src/control-plane/lifecycle.js'),
        import('../../src/tenant/database-pool.js'),
      ]);
      const registered = await registerApplication({
        slug: 'oidc-' + randomUUID().slice(0,8), name: 'OIDC Demo',
        redirectUris: [redirectUri], provider: 'POSTGRESQL', mode: 'EXTERNAL',
      });
      clientId = registered.clientId; appId = registered.id;
      const ref = await saveTenantConnectionSecret(appId,
        'postgresql://postgres:postgres@127.0.0.1:5432/tenant_alpha_ci?sslmode=disable');
      await markApplicationDatabaseReady(appId, ref, '20260911120000_hardening_token_lifecycle', 'system:test-provisioner');
      expect(await activateApplication(appId, 'system:test-provisioner')).toBe(true);
      email = 'oidc-' + randomUUID().slice(0,8) + '@example.com';
      await tenantPool.withTenant({ id: appId, clientId, status: 'ACTIVE',
        secretRef: ref, schemaVersion: '20260911120000_hardening_token_lifecycle' },
      db => db.user.create({ data: { email, password: await argon2.hash(password) } }));
      const invalid = await request(app).get('/oauth/authorize').query({
        client_id: clientId, redirect_uri: 'https://attacker.example.com/callback',
        response_type:'code', scope:'openid', state:'s'.repeat(24), nonce:'n'.repeat(24),
        code_challenge:pkceChallenge(verifier), code_challenge_method:'S256',
      });
      expect(invalid.status).toBe(400);
      expect(invalid.header.location).toBeUndefined();
    });

    it('renders hosted login and exchanges a single-use code', async () => {
      const authorize = await request(app).get('/oauth/authorize').query({
        client_id: clientId, redirect_uri: redirectUri,
        response_type:'code', scope:'openid', state:'state-' + 's'.repeat(24),
        nonce:'nonce-' + 'n'.repeat(24),
        code_challenge:pkceChallenge(verifier), code_challenge_method:'S256',
      });
      expect(authorize.status).toBe(200);
      expect(authorize.text).toContain('Sign in');
      const flow = /name="flow" value="([^"]+)"/.exec(authorize.text)?.[1];
      const csrf = /name="csrf" value="([^"]+)"/.exec(authorize.text)?.[1];
      expect(flow).toBeTruthy();
      expect(csrf).toBeTruthy();
      const completed = await request(app).post('/oauth/authorize/complete')
        .set('Cookie', authorize.headers['set-cookie'])
        .type('form').send({ flow, csrf, email, password });
      expect(completed.status).toBe(303);
      const redirected = new URL(completed.header.location);
      expect(redirected.origin).toBe('https://oidc-rp.example.com');
      expect(redirected.searchParams.get('state')).toBe('state-' + 's'.repeat(24));
      code = redirected.searchParams.get('code')!;
      expect(code).toBeTruthy();
      const swapped = await request(app).post('/oauth/token').type('form').send({
        grant_type:'authorization_code', code, client_id:clientId,
        redirect_uri:redirectUri, code_verifier:verifier,
      });
      expect(swapped.status).toBe(200);
      expect(swapped.body.token_type).toBe('Bearer');
      expect(swapped.body.refresh_token).toBeUndefined();
      const jwks = await request(app).get('/oauth/jwks');
      expect(jwks.status).toBe(200);
      const key = createPublicKey({ key: jwks.body.keys[0], format: 'jwk' });
      expect(jwt.verify(swapped.body.id_token, key, { algorithms:['RS256'],
        audience:clientId, issuer:'http://localhost:5000' }))
        .toMatchObject({ nonce:'nonce-' + 'n'.repeat(24) });
      const userinfo = await request(app).get('/oauth/userinfo')
        .set('Authorization', 'Bearer ' + swapped.body.access_token);
      expect(userinfo.status).toBe(200);
      expect(userinfo.body.email).toBe(email);
      const replay = await request(app).post('/oauth/token').type('form').send({
        grant_type:'authorization_code', code, client_id:clientId,
        redirect_uri:redirectUri, code_verifier:verifier,
      });
      expect(replay.status).toBe(400);
      expect(replay.body.error).toBe('invalid_grant');
    });

    it('rejects mismatched PKCE challenge at the token endpoint', async () => {
      const started = await request(app).get('/oauth/authorize').query({
        client_id:clientId, redirect_uri:redirectUri,
        response_type:'code', scope:'openid', state:'a'.repeat(32), nonce:'b'.repeat(32),
        code_challenge:pkceChallenge(verifier), code_challenge_method:'S256',
      });
      const flow=/name="flow" value="([^"]+)"/.exec(started.text)?.[1];
      const csrf=/name="csrf" value="([^"]+)"/.exec(started.text)?.[1];
      const completed=await request(app).post('/oauth/authorize/complete')
        .set('Cookie', started.headers['set-cookie']).type('form')
        .send({ flow,csrf,email,password });
      expect(completed.status).toBe(303);
      const code2=new URL(completed.header.location).searchParams.get('code');
      const failed=await request(app).post('/oauth/token').type('form').send({
        grant_type:'authorization_code', code:code2, client_id:clientId,
        redirect_uri:redirectUri, code_verifier:'z'.repeat(50),
      });
      expect(failed.status).toBe(400);
      const replay=await request(app).post('/oauth/token').type('form').send({
        grant_type:'authorization_code', code:code2, client_id:clientId,
        redirect_uri:redirectUri, code_verifier:verifier,
      });
      expect(replay.status).toBe(400);
    });

    afterAll(async () => {
      if (!process.env.RUN_TENANT_TESTS || !process.env.OIDC_PRIVATE_KEY_B64) return;
      const [{ tenantPool }, { closeOidcPool }, { closeControlPlane },
        { closeApplicationLifecycle }, { closeSecretStore }] = await Promise.all([
        import('../../src/tenant/database-pool.js'), import('../../src/oidc/app.js'),
        import('../../src/control-plane/registry.js'), import('../../src/control-plane/lifecycle.js'),
        import('../../src/provisioning/secrets.js'),
      ]);
      await tenantPool.close();
      await Promise.all([closeOidcPool(), closeControlPlane(), closeApplicationLifecycle(), closeSecretStore()]);
    });
  });
