import { randomBytes, createHash } from 'node:crypto';
import { Pool } from 'pg';
import { ENV } from '../config/env.js';

const pool = ENV.CONTROL_PLANE_DATABASE_URL
  ? new Pool({ connectionString: ENV.CONTROL_PLANE_DATABASE_URL, max: 3 }) : null;
function control(): Pool {
  if (!pool) throw new Error('Central registry is not configured');
  return pool;
}
export function digestClientKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
export function generateClientKey(): string {
  return 'authsk_' + randomBytes(32).toString('base64url');
}
export interface VerifiedTenant {
  id: string;
  clientId: string;
  secretRef: string;
  schemaVersion: string;
  status: 'ACTIVE';
}
/** Internal only, call after administrator authentication. Raw secret returned once. */
export async function issueApplicationKey(applicationId: string, label: string): Promise<string> {
  if (!/^[0-9a-f-]{36}$/i.test(applicationId) || !/^[a-zA-Z0-9 _-]{2,100}$/.test(label)) {
    throw new Error('Invalid key issuance request');
  }
  const key = generateClientKey();
  const result = await control().query(
    `INSERT INTO "ControlApplicationCredential" ("applicationId", "keyDigest", "label")
     SELECT a."id", $2, $3 FROM "ControlApplication" a
     INNER JOIN "ControlDatabaseBinding" b ON b."applicationId" = a."id"
     WHERE a."id" = $1 AND a."status" = 'ACTIVE' AND b."provisionState" = 'READY'
     RETURNING "id"`,
    [applicationId, digestClientKey(key), label],
  );
  if (result.rowCount !== 1) throw new Error('Application is not active or ready');
  return key;
}
/** Server-side trust boundary: client ID is public, key proves caller identity.
 * A mismatch, suspended app, incomplete DB, or revoked key always fails closed.
 */
export async function verifyApplicationKey(clientId: string, key: string): Promise<VerifiedTenant | null> {
  if (!/^authapp_[a-zA-Z0-9_-]{24}$/.test(clientId) ||
      !/^authsk_[a-zA-Z0-9_-]{43}$/.test(key)) return null;
  const result = await control().query<VerifiedTenant>(`
    SELECT a."id", a."clientId", a."status", b."secretRef", b."schemaVersion"
    FROM "ControlApplication" a
    JOIN "ControlDatabaseBinding" b ON b."applicationId"=a."id"
    JOIN "ControlApplicationCredential" c ON c."applicationId"=a."id"
    WHERE a."clientId"=$1 AND a."status"='ACTIVE'
      AND b."provisionState"='READY' AND b."secretRef" IS NOT NULL
      AND b."schemaVersion" IS NOT NULL
      AND c."keyDigest"=$2 AND c."revokedAt" IS NULL
    LIMIT 1`, [clientId, digestClientKey(key)]);
  return result.rows[0] ?? null;
}
/** Internal-only key revocation by administrative action. */
export async function revokeApplicationKey(applicationId: string, digest: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(applicationId) || !/^[0-9a-f]{64}$/.test(digest)) {
    throw new Error('Invalid revocation request');
  }
  await control().query(
    `UPDATE "ControlApplicationCredential" SET "revokedAt"=now()
     WHERE "applicationId"=$1 AND "keyDigest"=$2 AND "revokedAt" IS NULL`,
    [applicationId, digest],
  );
}
export async function closeTenantCredentials(): Promise<void> { await pool?.end(); }

/** Internal relay discovery only; never expose secretRef in public responses.
 * Bounded cursor pagination avoids loading the whole tenant registry at once.
 */
export async function listTenantsForNotificationOutbox(afterId = '', limit = 2): Promise<VerifiedTenant[]> {
  if (!pool) return [];
  const result = await pool.query<VerifiedTenant>(`
    SELECT a."id", a."clientId", a."status", b."secretRef", b."schemaVersion"
    FROM "ControlApplication" a
    JOIN "ControlDatabaseBinding" b ON b."applicationId" = a."id"
    WHERE a."status" = 'ACTIVE' AND b."provisionState" = 'READY'
      AND b."secretRef" IS NOT NULL AND b."schemaVersion" IS NOT NULL
      AND a."id" > $1
    ORDER BY a."id" ASC LIMIT $2
  `, [afterId, Math.max(1, Math.min(10, limit))]);
  return result.rows;
}
