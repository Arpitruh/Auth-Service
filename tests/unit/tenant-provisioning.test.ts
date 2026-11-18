import { describe, expect, it } from 'vitest';
import { encryptSecret, decryptSecret } from '../../src/provisioning/secrets.js';
import { validateTenantPostgresUrl } from '../../src/provisioning/connection-policy.js';

describe('per-application DB security', () => {
  it('encrypts connection strings with authenticated encryption and rejects tampering', () => {
    const raw = 'postgresql://tenant:password@tenant.example.com/appdb?sslmode=require';
    const encrypted = encryptSecret(raw);
    expect(encrypted).not.toContain('password');
    expect(decryptSecret(encrypted)).toBe(raw);
    const segments = encrypted.split('.');
    segments[3] = 'tampered';
    expect(() => decryptSecret(segments.join('.'))).toThrow();
    expect(encryptSecret(raw)).not.toBe(encrypted);
  });
  it('rejects control-plane and legacy DB credentials as tenant databases', () => {
    expect(() => validateTenantPostgresUrl(process.env.DATABASE_URL!)).toThrow();
    expect(() => validateTenantPostgresUrl(process.env.CONTROL_PLANE_DATABASE_URL!)).toThrow();
  });
  it('requires TLS, real database names and a valid hostname', () => {
    expect(validateTenantPostgresUrl('postgresql://user:pass@db.example.com/appdb?sslmode=require').hostname).toBe('db.example.com');
    for (const url of [
      'postgresql://user:pass@localhost/appdb?sslmode=require',
      'postgresql://user:pass@127.0.0.1/appdb?sslmode=require',
      'postgresql://user:pass@db.example.com/appdb?sslmode=disable',
      'postgresql://user:pass@db.example.com/',
      'https://example.com',
    ]) expect(() => validateTenantPostgresUrl(url)).toThrow();
  });
});
