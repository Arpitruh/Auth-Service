/**
 * Stable machine-readable error codes returned in the `{ error: { code } }`
 * envelope. Integrating services branch on these, so treat them as a contract.
 */
export declare const ErrorCode: {
    readonly VALIDATION_ERROR: 'VALIDATION_ERROR';
    readonly INVALID_CREDENTIALS: 'INVALID_CREDENTIALS';
    readonly ACCOUNT_LOCKED: 'ACCOUNT_LOCKED';
    readonly UNAUTHORIZED: 'UNAUTHORIZED';
    readonly TOKEN_EXPIRED: 'TOKEN_EXPIRED';
    readonly TOKEN_REUSE: 'TOKEN_REUSE';
    readonly FORBIDDEN: 'FORBIDDEN';
    readonly NOT_FOUND: 'NOT_FOUND';
    readonly EMAIL_EXISTS: 'EMAIL_EXISTS';
    readonly RATE_LIMITED: 'RATE_LIMITED';
    readonly INTERNAL_ERROR: 'INTERNAL_ERROR';
};
export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];
/**
 * An error carrying an HTTP status code and a stable error code so the
 * controller/error-handler layer can translate service-level failures into
 * consistent HTTP responses without leaking internals.
 */
export declare class HttpError extends Error {
    readonly statusCode: number;
    readonly code: ErrorCodeValue;
    constructor(statusCode: number, code: ErrorCodeValue, message: string);
}
export declare const badRequest: (msg: string, code?: ErrorCodeValue) => HttpError;
export declare const unauthorized: (msg: string, code?: ErrorCodeValue) => HttpError;
export declare const forbidden: (msg: string, code?: ErrorCodeValue) => HttpError;
export declare const notFound: (msg: string, code?: ErrorCodeValue) => HttpError;
export declare const conflict: (msg: string, code?: ErrorCodeValue) => HttpError;
export declare const tooManyRequests: (msg: string, code?: ErrorCodeValue) => HttpError;
//# sourceMappingURL=errors.d.ts.map