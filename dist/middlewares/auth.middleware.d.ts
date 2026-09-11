import type { Request, Response, NextFunction } from 'express';
export interface AuthenticatedUser {
    id: string;
    email: string;
    role: string;
    jti: string;
}
declare global {
    namespace Express {
        interface Request {
            user?: AuthenticatedUser;
        }
    }
}
/**
 * Verifies the Bearer access token and, critically, checks the token's `jti`
 * against the denylist so a logged-out token is rejected immediately rather
 * than remaining valid for the rest of its lifetime (Requirement 4.3).
 * Verification is stateless apart from the denylist lookup (Requirement 11.1).
 */
export declare function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void>;
/**
 * Guards a route so only users holding one of the allowed roles may pass.
 * Must run after `requireAuth`.
 */
export declare function requireRole(...allowedRoles: string[]): (req: Request, _res: Response, next: NextFunction) => void;
//# sourceMappingURL=auth.middleware.d.ts.map