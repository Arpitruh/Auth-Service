import type { Request, Response, NextFunction } from 'express';
import type { ZodType } from 'zod';
/**
 * Validates `req.body` against a Zod schema before the controller runs
 * (Requirement 5.1/5.2). On success, replaces `req.body` with the parsed
 * (and transformed, e.g. normalized email) value. On failure, forwards a
 * VALIDATION_ERROR to the centralized error handler with the first issue's
 * message — full details are logged there, not returned, to avoid leaking
 * schema internals.
 */
export declare function validate<T>(schema: ZodType<T>): (req: Request, _res: Response, next: NextFunction) => void;
//# sourceMappingURL=validate.d.ts.map