import { describe, expect, it } from 'vitest';
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
});
