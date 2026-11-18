import { createHash, timingSafeEqual } from 'node:crypto';
export function validPkceChallenge(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}
export function validPkceVerifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._~-]{43,128}$/.test(value);
}
export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}
export function verifyPkce(verifier: unknown, challenge: string): boolean {
  if (!validPkceVerifier(verifier) || !validPkceChallenge(challenge)) return false;
  const encoded = pkceChallenge(verifier);
  return timingSafeEqual(Buffer.from(encoded), Buffer.from(challenge));
}
