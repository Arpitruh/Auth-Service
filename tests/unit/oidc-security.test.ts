import { generateKeyPairSync, createPublicKey } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { pkceChallenge, verifyPkce, validPkceChallenge } from '../../src/oidc/pkce.js';
import { buildOidcSigner } from '../../src/oidc/keys.js';
import { escapeHtml } from '../../src/oidc/html.js';
import { InMemoryKvStore, RedisKvStore } from '../../src/lib/kv.js';

describe('OIDC security primitives', () => {
  it('only allows valid S256 proof keys', () => {
    const verifier = 'a'.repeat(43);
    expect(validPkceChallenge(pkceChallenge(verifier))).toBe(true);
    expect(verifyPkce(verifier, pkceChallenge(verifier))).toBe(true);
    expect(verifyPkce('b'.repeat(43), pkceChallenge(verifier))).toBe(false);
    expect(verifyPkce('short', pkceChallenge(verifier))).toBe(false);
  });
  it('issues signed RS256 identity and access tokens with discoverable JWK', () => {
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const key = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const issuer = 'https://auth.example.com';
    const signer = buildOidcSigner(key, 'test-signing-key', issuer);
    const token = signer.signIdToken({
      sub: 'uid', aud: 'client-1', nonce: 'random-nonce',
      email: 'u@example.com', authTime: 123456,
    });
    const publicKey = createPublicKey({ key: signer.publicJwk, format: 'jwk' });
    const claims = jwt.verify(token, publicKey, { algorithms: ['RS256'],
      issuer, audience: 'client-1' });
    expect(claims).toMatchObject({ sub: 'uid', nonce: 'random-nonce',
      email_verified: false });
    expect(() => jwt.verify(token, publicKey, { algorithms: ['RS256'],
      issuer, audience: 'other-client' })).toThrow();
    const access = signer.signAccessToken({
      sub: 'uid', aud: 'client-1', appId: 'app-one', scope: 'openid',
    });
    expect(signer.verifyAccessToken(access)).toMatchObject({ appId: 'app-one', token_use: 'access' });
    expect(() => signer.verifyAccessToken(token)).toThrow();
    expect(signer.publicJwk).not.toHaveProperty('d');
  });
  it('escapes HTML metacharacters from app names', () => {
    expect(escapeHtml('<script>"&</script>')).toBe('&lt;script&gt;&quot;&amp;&lt;/script&gt;');
  });
  it('consumes one-time values exactly once in memory', async () => {
    const store = new InMemoryKvStore();
    try {
      await store.set('one-time', 'value', 10);
      expect(await store.consume('one-time')).toBe('value');
      expect(await store.consume('one-time')).toBeNull();
    } finally { await store.close(); }
  });
});
describe.skipIf(!process.env.RUN_REDIS_TESTS)('atomic Redis authorization-code consumption', () => {
  it('allows only one winner among concurrent code redeemers', async () => {
    const redis = new RedisKvStore(process.env.REDIS_TEST_URL!);
    try {
      const key = 'oidc:test:' + Date.now();
      await redis.set(key, 'identity', 30);
      const result = await Promise.all(Array.from({ length: 10 }, () => redis.consume(key)));
      expect(result.filter(x => x === 'identity')).toHaveLength(1);
      expect(result.filter(x => x === null)).toHaveLength(9);
    } finally { await redis.close(); }
  });
});
