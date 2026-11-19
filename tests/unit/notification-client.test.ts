import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256 } from '../../src/lib/hash.js';

vi.mock('../../src/config/env.js', () => ({
  ENV: {
    NOTIFICATION_SERVICE_URL: 'https://notifications.example.com',
    NOTIFICATION_API_KEY: 'server-only-unique-notification-api-key',
    PASSWORD_RESET_BASE_URL: 'https://app.example.com',
    RESET_TOKEN_TTL_MINUTES: 30,
  },
}));
const { sendPasswordResetEmail } = await import('../../src/lib/notification-client.js');
describe('notification reset link integration', () => {
  beforeEach(() => vi.restoreAllMocks());
  it('queues a forgot-password template with a deterministic retry key', async () => {
    const request = vi.fn().mockResolvedValue({ status: 202 });
    vi.stubGlobal('fetch', request);
    await sendPasswordResetEmail('u@example.com', 'test-raw-token');
    const [url, options] = request.mock.calls[0];
    expect(String(url)).toContain('/api/v1/notifications/send');
    expect(options.headers['x-api-key']).toBeTruthy();
    const body = JSON.parse(options.body);
    expect(body.templateId).toBe('forgot-password');
    expect(body.payloadData.resetUrl).toContain('test-raw-token');
    expect(body.idempotencyKey).toBe('password-reset:' + sha256('test-raw-token'));
    vi.unstubAllGlobals();
  });
  it('rejects a non-success response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 503 }));
    await expect(sendPasswordResetEmail('u@example.com', 'token')).rejects.toThrow('rejected');
    vi.unstubAllGlobals();
  });
});
