import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ENV } from '../config/env.js';
/**
 * A single shared PrismaClient instance for the whole process.
 *
 * Prisma 7 no longer bundles a query engine, so we connect through a driver
 * adapter (@prisma/adapter-pg) built from DATABASE_URL. In development, module
 * reloading (tsx watch) can create many clients and exhaust the connection
 * pool, so we cache the instance on globalThis and reuse it across reloads.
 */
const globalForPrisma = globalThis;
function createPrismaClient() {
    // Explicit pool sizing (Requirement 11.3): cap connections per instance so
    // total connections stay within Postgres limits as instances scale out.
    // Consider PgBouncer as the instance count grows.
    const adapter = new PrismaPg({
        connectionString: ENV.DATABASE_URL,
        max: ENV.DB_POOL_SIZE,
    });
    return new PrismaClient({
        adapter,
        log: ENV.IS_PRODUCTION ? ['error'] : ['warn', 'error'],
    });
}
export const prisma = globalForPrisma.prisma ?? createPrismaClient();
if (!ENV.IS_PRODUCTION) {
    globalForPrisma.prisma = prisma;
}
//# sourceMappingURL=prisma.js.map