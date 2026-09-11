import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { HttpError, ErrorCode } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

/**
 * Centralized error handler. Serializes every failure into the stable envelope
 * `{ error: { code, message, requestId } }` (Requirement 10.3). Known error
 * types map to appropriate status/codes; anything unexpected is logged in full
 * server-side and returned as a generic 500 so internals never leak.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const requestId = req.id;

  if (err instanceof HttpError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, requestId },
    });
    return;
  }

  if (err instanceof ZodError) {
    const first = err.issues[0];
    res.status(400).json({
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: first?.message ?? 'Invalid request.',
        requestId,
      },
    });
    return;
  }

  // Prisma unique-constraint violation → 409.
  if (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  ) {
    res.status(409).json({
      error: {
        code: ErrorCode.EMAIL_EXISTS,
        message: 'A resource with that value already exists.',
        requestId,
      },
    });
    return;
  }

  // Unknown error: log full detail, return generic message.
  logger.error({ err, requestId, event: 'unhandled_error' }, 'unhandled error');
  res.status(500).json({
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Internal server error.',
      requestId,
    },
  });
}

/** 404 handler for unmatched routes, emitting the same error envelope. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: ErrorCode.NOT_FOUND,
      message: 'Route not found.',
      requestId: req.id,
    },
  });
}
