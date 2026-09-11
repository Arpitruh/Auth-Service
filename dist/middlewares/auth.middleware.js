import { verifyAccessToken } from '../lib/jwt.js';
import { denylist } from '../lib/store.js';
import { ErrorCode, forbidden, unauthorized } from '../lib/errors.js';
/**
 * Verifies the Bearer access token and, critically, checks the token's `jti`
 * against the denylist so a logged-out token is rejected immediately rather
 * than remaining valid for the rest of its lifetime (Requirement 4.3).
 * Verification is stateless apart from the denylist lookup (Requirement 11.1).
 */
export async function requireAuth(req, _res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        next(unauthorized('Authentication required.'));
        return;
    }
    const token = header.slice('Bearer '.length).trim();
    let payload;
    try {
        payload = verifyAccessToken(token);
    }
    catch {
        next(unauthorized('Invalid or expired access token.', ErrorCode.TOKEN_EXPIRED));
        return;
    }
    if (await denylist.has(payload.jti)) {
        next(unauthorized('Token has been revoked.', ErrorCode.UNAUTHORIZED));
        return;
    }
    req.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        jti: payload.jti,
    };
    next();
}
/**
 * Guards a route so only users holding one of the allowed roles may pass.
 * Must run after `requireAuth`.
 */
export function requireRole(...allowedRoles) {
    return (req, _res, next) => {
        if (!req.user) {
            next(unauthorized('Authentication required.'));
            return;
        }
        if (!allowedRoles.includes(req.user.role)) {
            next(forbidden('Insufficient permissions.'));
            return;
        }
        next();
    };
}
//# sourceMappingURL=auth.middleware.js.map