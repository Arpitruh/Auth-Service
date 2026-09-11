import { createHash, randomBytes } from 'node:crypto';
/**
 * Deterministic SHA-256 hex digest. Used for hashing high-entropy tokens
 * (refresh tokens, password-reset tokens) before storing them, so a DB dump
 * never exposes usable tokens. A fast deterministic hash is appropriate here
 * (unlike passwords, which use Argon2) because the inputs are already random
 * and we need indexed equality lookups.
 */
export function sha256(input) {
    return createHash('sha256').update(input).digest('hex');
}
/**
 * Generates a cryptographically-random, URL-safe token string. Used for
 * password-reset tokens (the raw value is emailed; only its hash is stored).
 */
export function randomToken(bytes = 32) {
    return randomBytes(bytes).toString('base64url');
}
//# sourceMappingURL=hash.js.map