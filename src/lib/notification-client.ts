import { ENV } from '../config/env.js';
import { sha256 } from './hash.js';

/** Queue a password reset through the authenticated Notification Service.
 * An HTTP 202 means accepted into a queue, not proof of email delivery.
 */
export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const service = ENV.NOTIFICATION_SERVICE_URL;
  const apiKey = ENV.NOTIFICATION_API_KEY;
  const base = ENV.PASSWORD_RESET_BASE_URL;
  if (!service || !apiKey || !base) {
    throw new Error('Password-reset delivery requires notification URL, API key and reset base URL.');
  }
  const resetUrl = new URL('/reset-password', base);
  resetUrl.searchParams.set('token', token);
  const response = await fetch(new URL('/api/v1/notifications/send', service), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-notification-api-key': apiKey },
    body: JSON.stringify({
      recipient: email, channel: 'email', templateId: 'forgot-password',
      payloadData: { name: 'there', resetUrl: resetUrl.toString(), expiresInMinutes: ENV.RESET_TOKEN_TTL_MINUTES },
      idempotencyKey: 'password-reset:' + sha256(token),
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (response.status !== 202 && response.status !== 200) {
    throw new Error('Notification Service rejected the password reset message (' + response.status + ')');
  }
}
