import { createApp } from './app.js';
import { ENV } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { kv } from './lib/store.js';
const app = createApp();
const server = app.listen(ENV.PORT, () => {
    logger.info({ port: ENV.PORT }, 'Auth Service running');
});
/**
 * Graceful shutdown (Requirement 11.4): stop accepting new connections, let
 * in-flight requests finish, then close DB/KV before exiting. A hard timeout
 * guards against hung connections.
 */
async function shutdown(signal) {
    logger.info({ signal, event: 'shutdown' }, 'shutting down');
    const forceTimer = setTimeout(() => {
        logger.error({ event: 'shutdown_timeout' }, 'forced exit after timeout');
        process.exit(1);
    }, 10_000);
    forceTimer.unref();
    server.close(async () => {
        try {
            await prisma.$disconnect();
            await kv.close();
            logger.info({ event: 'shutdown_complete' }, 'clean shutdown');
            process.exit(0);
        }
        catch (err) {
            logger.error({ err, event: 'shutdown_error' }, 'error during shutdown');
            process.exit(1);
        }
    });
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
export { app, server };
//# sourceMappingURL=server.js.map