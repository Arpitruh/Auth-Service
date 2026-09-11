/**
 * Deterministic SHA-256 hex digest. Used for hashing high-entropy tokens
 * (refresh tokens, password-reset tokens) before storing them, so a DB dump
 * never exposes usable tokens. A fast deterministic hash is appropriate here
 * (unlike passwords, which use Argon2) because the inputs are already random
 * and we need indexed equality lookups.
 */
export declare function sha256(input: string): string;
/**
 * Generates a cryptographically-random, URL-safe token string. Used for
 * password-reset tokens (the raw value is emailed; only its hash is stored).
 */
export declare function randomToken(bytes?: number): string;
//# sourceMappingURL=hash.d.ts.map