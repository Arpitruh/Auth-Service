export declare const passwordResetService: {
    /**
     * Issues a single-use, short-TTL reset token. Only the token's hash is
     * stored; the raw token is returned to the caller for delivery. Always
     * behaves the same whether or not the email exists (the controller always
     * returns 200) to avoid user enumeration (Requirement 8.5).
     *
     * Returns the raw token when a user exists, else null (nothing to deliver).
     */
    requestReset(email: string): Promise<string | null>;
    /**
     * Consumes a reset token: verifies hash + expiry + unused, updates the
     * password (Argon2), marks the token used, and invalidates ALL refresh
     * tokens for that user so a reset forces re-login everywhere
     * (Requirements 8.6, 9.4).
     */
    resetPassword(rawToken: string, newPassword: string): Promise<void>;
};
//# sourceMappingURL=password-reset.service.d.ts.map