import { randomBytes } from 'node:crypto';

/** Public, non-secret OAuth client identifier. Never treat this as authentication. */
export function generateClientId(): string {
  return 'authapp_' + randomBytes(18).toString('base64url');
}
