import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { Pool } from 'pg';
import { ENV } from '../config/env.js';

const pool = ENV.CONTROL_PLANE_DATABASE_URL
  ? new Pool({ connectionString: ENV.CONTROL_PLANE_DATABASE_URL, max: 3 })
  : null;

function secretKey(): Buffer {
  const raw = ENV.CONTROL_PLANE_ENCRYPTION_KEY;
  if (!raw) throw new Error('CONTROL_PLANE_ENCRYPTION_KEY is required for provisioning');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('Encryption key must decode to exactly 32 bytes');
  return key;
}
function connection(): Pool {
  if (!pool) throw new Error('Control-plane DB is disabled');
  return pool;
}
export function encryptSecret(plaintext: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretKey(), nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return ['v1', nonce.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}
export function decryptSecret(payload: string): string {
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Invalid encrypted secret');
  const [,nonce,tag,ciphertext] = parts;
  const decipher = createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(nonce!, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag!, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext!, 'base64url')), decipher.final()]).toString('utf8');
}
/** Internal encrypted secret store; refs only are written to ControlDatabaseBinding. */
export async function saveTenantConnectionSecret(applicationId: string, url: string): Promise<string> {
  if (!/^[0-9a-f-]{36}$/i.test(applicationId)) throw new Error('Invalid application ID');
  const ref = 'secret://apps/' + applicationId;
  await connection().query(
    `INSERT INTO "ControlSecret" ("id","ciphertext") VALUES ($1,$2)
     ON CONFLICT ("id") DO UPDATE SET "ciphertext"=EXCLUDED."ciphertext","updatedAt"=now()`,
    [ref, encryptSecret(url)],
  );
  return ref;
}
export async function resolveTenantConnectionSecret(ref: string): Promise<string> {
  if (!/^secret:\/\/apps\/[0-9a-f-]{36}$/i.test(ref)) throw new Error('Invalid secret reference');
  const result = await connection().query<{ ciphertext: string }>(
    'SELECT "ciphertext" FROM "ControlSecret" WHERE "id"=$1', [ref],
  );
  if (!result.rows[0]) throw new Error('Tenant database secret unavailable');
  return decryptSecret(result.rows[0].ciphertext);
}
export async function closeSecretStore(): Promise<void> { await pool?.end(); }
