import argon2 from 'argon2';
import { prisma } from '../lib/prisma.js';
import { ENV } from '../config/env.js';
import { sha256, randomToken } from '../lib/hash.js';
import { badRequest, ErrorCode } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
const RESET_TTL_MS = ENV.RESET_TOKEN_TTL_MINUTES * 60 * 1000;
export const passwordResetService = {
    /**
     * Issues a single-use, short-TTL reset token. Only the token's hash is
     * stored; the raw token is returned to the caller for delivery. Always
     * behaves the same whether or not the email exists (the controller always
     * returns 200) to avoid user enumeration (Requirement 8.5).
     *
     * Returns the raw token when a user exists, else null (nothing to deliver).
     */
    async requestReset(email) {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            logger.info({ event: 'forgot_password_unknown' }, 'password reset requested for unknown email');
            return null;
        }
        const rawToken = randomToken();
        await prisma.passwordResetToken.create({
            data: {
                tokenHash: sha256(rawToken),
                userId: user.id,
                expiresAt: new Date(Date.now() + RESET_TTL_MS),
            },
        });
        logger.info({ userId: user.id, event: 'forgot_password' }, 'password reset token issued');
        return rawToken;
    },
    /**
     * Consumes a reset token: verifies hash + expiry + unused, updates the
     * password (Argon2), marks the token used, and invalidates ALL refresh
     * tokens for that user so a reset forces re-login everywhere
     * (Requirements 8.6, 9.4).
     */
    async resetPassword(rawToken, newPassword) {
        const tokenHash = sha256(rawToken);
        const record = await prisma.passwordResetToken.findUnique({
            where: { tokenHash },
        });
        const invalid = () => badRequest('Invalid or expired reset token.', ErrorCode.VALIDATION_ERROR);
        if (!record || record.usedAt !== null) {
            throw invalid();
        }
        if (record.expiresAt.getTime() < Date.now()) {
            throw invalid();
        }
        const passwordHash = await argon2.hash(newPassword);
        // Atomically: set new password, mark token used, revoke all refresh tokens.
        await prisma.$transaction([
            prisma.user.update({
                where: { id: record.userId },
                data: { password: passwordHash },
            }),
            prisma.passwordResetToken.update({
                where: { id: record.id },
                data: { usedAt: new Date() },
            }),
            prisma.refreshToken.updateMany({
                where: { userId: record.userId, revokedAt: null },
                data: { revokedAt: new Date() },
            }),
        ]);
        logger.warn({ userId: record.userId, event: 'password_reset' }, 'password reset; all sessions invalidated');
    },
};
//# sourceMappingURL=password-reset.service.js.map