import type { Request, Response, NextFunction } from 'express';
declare global {
    namespace Express {
        interface Request {
            id?: string;
        }
    }
}
/**
 * Attaches a request id to every request (Requirement 12.7): reuses an
 * incoming `x-request-id` when present (for cross-service tracing) or
 * generates a UUID. Echoed back in the response header and consumed by the
 * logger and error handler.
 */
export declare function requestId(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=request-id.d.ts.map