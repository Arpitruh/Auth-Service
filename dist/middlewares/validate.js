import { badRequest } from '../lib/errors.js';
/**
 * Validates `req.body` against a Zod schema before the controller runs
 * (Requirement 5.1/5.2). On success, replaces `req.body` with the parsed
 * (and transformed, e.g. normalized email) value. On failure, forwards a
 * VALIDATION_ERROR to the centralized error handler with the first issue's
 * message — full details are logged there, not returned, to avoid leaking
 * schema internals.
 */
export function validate(schema) {
    return (req, _res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            const first = result.error.issues[0];
            const message = first?.message ?? 'Invalid request body.';
            next(badRequest(message));
            return;
        }
        req.body = result.data;
        next();
    };
}
//# sourceMappingURL=validate.js.map