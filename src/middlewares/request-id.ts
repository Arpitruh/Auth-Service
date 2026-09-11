import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

// Augment Express' Request so downstream code can read req.id.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

const HEADER = 'x-request-id';

/**
 * Attaches a request id to every request (Requirement 12.7): reuses an
 * incoming `x-request-id` when present (for cross-service tracing) or
 * generates a UUID. Echoed back in the response header and consumed by the
 * logger and error handler.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers[HEADER];
  const id =
    (Array.isArray(incoming) ? incoming[0] : incoming)?.trim() || randomUUID();
  req.id = id;
  res.setHeader(HEADER, id);
  next();
}
