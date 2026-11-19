import { Router } from 'express';
import { createHash } from 'node:crypto';
import argon2 from 'argon2';
import { requireVerifiedTenant } from './context.js';
import { tenantPool } from './database-pool.js';
import { issueTenantAccessToken, verifyTenantAccessToken } from './access-token.js';
import { ENV } from '../config/env.js';
import { kv } from '../lib/store.js';
import { getApplicationSettings } from '../dashboard/repository.js';
import { validate } from '../middlewares/validate.js';
import { registerSchema, loginSchema } from '../schemas/auth.schema.js';
import type { VerifiedTenant } from './client-credentials.js';
import { notifyTenantRegistration } from '../lib/welcome-notification.js';

export const tenantRoutes = Router();
tenantRoutes.use(requireVerifiedTenant);
const identity = (req: { body?: unknown }) => req.body as { email: string; password: string };

/** Per-app lockout keeps one app's failed logins from locking another app.
 * The BFF must also enforce per-IP rate limiting and abuse controls.
 */
async function throttle(appId: string, email: string): Promise<number> {
  const hash = createHash('sha256').update(email).digest('hex');
  return kv.incr('tenant:login:'+appId+':'+hash, ENV.LOCKOUT_WINDOW_MINUTES*60);
}

async function rateLimitTenantRequest(appId: string, action: string, ip: string): Promise<boolean> {
  const ipHash = createHash('sha256').update(ip).digest('hex');
  const attempts = await kv.incr('tenant:rate:' + appId + ':' + action + ':' + ipHash,
    ENV.RATE_LIMIT_WINDOW_MINUTES * 60);
  return attempts <= ENV.RATE_LIMIT_MAX;
}

tenantRoutes.post('/register', validate(registerSchema), async (req, res) => {
  const tenant = res.locals.tenant as VerifiedTenant;
  try {
    if (!(await getApplicationSettings(tenant.id)).allowRegistration) {
      res.status(403).json({ error:'Registration disabled for this application' }); return;
    }
    if (!await rateLimitTenantRequest(tenant.id, 'register', req.ip ?? 'unknown')) {
      res.status(429).json({ error: 'Too many registration attempts' }); return;
    }
    const { email, password } = identity(req);
    const result = await tenantPool.withTenant(tenant, async db => {
      const passwordHash = await argon2.hash(password);
      return db.$transaction(async tx => {
        const user = await tx.user.create({ data: { email, password: passwordHash } });
        // The event is committed in the SAME tenant database transaction.
        // Missing notification configuration means the relay will retain this
        // event for later setup, rather than silently dropping registrations.
        if (ENV.TENANT_REGISTRATION_OUTBOX_ENABLED) {
          await tx.registrationEventOutbox.create({
            data: { userId: user.id, recipient: user.email },
          });
        }
        return { id: user.id, email: user.email, role: user.role };
      });
    });
    // Backwards-compatible path until every production tenant DB is migrated.
    if (!ENV.TENANT_REGISTRATION_OUTBOX_ENABLED) await notifyTenantRegistration(tenant.id, result);
    res.status(201).json({ user: result,
      accessToken: issueTenantAccessToken(tenant.id, tenant.clientId, result) });
  } catch (err) {
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002') {
      res.status(409).json({ error: 'Account already exists' }); return;
    }
    res.status(503).json({ error: 'Tenant registration unavailable' });
  }
});
tenantRoutes.post('/login', validate(loginSchema), async (req, res) => {
  const tenant = res.locals.tenant as VerifiedTenant;
  const { email, password } = identity(req);
  try {
    if (!(await getApplicationSettings(tenant.id)).allowPasswordLogin) {
      res.status(403).json({ error:'Password login disabled for this application' }); return;
    }
    if (!await rateLimitTenantRequest(tenant.id, 'login', req.ip ?? 'unknown')) {
      res.status(429).json({ error: 'Too many login attempts' }); return;
    }
    const failures = await throttle(tenant.id, email);
    if (failures > ENV.LOCKOUT_THRESHOLD) {
      res.status(429).json({ error: 'Too many attempts' }); return;
    }
    const user = await tenantPool.withTenant(tenant, db => db.user.findUnique({ where: { email } }));
    if (!user || !(await argon2.verify(user.password, password))) {
      res.status(401).json({ error: 'Invalid credentials' }); return;
    }
    await kv.del('tenant:login:' + tenant.id + ':' + createHash('sha256').update(email).digest('hex'));

    const safe = { id: user.id, email: user.email, role: user.role };
    res.status(200).json({ user: safe,
      accessToken: issueTenantAccessToken(tenant.id, tenant.clientId, safe) });
  } catch {
    res.status(503).json({ error: 'Tenant login unavailable' });
  }
});
tenantRoutes.get('/me', async (req, res) => {
  const tenant = res.locals.tenant as VerifiedTenant;
  const token = req.header('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) { res.status(401).json({ error: 'Access token required' }); return; }
  try {
    const claims = verifyTenantAccessToken(token, tenant.id, tenant.clientId);
    const user = await tenantPool.withTenant(tenant, db => db.user.findUnique({
      where: { id: claims.sub }, select: { id: true, email: true, role: true },
    }));
    if (!user) { res.status(401).json({ error: 'Unknown user' }); return; }
    res.status(200).json({ user });
  } catch {
    res.status(401).json({ error: 'Invalid access token' });
  }
});
