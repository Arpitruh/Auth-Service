import { prisma } from '../lib/prisma.js';
import { notFound } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
export const sessionService = {
    /**
     * Lists the user's active (non-revoked, unexpired) sessions. `currentJti`
     * flags the session backing the request, so a UI can label "this device".
     */
    async list(userId, currentJti) {
        const now = new Date();
        const rows = await prisma.refreshToken.findMany({
            where: { userId, revokedAt: null, expiresAt: { gt: now } },
            orderBy: { createdAt: 'desc' },
        });
        return rows.map((r) => ({
            id: r.id,
            createdAt: r.createdAt,
            expiresAt: r.expiresAt,
            device: r.device,
            ip: r.ip,
            current: r.id === currentJti,
        }));
    },
    /**
     * Revokes one session by id, but only if it belongs to the requesting user
     * (Requirement 8.4). Ownership is enforced in the WHERE clause so a user can
     * never revoke another user's session, and a non-owned/absent id yields 404
     * (indistinguishable from "not yours").
     */
    async revoke(userId, sessionId) {
        const result = await prisma.refreshToken.updateMany({
            where: { id: sessionId, userId, revokedAt: null },
            data: { revokedAt: new Date() },
        });
        if (result.count === 0) {
            throw notFound('Session not found.');
        }
        logger.info({ userId, sessionId, event: 'session_revoked' }, 'session revoked by user');
    },
};
//# sourceMappingURL=session.service.js.map