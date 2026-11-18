import { describe, expect, it } from 'vitest';
import { ENV } from '../../src/config/env.js';
import { issueTenantAccessToken, verifyTenantAccessToken } from '../../src/tenant/access-token.js';
import { verifyAccessToken } from '../../src/lib/jwt.js';
import { digestClientKey, generateClientKey } from '../../src/tenant/client-credentials.js';

describe('tenant-scoped backend credentials and JWTs', () => {
  it('generates opaque credentials without revealing their hashes', () => {
    const a = generateClientKey(), b = generateClientKey();
    expect(a).toMatch(/^authsk_[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    expect(digestClientKey(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(digestClientKey(a)).not.toBe(a);
  });
  it('never accepts a token across applications or legacy Auth', () => {
    if (!ENV.TENANT_JWT_SECRET) return;
    const jwt = issueTenantAccessToken('app-one', 'authapp_one',
      { id:'u1', email:'x@example.com', role:'USER' });
    expect(verifyTenantAccessToken(jwt, 'app-one', 'authapp_one').sub).toBe('u1');
    expect(() => verifyTenantAccessToken(jwt, 'app-two', 'authapp_one')).toThrow();
    expect(() => verifyTenantAccessToken(jwt, 'app-one', 'authapp_two')).toThrow();
    expect(() => verifyAccessToken(jwt)).toThrow();
  });
});
