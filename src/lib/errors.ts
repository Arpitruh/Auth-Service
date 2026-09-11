/**
 * Stable machine-readable error codes returned in the `{ error: { code } }`
 * envelope. Integrating services branch on these, so treat them as a contract.
 */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_REUSE: 'TOKEN_REUSE',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  EMAIL_EXISTS: 'EMAIL_EXISTS',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * An error carrying an HTTP status code and a stable error code so the
 * controller/error-handler layer can translate service-level failures into
 * consistent HTTP responses without leaking internals.
 */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCodeValue,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (
  msg: string,
  code: ErrorCodeValue = ErrorCode.VALIDATION_ERROR,
) => new HttpError(400, code, msg);

export const unauthorized = (
  msg: string,
  code: ErrorCodeValue = ErrorCode.UNAUTHORIZED,
) => new HttpError(401, code, msg);

export const forbidden = (
  msg: string,
  code: ErrorCodeValue = ErrorCode.FORBIDDEN,
) => new HttpError(403, code, msg);

export const notFound = (
  msg: string,
  code: ErrorCodeValue = ErrorCode.NOT_FOUND,
) => new HttpError(404, code, msg);

export const conflict = (
  msg: string,
  code: ErrorCodeValue = ErrorCode.EMAIL_EXISTS,
) => new HttpError(409, code, msg);

export const tooManyRequests = (
  msg: string,
  code: ErrorCodeValue = ErrorCode.RATE_LIMITED,
) => new HttpError(429, code, msg);
