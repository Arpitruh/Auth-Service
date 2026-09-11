import { z } from 'zod';
import { ENV } from '../config/env.js';
/**
 * Email field: trimmed + lowercased so all uniqueness checks and lookups are
 * case-insensitive and consistent (Requirement 5.3).
 */
const email = z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.string().email('A valid email is required.'));
/**
 * Password field with policy driven by env (Requirement 5.4):
 * min length, and optionally at least one number and one symbol.
 */
const password = z
    .string()
    .min(ENV.PASSWORD_MIN_LENGTH, `Password must be at least ${ENV.PASSWORD_MIN_LENGTH} characters long.`)
    .refine((v) => !ENV.PASSWORD_REQUIRE_NUMBER || /\d/.test(v), {
    message: 'Password must contain at least one number.',
})
    .refine((v) => !ENV.PASSWORD_REQUIRE_SYMBOL || /[^A-Za-z0-9]/.test(v), { message: 'Password must contain at least one symbol.' });
export const registerSchema = z.object({
    email,
    password,
});
// Login must NOT enforce the password policy (a legacy password may predate a
// stricter policy); only require presence.
export const loginSchema = z.object({
    email,
    password: z.string().min(1, 'Password is required.'),
});
export const forgotPasswordSchema = z.object({
    email,
});
export const resetPasswordSchema = z.object({
    token: z.string().min(1, 'Reset token is required.'),
    password,
});
export const updateRoleSchema = z.object({
    role: z.enum(['USER', 'ADMIN']),
});
/** Allowed roles, exported for reuse in the admin service. */
export const ALLOWED_ROLES = ['USER', 'ADMIN'];
//# sourceMappingURL=auth.schema.js.map