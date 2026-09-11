import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { kv } from '../lib/store.js';
import { logger } from '../lib/logger.js';
const router = Router();
/**
 * Liveness: the process is up and serving. No external dependencies checked,
 * so a load balancer won't cycle the pod just because a downstream is slow.
 */
router.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
});
/**
 * Readiness: can we actually serve traffic? Verifies DB connectivity and the
 * KV store. Returns 503 if any dependency is unavailable so the LB can hold
 * traffic until the instance is truly ready (Requirement 8.8).
 */
router.get('/ready', async (_req, res) => {
    const checks = { db: 'ok', kv: 'ok' };
    try {
        await prisma.$queryRaw `SELECT 1`;
    }
    catch (err) {
        checks.db = 'error';
        logger.error({ err, event: 'readiness_db_fail' }, 'DB readiness check failed');
    }
    try {
        await kv.set('readiness:probe', '1', 5);
        await kv.get('readiness:probe');
    }
    catch (err) {
        checks.kv = 'error';
        logger.error({ err, event: 'readiness_kv_fail' }, 'KV readiness check failed');
    }
    const healthy = Object.values(checks).every((v) => v === 'ok');
    res.status(healthy ? 200 : 503).json({ status: healthy ? 'ready' : 'unavailable', checks });
});
export const healthRoutes = router;
//# sourceMappingURL=health.routes.js.map