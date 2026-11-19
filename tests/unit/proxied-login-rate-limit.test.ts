import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/env.js', () => ({
  ENV: {
    INTROSPECTION_API_KEYS: 'trusted-notification-backend-secret-123456789',
    RATE_LIMIT_WINDOW_MINUTES: 15,
    RATE_LIMIT_MAX: 5,
  },
}));
vi.mock('../../src/lib/store.js', () => ({
  kv: { incr: vi.fn(), decr: vi.fn(), del: vi.fn() },
}));
const { loginClientIp } = await import('../../src/middlewares/rate-limit.js');

const trusted = 'trusted-notification-backend-secret-123456789';
function req(ip: string, headers: Record<string, string> = {}) {
  return {
    ip,
    header(name: string) { return headers[name.toLowerCase()]; },
  };
}

describe('login proxy IP trust boundary', () => {
  it('accepts an original client IP only when the service credential matches', () => {
    expect(loginClientIp(req('10.10.10.1', {
      'x-original-client-ip': '203.0.113.5',
      'x-auth-service-key': trusted,
    }))).toBe('203.0.113.5');
  });
  it('distinguishes clients behind the same trusted proxy', () => {
    const proxy = '10.10.10.1';
    const headers = (address: string) => ({
      'x-original-client-ip': address,
      'x-auth-service-key': trusted,
    });
    expect(loginClientIp(req(proxy, headers('203.0.113.5'))))
      .not.toBe(loginClientIp(req(proxy, headers('203.0.113.6'))));
  });
  it('does not trust forged client-IP headers without a valid credential', () => {
    expect(loginClientIp(req('10.10.10.1', {
      'x-original-client-ip': '203.0.113.5',
    }))).toBe('10.10.10.1');
    expect(loginClientIp(req('10.10.10.1', {
      'x-original-client-ip': '203.0.113.5',
      'x-auth-service-key': 'wrong-key',
    }))).toBe('10.10.10.1');
  });
  it('rejects malformed client IPs even with a valid credential', () => {
    expect(loginClientIp(req('10.10.10.1', {
      'x-original-client-ip': '203.0.113.5, 192.0.2.1',
      'x-auth-service-key': trusted,
    }))).toBe('10.10.10.1');
    expect(loginClientIp(req('10.10.10.1', {
      'x-original-client-ip': 'not-an-ip',
      'x-auth-service-key': trusted,
    }))).toBe('10.10.10.1');
  });
  it('supports IPv6 client addresses for trusted proxies', () => {
    expect(loginClientIp(req('10.10.10.1', {
      'x-original-client-ip': '2001:db8::123',
      'x-auth-service-key': trusted,
    }))).toBe('2001:db8::123');
  });
});
