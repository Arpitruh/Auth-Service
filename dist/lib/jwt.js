import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { ENV } from '../config/env.js';
/**
 * Signs an access token, generating a unique `jti` claim so the token can be
 * individually revoked via the denylist on logout (Requirement 4.1).
 */
export function signAccessToken(claims) {
    const jti = randomUUID();
    const payload = { ...claims, jti };
    const options = { expiresIn: ENV.ACCESS_TOKEN_TTL };
    return { token: jwt.sign(payload, ENV.JWT_ACCESS_SECRET, options), jti };
}
export function signRefreshToken(payload) {
    const options = {
        expiresIn: ENV.REFRESH_TOKEN_TTL,
    };
    return jwt.sign(payload, ENV.JWT_REFRESH_SECRET, options);
}
/**
 * Verifies a token against the current secret, then (if configured) against a
 * previous secret for a rotation grace window (Requirement 12.4). Throws if
 * neither verifies.
 */
function verifyWithGrace(token, current, previous) {
    try {
        return jwt.verify(token, current);
    }
    catch (err) {
        if (previous) {
            return jwt.verify(token, previous);
        }
        throw err;
    }
}
export function verifyAccessToken(token) {
    return verifyWithGrace(token, ENV.JWT_ACCESS_SECRET, ENV.JWT_ACCESS_SECRET_PREVIOUS);
}
export function verifyRefreshToken(token) {
    return verifyWithGrace(token, ENV.JWT_REFRESH_SECRET, ENV.JWT_REFRESH_SECRET_PREVIOUS);
}
/**
 * Remaining lifetime of a decoded token in seconds (>= 0). Used to set the
 * denylist TTL so an entry expires exactly when the token would have.
 */
export function remainingTtlSeconds(payload) {
    if (!payload.exp)
        return 0;
    return Math.max(0, payload.exp - Math.floor(Date.now() / 1000));
}
//# sourceMappingURL=jwt.js.map