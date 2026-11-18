import { describe, it, expect } from 'vitest';
import { parseAllowedOrigins } from '../../src/lib/origins.js';

describe('cross-app CORS origins', () => {
  it('accepts multiple explicit origins and rejects lookalikes', () => {
    const origins = parseAllowedOrigins('https://crm.example.com/,https://jobs.example.com,http://localhost:3000');
    expect(origins.has('https://crm.example.com')).toBe(true);
    expect(origins.has('https://jobs.example.com')).toBe(true);
    expect(origins.has('http://localhost:3000')).toBe(true);
    expect(origins.has('https://crm.example.com.evil.com')).toBe(false);
    expect(origins.size).toBe(3);
  });
  it('rejects wildcard origins, unsupported schemes and paths', () => {
    for (const origin of ['*', 'file:///app', 'https://crm.example.com/login', 'https://user:pass@crm.example.com']) {
      expect(() => parseAllowedOrigins(origin)).toThrow();
    }
  });
});
