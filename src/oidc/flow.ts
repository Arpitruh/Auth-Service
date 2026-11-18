import { createHash, randomBytes } from 'node:crypto';
import { kv } from '../lib/store.js';
export interface PendingAuthorization {
  appId: string;
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string;
  nonce: string;
}
export interface RedeemableCode extends PendingAuthorization {
  userId: string;
  email: string;
  authTime: number;
}
const digest = (v: string) => createHash('sha256').update(v).digest('hex');
const opaque = () => randomBytes(32).toString('base64url');
export async function createPendingAuth(data: PendingAuthorization): Promise<string> {
  const id = opaque();
  await kv.set('oidc:pending:' + digest(id), JSON.stringify(data), 300);
  return id;
}
export async function consumePendingAuth(id: string): Promise<PendingAuthorization | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(id)) return null;
  const value = await kv.consume('oidc:pending:' + digest(id));
  return value ? JSON.parse(value) as PendingAuthorization : null;
}
export async function issueAuthorizationCode(data: RedeemableCode): Promise<string> {
  const code = opaque();
  await kv.set('oidc:code:' + digest(code), JSON.stringify(data), 60);
  return code;
}
export async function consumeAuthorizationCode(code: string): Promise<RedeemableCode | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(code)) return null;
  const value = await kv.consume('oidc:code:' + digest(code));
  return value ? JSON.parse(value) as RedeemableCode : null;
}
