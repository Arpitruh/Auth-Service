import { authService } from '../services/auth.service.js';
import { ENV, REFRESH_TOKEN_TTL_DAYS } from '../config/env.js';
/**
 * CSRF / cookie policy decision (Phase 2, spec section 6):
 *
 * DECISION: same-origin only. The refresh cookie stays `SameSite=Strict`, and
 * we deliberately do NOT implement a double-submit CSRF token.
 *
 * REASONING: with `SameSite=Strict` the browser never attaches the refresh
 * cookie to any cross-site request, which is exactly the vector CSRF tokens
 * defend against for cookie-based flows. A malicious origin therefore cannot
 * drive /refresh or /logout on the user's behalf. This keeps the design
 * dependency-free at the cost of cross-origin cookie use.
 *
 * IF A CROSS-ORIGIN FRONTEND IS INTRODUCED LATER: relax this cookie to
 * `SameSite=Lax` (or `None` + `Secure` if truly cross-site), add a
 * double-submit CSRF token (readable cookie + required custom header on
 * /refresh and /logout), and verify it server-side. Do not simply loosen
 * SameSite without adding the token.
 */
function refreshCookieOptions() {
    return {
        httpOnly: true,
        secure: ENV.IS_PRODUCTION,
        sameSite: 'strict',
        path: '/api/v1/auth',
        maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    };
}
function setRefreshCookie(res, token) {
    res.cookie(ENV.REFRESH_COOKIE_NAME, token, refreshCookieOptions());
}
function clearRefreshCookie(res) {
    res.clearCookie(ENV.REFRESH_COOKIE_NAME, {
        ...refreshCookieOptions(),
        maxAge: undefined,
    });
}
/** Extracts optional device/IP metadata to record against a session. */
function issueContext(req) {
    const ua = req.headers['user-agent'];
    return {
        device: Array.isArray(ua) ? ua[0] : ua,
        ip: req.ip,
    };
}
/** Reads the Bearer access token from the Authorization header, if present. */
function bearerToken(req) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer '))
        return undefined;
    return header.slice('Bearer '.length).trim();
}
export const authController = {
    async register(req, res, next) {
        try {
            const { email, password } = req.body ?? {};
            const { user, tokens } = await authService.register(email, password, issueContext(req));
            setRefreshCookie(res, tokens.refreshToken);
            res.status(201).json({ user, accessToken: tokens.accessToken });
        }
        catch (err) {
            next(err);
        }
    },
    async login(req, res, next) {
        try {
            const { email, password } = req.body ?? {};
            const { user, tokens } = await authService.login(email, password, issueContext(req));
            setRefreshCookie(res, tokens.refreshToken);
            res.status(200).json({ user, accessToken: tokens.accessToken });
        }
        catch (err) {
            next(err);
        }
    },
    async refresh(req, res, next) {
        try {
            const presented = req.cookies?.[ENV.REFRESH_COOKIE_NAME];
            const { user, tokens } = await authService.refresh(presented, issueContext(req));
            setRefreshCookie(res, tokens.refreshToken);
            res.status(200).json({ user, accessToken: tokens.accessToken });
        }
        catch (err) {
            next(err);
        }
    },
    async logout(req, res, next) {
        try {
            const presentedRefresh = req.cookies?.[ENV.REFRESH_COOKIE_NAME];
            await authService.logout(presentedRefresh, bearerToken(req));
            clearRefreshCookie(res);
            res.status(200).json({ message: 'Logged out.' });
        }
        catch (err) {
            next(err);
        }
    },
    async me(req, res) {
        // `requireAuth` guarantees req.user exists here.
        const { id, email, role } = req.user;
        res.status(200).json({ user: { id, email, role } });
    },
};
//# sourceMappingURL=auth.controller.js.map