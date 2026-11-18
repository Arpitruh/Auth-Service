import { describe, expect, it } from 'vitest';
import { canonicalRedirectUri, validateRedirectUris } from '../../src/control-plane/redirect-uri.js';
import { generateClientId } from '../../src/control-plane/client-id.js';

describe('isolated application registration boundaries', () => {
  it('accepts exact HTTPS and local-development redirects', () => {
    expect(canonicalRedirectUri('https://crm.example.com/callback?source=a')).toBe('https://crm.example.com/callback?source=a');
    expect(canonicalRedirectUri('http://localhost:3000/callback')).toBe('http://localhost:3000/callback');
    expect(validateRedirectUris(['https://app.example.com/callback']).length).toBe(1);
  });
  it('rejects unsafe redirects and duplicates', () => {
    for (const url of ['https://evil.example.com@trusted.example.com/callback',
      'http://crm.example.com/callback', 'https://*.example.com/callback',
      'https://crm.example.com/callback#fragment', 'javascript:alert(1)']) {
      expect(() => canonicalRedirectUri(url)).toThrow();
    }
    expect(() => validateRedirectUris(['https://crm.example.com/','https://crm.example.com/'])).toThrow();
  });
  it('generates unpredictable non-secret client identifiers', () => {
    const a = generateClientId();
    const b = generateClientId();
    expect(a).toMatch(/^authapp_[A-Za-z0-9_-]{24}$/);
    expect(a).not.toBe(b);
  });
});
