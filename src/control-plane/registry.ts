import { Pool } from 'pg';
import { ENV } from '../config/env.js';
import { generateClientId } from './client-id.js';
import { validateRedirectUris } from './redirect-uri.js';

/** Fail closed if the control-plane URL accidentally targets the legacy user DB. */
export function distinctDatabaseTargets(controlUrl: string, legacyUrl: string): boolean {
  const target = (value: string) => {
    const u = new URL(value);
    if (!['postgresql:','postgres:'].includes(u.protocol)) throw new Error('PostgreSQL URL required');
    return [u.hostname.toLowerCase().replace(/-pooler(?=\.)/,'') , u.port || '5432', decodeURIComponent(u.pathname)].join('|');
  };
  return target(controlUrl) !== target(legacyUrl);
}

/** A separate control-plane database, never the existing User database. */
const url = ENV.CONTROL_PLANE_DATABASE_URL;
if (url && !distinctDatabaseTargets(url, ENV.DATABASE_URL)) {
  throw new Error('Control-plane and legacy user databases must be distinct');
}
const pool = url ? new Pool({ connectionString: url, max: Math.min(ENV.DB_POOL_SIZE, 5) }) : null;

export interface ApplicationInput {
  slug: string;
  name: string;
  redirectUris: string[];
  provider: 'NEON' | 'POSTGRESQL';
  mode: 'MANAGED' | 'EXTERNAL';
}
export interface RegisteredApplication {
  id: string;
  clientId: string;
  slug: string;
  name: string;
  status: 'DRAFT' | 'ACTIVE' | 'SUSPENDED';
  ssoEnabled: boolean;
  redirectUris: string[];
  database: {
    provider: 'NEON' | 'POSTGRESQL';
    mode: 'MANAGED' | 'EXTERNAL';
    provisionState: 'PENDING' | 'PROVISIONING' | 'READY' | 'ERROR' | 'DISABLED';
    schemaVersion: string | null;
  };
}

function getPool(): Pool {
  if (!pool) throw new Error('Control plane is disabled: set CONTROL_PLANE_DATABASE_URL');
  return pool;
}

function validateInput(input: ApplicationInput): ApplicationInput {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug) || input.slug.length > 64) {
    throw new Error('Invalid application slug');
  }
  if (!input.name.trim() || input.name.length > 120) throw new Error('Invalid application name');
  if (!['NEON','POSTGRESQL'].includes(input.provider) || !['MANAGED','EXTERNAL'].includes(input.mode)) {
    throw new Error('Invalid database provider/mode');
  }
  if (input.mode === 'MANAGED' && input.provider !== 'NEON') {
    throw new Error('Only Neon supports managed database provisioning');
  }
  return { ...input, name: input.name.trim(), redirectUris: validateRedirectUris(input.redirectUris) };
}

/** This must be invoked from a trusted admin action only. DO NOT expose as a public HTTP route. */
export async function registerApplication(input: ApplicationInput): Promise<RegisteredApplication> {
  const validated = validateInput(input);
  const db = await getPool().connect();
  try {
    await db.query('BEGIN');
    const created = await db.query<{ id: string; clientId: string }>(
      'INSERT INTO "ControlApplication" ("clientId","slug","name") VALUES ($1,$2,$3) RETURNING "id","clientId"',
      [generateClientId(), validated.slug, validated.name],
    );
    const app = created.rows[0]!;
    for (const uri of validated.redirectUris) {
      await db.query('INSERT INTO "ControlRedirectUri" ("applicationId","uri") VALUES ($1,$2)', [app.id, uri]);
    }
    await db.query(
      'INSERT INTO "ControlDatabaseBinding" ("applicationId","provider","mode") VALUES ($1,$2,$3)',
      [app.id, validated.provider, validated.mode],
    );
    await db.query('COMMIT');
    const registered = await getApplicationByClientId(app.clientId);
    if (!registered) throw new Error('Application registration did not persist');
    return registered;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally { db.release(); }
}

/** Read public configuration only. Never return secret references to clients. */
export async function getApplicationByClientId(clientId: string): Promise<RegisteredApplication | null> {
  if (!/^authapp_[A-Za-z0-9_-]{24}$/.test(clientId)) return null;
  const result = await getPool().query<{
    id: string; clientId: string; slug: string; name: string;
    status: RegisteredApplication['status']; ssoEnabled: boolean;
    provider: RegisteredApplication['database']['provider'];
    mode: RegisteredApplication['database']['mode'];
    provisionState: RegisteredApplication['database']['provisionState'];
    schemaVersion: string | null; redirectUris: string[];
  }>(`
    SELECT a."id", a."clientId", a."slug", a."name", a."status",
           a."ssoEnabled", b."provider", b."mode", b."provisionState", b."schemaVersion",
           COALESCE(array_agg(r."uri") FILTER (WHERE r."uri" IS NOT NULL), ARRAY[]::text[]) AS "redirectUris"
    FROM "ControlApplication" a
    JOIN "ControlDatabaseBinding" b ON b."applicationId" = a."id"
    LEFT JOIN "ControlRedirectUri" r ON r."applicationId" = a."id"
    WHERE a."clientId" = $1
    GROUP BY a."id", b."applicationId"
  `, [clientId]);
  const row = result.rows[0];
  if (!row) return null;
  const { provider, mode, provisionState, schemaVersion, ...app } = row;
  return { ...app, database: { provider, mode, provisionState, schemaVersion } };
}

/** Internal-only DB binding lookup. Never expose secretRef through public responses. */
export async function getDatabaseBindingForAppId(applicationId: string): Promise<{
  provider: 'NEON' | 'POSTGRESQL'; secretRef: string; schemaVersion: string | null;
} | null> {
  if (!/^[0-9a-f-]{36}$/i.test(applicationId)) return null;
  const result = await getPool().query<{ provider: 'NEON' | 'POSTGRESQL'; secretRef: string; schemaVersion: string | null }>(
    `SELECT b."provider", b."secretRef", b."schemaVersion"
       FROM "ControlDatabaseBinding" b
       JOIN "ControlApplication" a ON a."id" = b."applicationId"
       WHERE b."applicationId"=$1 AND b."provisionState"='READY' AND a."status"='ACTIVE'`,
    [applicationId],
  );
  return result.rows[0] ?? null;
}

export async function closeControlPlane(): Promise<void> { await pool?.end(); }
