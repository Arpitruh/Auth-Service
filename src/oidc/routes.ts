import { Router, urlencoded, type Response } from 'express';
import argon2 from 'argon2';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ENV } from '../config/env.js';
import { getApplicationByClientId, getDatabaseBindingForAppId } from '../control-plane/registry.js';
import { tenantPool } from '../tenant/database-pool.js';
import { resolveOidcClient } from './app.js';
import { oidcSigner } from './keys.js';
import { validPkceChallenge, verifyPkce } from './pkce.js';
import { createPendingAuth, consumePendingAuth, issueAuthorizationCode, consumeAuthorizationCode } from './flow.js';
import { loginHtml } from './html.js';
import { kv } from '../lib/store.js';
import { getApplicationSettings } from '../dashboard/repository.js';

export const oidcRoutes = Router();
// Hosted login and OAuth token exchange use HTML/standard form encoding.
oidcRoutes.use(urlencoded({ extended: false, limit: '16kb' }));
const issuer = () => ENV.OIDC_ISSUER!;
const endpoint = (path: string) => new URL(path, issuer()).toString();
const cookieName = ENV.IS_PRODUCTION ? '__Host-oidc-flow' : 'oidc_flow';
function available(): boolean {
  return !!(ENV.OIDC_ISSUER && ENV.OIDC_PRIVATE_KEY_B64 && ENV.OIDC_KEY_ID &&
    (ENV.OIDC_ISSUER.startsWith('https://') || ENV.NODE_ENV === 'test') &&
    (ENV.REDIS_URL || ENV.NODE_ENV === 'test'));
}
function refuse(res: Response): void {
  res.status(503).json({ error: 'temporarily_unavailable' });
}
function securityHeaders(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
}
function cookieSettings() {
  return { httpOnly: true, secure: ENV.IS_PRODUCTION, sameSite: 'lax' as const, path: '/' };
}
function hasSafeValue(raw: unknown, min: number, max: number): raw is string {
  return typeof raw === 'string' && raw.length >= min && raw.length <= max &&
    /^[A-Za-z0-9._~-]+$/.test(raw);
}
function equalOpaque(a: unknown, b: unknown): boolean {
  if (!hasSafeValue(a, 43, 43) || !hasSafeValue(b, 43, 43)) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
function error(res: Response, status: number, code: string): void {
  securityHeaders(res);
  res.status(status).json({ error: code });
}
function formValue(body: Record<string, unknown>, key: string): string | null {
  return typeof body[key] === 'string' ? body[key] : null;
}

oidcRoutes.get('/.well-known/openid-configuration', (_req, res) => {
  if (!available()) return refuse(res);
  securityHeaders(res);
  res.json({
    issuer: issuer(),
    authorization_endpoint: endpoint('/oauth/authorize'),
    token_endpoint: endpoint('/oauth/token'),
    userinfo_endpoint: endpoint('/oauth/userinfo'),
    jwks_uri: endpoint('/oauth/jwks'),
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['openid', 'email'],
    claims_supported: ['sub','email','email_verified','auth_time','nonce'],
  });
});

oidcRoutes.get('/oauth/jwks', (_req, res) => {
  if (!available()) return refuse(res);
  try {
    securityHeaders(res);
    res.json({ keys: [oidcSigner().publicJwk] });
  } catch { refuse(res); }
});

oidcRoutes.get('/oauth/authorize', async (req, res) => {
  if (!available()) return refuse(res);
  securityHeaders(res);
  const q = req.query;
  const clientId = typeof q.client_id === 'string' ? q.client_id : '';
  const redirect = typeof q.redirect_uri === 'string' ? q.redirect_uri : '';
  // Unknown/mismatched redirects must NEVER receive an error redirect.
  if (!hasSafeValue(clientId, 32, 96) || !redirect || redirect.length > 2048) {
    return error(res, 400, 'invalid_request');
  }
  try {
    const registered = await getApplicationByClientId(clientId);
    const tenant = await resolveOidcClient(clientId, redirect);
    if (!registered || !tenant) return error(res, 400, 'invalid_client');
    if (q.response_type !== 'code' || q.code_challenge_method !== 'S256' ||
        !validPkceChallenge(q.code_challenge) || q.scope !== 'openid' ||
        !hasSafeValue(q.state, 16, 128) || !hasSafeValue(q.nonce, 16, 128)) {
      return error(res, 400, 'invalid_request');
    }
    const flow = await createPendingAuth({
      appId: tenant.id, clientId, redirectUri: redirect, challenge: q.code_challenge,
      state: q.state, nonce: q.nonce,
    });
    const csrf = randomBytes(32).toString('base64url');
    res.cookie(cookieName, csrf, { ...cookieSettings(), maxAge: 300_000 });
    res.setHeader('Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    res.type('html').send(loginHtml(registered.name, flow, csrf));
  } catch { error(res, 503, 'temporarily_unavailable'); }
});

oidcRoutes.post('/oauth/authorize/complete', async (req, res) => {
  if (!available()) return refuse(res);
  securityHeaders(res);
  const form = req.body as Record<string, unknown>;
  if (!equalOpaque(formValue(form, 'csrf'), req.cookies?.[cookieName]) ||
      !hasSafeValue(formValue(form, 'flow'), 43, 43)) {
    return error(res, 400, 'invalid_request');
  }
  res.clearCookie(cookieName, cookieSettings());
  try {
    const pending = await consumePendingAuth(String(form.flow));
    if (!pending) return error(res, 400, 'expired_request');
    const client = await resolveOidcClient(pending.clientId, pending.redirectUri);
    if (!client || client.id !== pending.appId) return error(res, 400, 'invalid_client');
    if (!(await getApplicationSettings(client.id)).allowPasswordLogin) return error(res, 403, 'access_denied');
    const email = formValue(form, 'email')?.trim().toLowerCase();
    const password = formValue(form, 'password');
    if (!email || email.length > 254 || !password || password.length > 1024) {
      return error(res, 400, 'invalid_request');
    }
    // Per-app throttling, no SSO or cross-application cookie reuse.
    const hashed = createHash('sha256').update(email).digest('hex');
    const attempts = await kv.incr('oidc:login:' + client.id + ':' + hashed, 900);
    if (attempts > ENV.LOCKOUT_THRESHOLD) return error(res, 429, 'access_denied');
    const user = await tenantPool.withTenant(client, db => db.user.findUnique({ where: { email } }));
    if (!user || !(await argon2.verify(user.password, password))) {
      return error(res, 401, 'access_denied');
    }
    await kv.del('oidc:login:' + client.id + ':' + hashed);
    const code = await issueAuthorizationCode({
      ...pending, userId: user.id, email: user.email, authTime: Math.floor(Date.now()/1000),
    });
    const target = new URL(pending.redirectUri);
    target.searchParams.set('code', code);
    target.searchParams.set('state', pending.state);
    res.redirect(303, target.toString());
  } catch { error(res, 503, 'temporarily_unavailable'); }
});

oidcRoutes.post('/oauth/token', async (req, res) => {
  if (!available()) return refuse(res);
  securityHeaders(res);
  const body = req.body as Record<string, unknown>;
  if (body.grant_type !== 'authorization_code' ||
      typeof body.code !== 'string' || typeof body.client_id !== 'string' ||
      typeof body.redirect_uri !== 'string' || typeof body.code_verifier !== 'string') {
    return error(res, 400, 'invalid_request');
  }
  try {
    // GETDEL is atomic in Redis; wrong verifier burns the single-use code.
    const code = await consumeAuthorizationCode(body.code);
    if (!code || code.clientId !== body.client_id || code.redirectUri !== body.redirect_uri ||
        !verifyPkce(body.code_verifier, code.challenge)) {
      return error(res, 400, 'invalid_grant');
    }
    const app = await resolveOidcClient(code.clientId, code.redirectUri);
    if (!app || app.id !== code.appId) return error(res, 400, 'invalid_grant');
    const user = await tenantPool.withTenant(app, db => db.user.findUnique({
      where: { id: code.userId }, select: { id:true, email:true },
    }));
    if (!user) return error(res, 400, 'invalid_grant');
    const signer = oidcSigner();
    res.json({
      access_token: signer.signAccessToken({
        sub: user.id, aud: code.clientId, appId: app.id, scope: 'openid',
      }),
      id_token: signer.signIdToken({
        sub: user.id, aud: code.clientId, nonce: code.nonce,
        email: user.email, authTime: code.authTime,
      }),
      token_type: 'Bearer', expires_in: 300, scope: 'openid',
    });
  } catch { error(res, 503, 'temporarily_unavailable'); }
});

oidcRoutes.get('/oauth/userinfo', async (req, res) => {
  if (!available()) return refuse(res);
  securityHeaders(res);
  const token = req.header('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return error(res, 401, 'invalid_token');
  try {
    const claims = oidcSigner().verifyAccessToken(token);
    if (typeof claims.aud !== 'string' || typeof claims.sub !== 'string' ||
        typeof claims.appId !== 'string') return error(res, 401, 'invalid_token');
    const userId: string = claims.sub;
    const app = await getApplicationByClientId(claims.aud);
    if (!app || app.status !== 'ACTIVE' || app.id !== claims.appId) {
      return error(res, 401, 'invalid_token');
    }
    const binding = await getDatabaseBindingForAppId(app.id);
    if (!binding?.secretRef || !binding.schemaVersion) return error(res, 401, 'invalid_token');
    const user = await tenantPool.withTenant({
      id: app.id, clientId: app.clientId, status: 'ACTIVE',
      secretRef: binding.secretRef, schemaVersion: binding.schemaVersion,
    }, db => db.user.findUnique({ where: { id: userId }, select: { id:true, email:true } }));
    if (!user) return error(res, 401, 'invalid_token');
    res.json({ sub: user.id, email: user.email, email_verified: false });
  } catch { error(res, 401, 'invalid_token'); }
});
