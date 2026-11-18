import { Pool } from 'pg';
import { ENV } from '../config/env.js';
import { createNeonTenantProject } from './neon.js';
import { validateTenantPostgresUrl } from './connection-policy.js';
import { migrateFreshTenantDatabase } from './tenant-migrator.js';
import { saveTenantConnectionSecret } from './secrets.js';
import { markApplicationDatabaseReady } from '../control-plane/lifecycle.js';

const pool = ENV.CONTROL_PLANE_DATABASE_URL
  ? new Pool({ connectionString: ENV.CONTROL_PLANE_DATABASE_URL, max: 3 }) : null;
function control(): Pool { if (!pool) throw new Error('Control plane is disabled'); return pool; }
export type ProvisionRequest =
  | { mode: 'EXTERNAL'; applicationId: string; connectionUrl: string }
  | { mode: 'MANAGED'; applicationId: string };

/** Trusted back-office operation only; never expose directly to browser users.
 * One app may start at most once. Unknown Neon creation outcomes require manual reconciliation.
 */
export async function provisionTenant(request: ProvisionRequest): Promise<{ applicationId: string; schemaVersion: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(request.applicationId)) throw new Error('Invalid application ID');
  const db = await control().connect();
  let slug = '';
  try {
    await db.query('BEGIN');
    const match = await db.query<{ slug: string }>(`
      SELECT a."slug" FROM "ControlApplication" a
      JOIN "ControlDatabaseBinding" b ON b."applicationId"=a."id"
      WHERE a."id"=$1 AND a."status"='DRAFT' AND b."provisionState"='PENDING'
        AND b."mode"=$2
        AND ($2='EXTERNAL' OR b."provider"='NEON') FOR UPDATE OF b
    `, [request.applicationId,request.mode]);
    if (!match.rows[0]) throw new Error('App not eligible for provisioning');
    slug = match.rows[0].slug;
    await db.query('UPDATE "ControlDatabaseBinding" SET "provisionState"=\'PROVISIONING\' WHERE "applicationId"=$1', [request.applicationId]);
    await db.query(
      'INSERT INTO "ControlProvisioningAttempt" ("applicationId") VALUES ($1) ON CONFLICT DO NOTHING',
      [request.applicationId],
    );
    await db.query('COMMIT');
  } catch (e) { await db.query('ROLLBACK'); throw e; }
  finally { db.release(); }

  let projectId: string | undefined;
  try {
    let connectionString: string;
    if (request.mode === 'MANAGED') {
      const created = await createNeonTenantProject('auth-' + slug);
      projectId = created.projectId;
      // Persist the provider resource ID before any subsequent steps can fail.
      await control().query(
        'UPDATE "ControlProvisioningAttempt" SET "providerResourceId"=$2 WHERE "applicationId"=$1',
        [request.applicationId, projectId],
      );
      connectionString = created.connectionUrl;
    } else {
      connectionString = request.connectionUrl;
    }
    validateTenantPostgresUrl(connectionString);
    const schemaVersion = await migrateFreshTenantDatabase(connectionString);
    const secretRef = await saveTenantConnectionSecret(request.applicationId, connectionString);
    await markApplicationDatabaseReady(request.applicationId, secretRef, schemaVersion, 'system:provisioner');
    await control().query(
      'UPDATE "ControlProvisioningAttempt" SET "finishedAt"=now(),"providerResourceId"=$2 WHERE "applicationId"=$1',
      [request.applicationId,projectId ?? null],
    );
    return { applicationId: request.applicationId, schemaVersion };
  } catch {
    await control().query(`
      UPDATE "ControlDatabaseBinding"
      SET "provisionState"='ERROR',"lastErrorCode"='PROVISION_FAILED',"updatedAt"=now()
      WHERE "applicationId"=$1 AND "provisionState"='PROVISIONING'
    `, [request.applicationId]);
    await control().query(
      'UPDATE "ControlProvisioningAttempt" SET "finishedAt"=now(),"lastErrorCode"=$2 WHERE "applicationId"=$1',
      [request.applicationId,'PROVISION_FAILED'],
    );
    throw new Error('Tenant provisioning failed; inspect provider resources before manual recovery');
  }
}
export async function closeProvisioningPool(): Promise<void> { await pool?.end(); }
