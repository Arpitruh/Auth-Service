import { z } from 'zod';
export declare const registerSchema: z.ZodObject<{
    email: z.ZodPipe<z.ZodString, z.ZodString>;
    password: z.ZodString;
}, z.core.$strip>;
export declare const loginSchema: z.ZodObject<{
    email: z.ZodPipe<z.ZodString, z.ZodString>;
    password: z.ZodString;
}, z.core.$strip>;
export declare const forgotPasswordSchema: z.ZodObject<{
    email: z.ZodPipe<z.ZodString, z.ZodString>;
}, z.core.$strip>;
export declare const resetPasswordSchema: z.ZodObject<{
    token: z.ZodString;
    password: z.ZodString;
}, z.core.$strip>;
export declare const updateRoleSchema: z.ZodObject<{
    role: z.ZodEnum<{
        ADMIN: "ADMIN";
        USER: "USER";
    }>;
}, z.core.$strip>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
/** Allowed roles, exported for reuse in the admin service. */
export declare const ALLOWED_ROLES: readonly ['USER', 'ADMIN'];
export type Role = (typeof ALLOWED_ROLES)[number];
//# sourceMappingURL=auth.schema.d.ts.map