import { Pool } from 'pg';
import { ENV } from '../config/env.js';
import type { RegisteredApplication } from '../control-plane/registry.js';

const pool = ENV.CONTROL_PLANE_DATABASE_URL
  ? new Pool({ connectionString: ENV.CONTROL_PLANE_DATABASE_URL, max: 4 }) : null;
function db(): Pool { if (!pool) throw new Error('Control database is not configured'); return pool; }

export interface DashboardApplication {
  id: string; clientId: string; name: string; slug: string;
  status: RegisteredApplication['status'];
  provider: string; mode: string; provisionState: string;
  schemaVersion: string | null; ssoEnabled: boolean;
  redirectUris: string[]; createdAt: Date;
}
export async function listDashboardApps(): Promise<DashboardApplication[]> {
  const result = await db().query<DashboardApplication>(`
    SELECT a."id", a."clientId", a."name", a."slug", a."status", a."ssoEnabled", a."createdAt",
      b."provider", b."mode", b."provisionState", b."schemaVersion",
      COALESCE(array_agg(r."uri") FILTER (WHERE r."uri" IS NOT NULL), ARRAY[]::text[]) AS "redirectUris"
    FROM "ControlApplication" a
    JOIN "ControlDatabaseBinding" b ON b."applicationId"=a."id"
    LEFT JOIN "ControlRedirectUri" r ON r."applicationId"=a."id"
    GROUP BY a."id", b."applicationId" ORDER BY a."createdAt" DESC LIMIT 100
  `);
  return result.rows;
}
export async function getDashboardApp(id: string): Promise<DashboardApplication | null> {
  if (!/^[a-f0-9-]{36}$/i.test(id)) return null;
  const result = await db().query<DashboardApplication>(`
    SELECT a."id",a."clientId",a."name",a."slug",a."status",a."ssoEnabled",a."createdAt",
      b."provider",b."mode",b."provisionState",b."schemaVersion",
      COALESCE(array_agg(r."uri") FILTER (WHERE r."uri" IS NOT NULL), ARRAY[]::text[]) AS "redirectUris"
    FROM "ControlApplication" a
    JOIN "ControlDatabaseBinding" b ON b."applicationId"=a."id"
    LEFT JOIN "ControlRedirectUri" r ON r."applicationId"=a."id"
    WHERE a."id"=$1 GROUP BY a."id",b."applicationId"
  `, [id]);
  return result.rows[0] ?? null;
}
export async function updateApplicationSettings(
  appId: string, settings: { allowPasswordLogin: boolean; allowRegistration: boolean; sessionMinutes: number },
): Promise<void> {
  if (!/^[a-f0-9-]{36}$/i.test(appId)) throw new Error('Invalid application');
  if (!Number.isInteger(settings.sessionMinutes) || settings.sessionMinutes < 5 ||
      settings.sessionMinutes > 10080) throw new Error('Invalid session duration');
  const client = await db().connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      INSERT INTO "ControlApplicationSettings"
        ("applicationId","allowPasswordLogin","allowRegistration","sessionMinutes")
      SELECT "id",$2,$3,$4 FROM "ControlApplication" WHERE "id"=$1
      ON CONFLICT ("applicationId") DO UPDATE SET
        "allowPasswordLogin"=EXCLUDED."allowPasswordLogin",
        "allowRegistration"=EXCLUDED."allowRegistration",
        "sessionMinutes"=EXCLUDED."sessionMinutes",
        "settingsVersion"="ControlApplicationSettings"."settingsVersion"+1,"updatedAt"=now()
      RETURNING "applicationId"`, [appId,settings.allowPasswordLogin,settings.allowRegistration,settings.sessionMinutes]);
    if (!result.rowCount) throw new Error('Application not found');
    await client.query(`INSERT INTO "ControlApplicationEvent"
      ("applicationId","action","actor") VALUES ($1,'SETTINGS_UPDATED','system:dashboard-operator')`,[appId]);
    await client.query('COMMIT');
  } catch(e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}
export async function getApplicationSettings(appId: string): Promise<{
  allowPasswordLogin: boolean; allowRegistration: boolean; sessionMinutes: number;
}> {
  const r = await db().query<{ allowPasswordLogin:boolean; allowRegistration:boolean; sessionMinutes:number }>(`
    SELECT "allowPasswordLogin","allowRegistration","sessionMinutes"
    FROM "ControlApplicationSettings" WHERE "applicationId"=$1`, [appId]);
  return r.rows[0] ?? { allowPasswordLogin:true, allowRegistration:true, sessionMinutes:60 };
}
export async function countTenantUsers(app: DashboardApplication): Promise<number | null> {
  if (app.status !== 'ACTIVE' || app.provisionState !== 'READY') return null;
  const { getDatabaseBindingForAppId } = await import('../control-plane/registry.js');
  const { tenantPool } = await import('../tenant/database-pool.js');
  const binding = await getDatabaseBindingForAppId(app.id);
  if (!binding?.secretRef || !binding.schemaVersion) return null;
  return tenantPool.withTenant({
    id:app.id, clientId:app.clientId, status:'ACTIVE',
    secretRef:binding.secretRef, schemaVersion:binding.schemaVersion,
  }, async prisma => prisma.user.count());
}
export async function closeDashboardRepo(): Promise<void> { await pool?.end(); }
