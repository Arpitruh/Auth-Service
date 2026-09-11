import { pino } from 'pino';
import { ENV } from '../config/env.js';
/**
 * Structured logger (Requirement 10.1). Sensitive fields are redacted so that
 * passwords, tokens, cookies, and Authorization headers never reach the logs.
 */
export const logger = pino({
    level: ENV.LOG_LEVEL,
    redact: {
        paths: [
            'password',
            'newPassword',
            'token',
            'accessToken',
            'refreshToken',
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
            '*.password',
            '*.token',
        ],
        censor: '[REDACTED]',
    },
    // Pretty transport only in dev keeps prod logs as JSON for aggregation.
    ...(ENV.IS_PRODUCTION
        ? {}
        : {
            transport: {
                target: 'pino-pretty',
                options: { colorize: true, translateTime: 'SYS:standard' },
            },
        }),
});
//# sourceMappingURL=logger.js.map