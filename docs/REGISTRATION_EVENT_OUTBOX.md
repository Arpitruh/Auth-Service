# Reliable registration → Notification Service event emission

Status: draft until Notification Service's Phase 1 outbox PR is deployed and
confirmed stable. Do not merge this PR first.

The **legacy** `POST /api/v1/auth/register` flow now writes three records in
one transaction: User, initial RefreshToken, RegistrationEventOutbox. It
returns HTTP 201 after database commit; it no longer performs a best-effort
network call in the request path.

The relay uses a 60-second database claim lease and `FOR UPDATE SKIP LOCKED`,
then sends `user.registered` to Notification Service with
`NOTIFICATION_API_KEY`. HTTP 200/202 means event accepted or disabled;
other responses are retried with capped exponential backoff. The Notification
endpoint deduplicates per application + immutable user ID.

## Configuration
- `NOTIFICATION_SERVICE_URL`: existing Notification Service URL.
- `NOTIFICATION_API_KEY`: existing backend-only application credential.
- Missing values leave outbox events pending and are not silent drops.

## Monitoring
```sql
SELECT count(*) FROM "registration_event_outbox"
 WHERE "deliveredAt" IS NULL;
SELECT min("createdAt") FROM "registration_event_outbox"
 WHERE "deliveredAt" IS NULL;
SELECT "attempts", "lastError", "nextAttemptAt"
 FROM "registration_event_outbox" WHERE "deliveredAt" IS NULL
 ORDER BY "createdAt" LIMIT 20;
```

## Rollout
1. Migrate isolated staging DB and run `npx prisma generate`, typecheck/tests.
2. Deploy the Notification Service outbox+worker and test a real welcome email.
3. Deploy this Auth outbox. Verify the user record and outbox row are committed
   together under failure and that Notification returns 202/200 exactly once
   logically for repeated event delivery.
4. Before any rollback, drain outstanding outbox rows or retain a compatible
   relay. A rollback that restores the old best-effort HTTP path would strand
   newly written outbox events.

## Known gap
The multi-tenant `/api/v2/tenant/register` path writes into per-tenant
databases. It still uses best-effort `notifyTenantRegistration`.
A tenant-local outbox plus tenant-aware relay is required to extend the same
atomicity guarantee to those registrations. This PR addresses the shared
legacy Auth database only.
