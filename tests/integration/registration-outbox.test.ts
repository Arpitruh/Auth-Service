import { describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';

/** Explicitly opt-in against a migrated, isolated staging DATABASE_URL.
 * RUN_DB_TESTS=1 DATABASE_URL=... npm test
 * This suite creates real users; NEVER run it on production.
 */
describe.skipIf(process.env.RUN_DB_TESTS !== '1')('registration outbox persistence', () => {
  it('commits a registration outbox record with the user and refresh token', async () => {
    const { prisma } = await import('../../src/lib/prisma.js');
    const { authService } = await import('../../src/services/auth.service.js');
    const email = 'outbox-' + crypto.randomUUID() + '@example.test';
    let id: string | undefined;
    try {
      const result = await authService.register(email, 'TesT!Passw0rd');
      id = result.user.id;
      const row = await prisma.registrationEventOutbox.findUnique({ where: { userId: id } });
      expect(row).toMatchObject({ userId: id, recipient: email });
      expect(row?.deliveredAt).toBeNull();
      expect(await prisma.refreshToken.count({ where: { userId: id } })).toBe(1);
    } finally {
      if (id) await prisma.user.delete({ where: { id } });
    }
  });
  it('keeps a rejected registration event pending and marks it delivered after retry', async () => {
    // This test exercises the actual PostgreSQL outbox and relay, but never
    // contacts Notification Service or sends an email.
    const { prisma } = await import('../../src/lib/prisma.js');
    const { ENV } = await import('../../src/config/env.js');
    const { authService } = await import('../../src/services/auth.service.js');
    const { dispatchRegistrationEvents } = await import('../../src/lib/registration-outbox.js');
    const email = 'relay-' + crypto.randomUUID() + '@example.test';
    const originalUrl = ENV.NOTIFICATION_SERVICE_URL;
    const originalKey = ENV.NOTIFICATION_API_KEY;
    const originalFetch = globalThis.fetch;
    let id: string | undefined;

    try {
      Object.assign(ENV, {
        NOTIFICATION_SERVICE_URL: 'https://notifications.example.test',
        NOTIFICATION_API_KEY: 'ci-only-test-key-000000000000000000000000',
      });
      const mockedFetch = vi.fn()
        .mockResolvedValueOnce({ status: 503 })
        .mockResolvedValueOnce({ status: 202 });
      globalThis.fetch = mockedFetch as typeof fetch;

      const registered = await authService.register(email, 'TesT!Passw0rd');
      id = registered.user.id;
      const first = await prisma.registrationEventOutbox.findUniqueOrThrow({
        where: { userId: id },
      });
      expect(first.deliveredAt).toBeNull();

      // Other CI suites can create pending users at the same time. Limit
      // this relay exercise to our row, rather than intercepting their events.
      vi.spyOn(prisma, '$queryRaw')
        .mockResolvedValueOnce([{ id: first.id, userId: id, recipient: email, attempts: 1 }])
        .mockResolvedValueOnce([{ id: first.id, userId: id, recipient: email, attempts: 2 }])
        .mockResolvedValue([]);
      await dispatchRegistrationEvents();
      expect(mockedFetch).toHaveBeenCalledTimes(1);
      const afterFailure = await prisma.registrationEventOutbox.findUniqueOrThrow({
        where: { userId: id },
      });
      expect(afterFailure.deliveredAt).toBeNull();
      expect(afterFailure.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() - 1000);

      // Avoid waiting for the production backoff delay in CI.
      await prisma.registrationEventOutbox.update({
        where: { userId: id },
        data: { nextAttemptAt: new Date(Date.now() - 1000), claimedUntil: null },
      });
      await dispatchRegistrationEvents();
      expect(mockedFetch).toHaveBeenCalledTimes(2);

      const accepted = await prisma.registrationEventOutbox.findUniqueOrThrow({
        where: { userId: id },
      });
      expect(accepted.deliveredAt).not.toBeNull();
      expect(mockedFetch).toHaveBeenCalledTimes(2);
      for (const call of mockedFetch.mock.calls) {
        const [url, options] = call as [URL, RequestInit];
        expect(String(url)).toBe('https://notifications.example.test/api/v1/notifications/events/user.registered');
        expect(options.headers).toMatchObject({
          'x-api-key': 'ci-only-test-key-000000000000000000000000',
        });
        expect(JSON.parse(String(options.body))).toEqual({ userId: id, email });
      }
      // An accepted event is not sent again on the next poll.
      await dispatchRegistrationEvents();
      expect(mockedFetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.restoreAllMocks();
      globalThis.fetch = originalFetch;
      Object.assign(ENV, {
        NOTIFICATION_SERVICE_URL: originalUrl,
        NOTIFICATION_API_KEY: originalKey,
      });
      if (id) await prisma.user.delete({ where: { id } });
    }
  });

});
