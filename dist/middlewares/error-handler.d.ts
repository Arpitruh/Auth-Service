import type { Request, Response, NextFunction } from 'express';
/**
 * Centralized error handler. Serializes every failure into the stable envelope
 * `{ error: { code, message, requestId } }` (Requirement 10.3). Known error
 * types map to appropriate status/codes; anything unexpected is logged in full
 * server-side and returned as a generic 500 so internals never leak.
 */
export declare function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void;
/** 404 handler for unmatched routes, emitting the same error envelope. */
export declare function notFoundHandler(req: Request, res: Response): void;
//# sourceMappingURL=error-handler.d.ts.map