import { pinoHttp } from 'pino-http';
import { logger } from '../lib/logger.js';

/**
 * Per-request logging middleware. Attaches a child logger to each request and
 * tags every line with the request id set by the requestId middleware.
 */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => (req as { id?: string }).id ?? 'unknown',
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
});
