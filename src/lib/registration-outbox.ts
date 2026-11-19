import { prisma } from './prisma.js';
import { ENV } from '../config/env.js';
import { logger } from './logger.js';

type Row = { id: string; userId: string; recipient: string; attempts: number };

const PERIOD_MS = 2_000;

/** Outbox relay for the legacy Auth registration API.
 * Registration and this row are committed in the same PostgreSQL transaction.
 * Retries are safe: Notification Service dedupes user.registered by app+userId.
 */
export async function dispatchRegistrationEvents(): Promise<number> {
  if (!ENV.NOTIFICATION_SERVICE_URL || !ENV.NOTIFICATION_API_KEY) return 0;
  const rows = await prisma.$queryRaw<Row[]>`
    UPDATE "registration_event_outbox" o
    SET "claimedUntil" = now() + interval '60 seconds',
        "attempts" = "attempts" + 1
    WHERE o.id IN (
      SELECT id FROM "registration_event_outbox"
      WHERE "deliveredAt" IS NULL AND "nextAttemptAt" <= now()
        AND ("claimedUntil" IS NULL OR "claimedUntil" < now())
      ORDER BY "nextAttemptAt"
      LIMIT 30 FOR UPDATE SKIP LOCKED
    )
    RETURNING o.id, o."userId", o.recipient, o.attempts
  `;

  for (const row of rows) {
    try {
      const response = await fetch(new URL('/api/v1/notifications/events/user.registered',
        ENV.NOTIFICATION_SERVICE_URL), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': ENV.NOTIFICATION_API_KEY },
        body: JSON.stringify({ userId: row.userId, email: row.recipient }),
        signal: AbortSignal.timeout(8_000),
      });
      if (response.status !== 200 && response.status !== 202) {
        throw new Error('Notification Service returned HTTP ' + response.status);
      }
      await prisma.registrationEventOutbox.updateMany({
        where: { id: row.id, deliveredAt: null },
        data: { deliveredAt: new Date(), claimedUntil: null, lastError: null },
      });
      logger.info({ event: 'registration_outbox_delivered', outboxId: row.id },
        'registration event accepted by notification service');
    } catch (error) {
      const backoff = Math.min(300_000, 1000 * 2 ** Math.min(row.attempts, 8));
      await prisma.registrationEventOutbox.updateMany({
        where: { id: row.id, deliveredAt: null },
        data: { claimedUntil: null, nextAttemptAt: new Date(Date.now() + backoff),
          lastError: error instanceof Error ? error.name : 'UnknownError' },
      }).catch(dbError => logger.error({ err: dbError, outboxId: row.id },
        'registration outbox failure could not be persisted'));
    }
  }
  return rows.length;
}

export function startRegistrationOutboxRelay(): { stop(): Promise<void> } {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let active: Promise<void> = Promise.resolve();
  const tick = (): void => {
    if (stopped) return;
    active = (async () => {
      try {
        let n: number;
        do { n = await dispatchRegistrationEvents(); }
        while (!stopped && n === 30);
      } catch (err) {
        logger.error({ err, event: 'registration_outbox_poll_error' },
          'registration outbox relay poll failed');
      }
    })().finally(() => { if (!stopped) timer = setTimeout(tick, PERIOD_MS); });
  };
  tick();
  return { stop: async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    await active;
  }};
}
