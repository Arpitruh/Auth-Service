import { ENV } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { tenantWelcomeConfig } from '../lib/welcome-notification.js';
import { tenantPool } from './database-pool.js';
import { listTenantsForNotificationOutbox } from './client-credentials.js';

type Row = { id: string; userId: string; recipient: string; attempts: number };

let cursor = '';

/** Poll a bounded subset of active tenant DBs each tick.
 * Requires TENANT_REGISTRATION_OUTBOX_ENABLED and migrated tenant schemas.
 */
export async function dispatchTenantRegistrationEventsOnce(): Promise<number> {
  if (!ENV.TENANT_REGISTRATION_OUTBOX_ENABLED || !ENV.NOTIFICATION_SERVICE_URL) return 0;
  let tenants = await listTenantsForNotificationOutbox(cursor, 2);
  if (!tenants.length && cursor) {
    cursor = '';
    tenants = await listTenantsForNotificationOutbox(cursor, 2);
  }
  if (!tenants.length) return 0;
  cursor = tenants[tenants.length - 1]!.id;
  let delivered = 0;
  for (const tenant of tenants) {
    try {
      const config = tenantWelcomeConfig(tenant.id);
      // Do not dequeue unconfigured tenant events: retry after configuration.
      if (!config) continue;
      const accepted = await tenantPool.withTenant(tenant, async db => {
        const rows = await db.$queryRaw<Row[]>`
          UPDATE "registration_event_outbox" o
          SET "claimedUntil" = now() + interval '60 seconds',
              "attempts" = "attempts" + 1
          WHERE o.id IN (
            SELECT id FROM "registration_event_outbox"
            WHERE "deliveredAt" IS NULL AND "nextAttemptAt" <= now()
              AND ("claimedUntil" IS NULL OR "claimedUntil" < now())
            ORDER BY "nextAttemptAt" LIMIT 5 FOR UPDATE SKIP LOCKED
          )
          RETURNING o.id, o."userId", o.recipient, o.attempts
        `;
        let succeeded = 0;
        for (const row of rows) {
          try {
            const response = await fetch(new URL('/api/v1/notifications/events/user.registered',
              ENV.NOTIFICATION_SERVICE_URL), {
              method: 'POST',
              headers: { 'content-type': 'application/json', 'x-api-key': config.apiKey },
              body: JSON.stringify({ userId: row.userId, email: row.recipient }),
              signal: AbortSignal.timeout(8_000),
            });
            if (response.status !== 200 && response.status !== 202)
              throw new Error('Notification service rejected event (HTTP ' + response.status + ')');
            await db.registrationEventOutbox.updateMany({
              where: { id: row.id, deliveredAt: null },
              data: { deliveredAt: new Date(), claimedUntil: null, lastError: null },
            });
            succeeded++;
          } catch (error) {
            const backoff = Math.min(300_000, 1000 * 2 ** Math.min(row.attempts, 8));
            await db.registrationEventOutbox.updateMany({
              where: { id: row.id, deliveredAt: null },
              data: { claimedUntil: null, nextAttemptAt: new Date(Date.now() + backoff),
                lastError: error instanceof Error ? error.name : 'UnknownError' },
            });
          }
        }
        return succeeded;
      });
      delivered += accepted;
    } catch (error) {
      // An unhealthy tenant must not block outbox dispatch for other tenants.
      logger.error({ err: error, tenantId: tenant.id, event: 'tenant_outbox_failure' },
        'tenant registration outbox relay failed');
    }
  }
  return delivered;
}

export function startTenantRegistrationOutboxRelay(): { stop(): Promise<void> } {
  if (!ENV.TENANT_REGISTRATION_OUTBOX_ENABLED) return { stop: async () => {} };
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let active: Promise<void> = Promise.resolve();
  const tick = (): void => {
    if (stopped) return;
    active = dispatchTenantRegistrationEventsOnce()
      .then(count => {
        if (count) logger.info({ count, event: 'tenant_outbox_delivered' },
          'tenant registration events accepted');
      })
      .catch(err => logger.error({ err, event: 'tenant_outbox_poll_failed' },
        'tenant outbox dispatch failed'))
      .finally(() => { if (!stopped) timer = setTimeout(tick, 3_000); });
  };
  tick();
  return { stop: async () => { stopped = true; if (timer) clearTimeout(timer); await active; } };
}
