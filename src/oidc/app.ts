import { Pool } from 'pg';
import { ENV } from '../config/env.js';
import { getApplicationByClientId } from '../control-plane/registry.js';
import type { VerifiedTenant } from '../tenant/client-credentials.js';

const pool = ENV.CONTROL_PLANE_DATABASE_URL
  ? new Pool({ connectionString: ENV.CONTROL_PLANE_DATABASE_URL, max: 3 }) : null;
/** Public client IDs only identify registrations; exact redirects, PKCE, and
 * real end-user credentials must also be validated before issuing tokens.
 */
export async function resolveOidcClient(clientId: string, redirectUri: string): Promise<VerifiedTenant | null> {
  const registered = await getApplicationByClientId(clientId);
  if (!registered || registered.status !== 'ACTIVE' ||
      registered.database.provisionState !== 'READY' ||
      !registered.redirectUris.includes(redirectUri)) return null;
  if (!pool) throw new Error('Control plane is disabled');
  const r = await pool.query<{ secretRef: string; schemaVersion: string }>(
    `SELECT b."secretRef", b."schemaVersion" FROM "ControlDatabaseBinding" b
     JOIN "ControlApplication" a ON a."id"=b."applicationId"
     WHERE a."id"=$1 AND a."status"='ACTIVE' AND b."provisionState"='READY'
       AND b."secretRef" IS NOT NULL AND b."schemaVersion" IS NOT NULL`, [registered.id]);
  const binding = r.rows[0];
  return binding ? { id: registered.id, clientId, status: 'ACTIVE',
    secretRef: binding.secretRef, schemaVersion: binding.schemaVersion } : null;
}
export async function closeOidcPool(): Promise<void> { await pool?.end(); }
