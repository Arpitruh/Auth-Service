import { Pool } from 'pg';
import { ENV } from '../config/env.js';
import { distinctDatabaseTargets } from './registry.js';

const url = ENV.CONTROL_PLANE_DATABASE_URL;
if (url && !distinctDatabaseTargets(url, ENV.DATABASE_URL)) {
  throw new Error('Control-plane and legacy user databases must be distinct');
}
const pool = url ? new Pool({ connectionString: url, max: Math.min(ENV.DB_POOL_SIZE, 5) }) : null;
function connection(): Pool {
  if (!pool) throw new Error('Control plane is disabled');
  return pool;
}
function validId(id: string): boolean { return /^[a-f0-9-]{36}$/i.test(id); }
function validActor(actor: string): boolean { return /^system:[a-z0-9-]{2,50}$/.test(actor); }

/** Called only by the trusted future provisioner, never by unauthenticated clients.
 * Secret refs (e.g. vault path) must not contain connection strings or passwords.
 */
export async function markApplicationDatabaseReady(
  appId: string, secretRef: string, schemaVersion: string, actor: string,
): Promise<void> {
  if (!validId(appId) || !validActor(actor) ||
      !/^secret:\/\/[a-z0-9/_-]{4,200}$/.test(secretRef) ||
      !/^\d{4}[a-z0-9_-]{0,60}$/.test(schemaVersion)) {
    throw new Error('Invalid provisioner input');
  }
  const client = await connection().connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE "ControlDatabaseBinding"
       SET "secretRef"=$2, "schemaVersion"=$3, "provisionState"='READY', "lastErrorCode"=NULL, "updatedAt"=now()
       WHERE "applicationId"=$1 AND "provisionState" IN ('PENDING','PROVISIONING','ERROR')`,
      [appId,secretRef,schemaVersion],
    );
    if (result.rowCount !== 1) throw new Error('Database is not eligible for activation');
    await client.query(
      `INSERT INTO "ControlApplicationEvent" ("applicationId","action","actor")
       VALUES ($1,'DATABASE_READY',$2)`, [appId,actor],
    );
    await client.query('COMMIT');
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
}

/** Fail closed: cannot activate without an initialized, versioned dedicated database. */
export async function activateApplication(appId: string, actor: string): Promise<boolean> {
  if (!validId(appId) || !validActor(actor)) throw new Error('Invalid activation context');
  const client = await connection().connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE "ControlApplication" a SET "status"='ACTIVE',"updatedAt"=now()
       WHERE a."id"=$1 AND a."status"='DRAFT'
       AND EXISTS (SELECT 1 FROM "ControlDatabaseBinding" b WHERE b."applicationId"=a."id"
         AND b."provisionState"='READY' AND b."secretRef" IS NOT NULL AND b."schemaVersion" IS NOT NULL)`,
      [appId],
    );
    if (result.rowCount === 1) {
      await client.query(
        `INSERT INTO "ControlApplicationEvent" ("applicationId","action","actor")
         VALUES ($1,'APPLICATION_ACTIVATED',$2)`, [appId,actor],
      );
    }
    await client.query('COMMIT');
    return result.rowCount === 1;
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
}

/** Immediately disable an app in the control plane. Existing tokens must also be
 * checked against app state in the future OAuth/OIDC data-plane middleware.
 */
export async function suspendApplication(appId: string, actor: string): Promise<void> {
  if (!validId(appId) || !validActor(actor)) throw new Error('Invalid suspension context');
  const client = await connection().connect();
  try {
    await client.query('BEGIN');
    const changed = await client.query(
      `UPDATE "ControlApplication" SET "status"='SUSPENDED',"updatedAt"=now()
       WHERE "id"=$1 AND "status"<>'SUSPENDED'`, [appId],
    );
    if (changed.rowCount !== 1) throw new Error('Application not found or already suspended');
    await client.query(
      `INSERT INTO "ControlApplicationEvent" ("applicationId","action","actor")
       VALUES ($1,'APPLICATION_SUSPENDED',$2)`, [appId,actor],
    );
    await client.query('COMMIT');
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
}

export async function closeApplicationLifecycle(): Promise<void> { await pool?.end(); }
