/**
 * Per-request logging middleware. Attaches a child logger to each request and
 * tags every line with the request id set by the requestId middleware.
 */
export declare const httpLogger: import("pino-http").HttpLogger<import("http").IncomingMessage, import("http").ServerResponse<import("http").IncomingMessage>, never>;
//# sourceMappingURL=http-logger.d.ts.map