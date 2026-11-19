import argon2 from "argon2";
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { ENV } from "../config/env.js";
import { kv } from "../lib/store.js";

const ttlSeconds = 60 * 60 * 8;
const sessionCookie = ENV.IS_PRODUCTION ? "__Host-auth-operator" : "auth_operator";
export interface OperatorSession {
  operator: string;
  csrf: string;
  credentialVersion: string;
}
// Sessions are bound to the configured operator credentials. Rotating the
// Argon2 hash invalidates all existing Redis sessions without a Redis flush.
function credentialVersion(): string {
  return createHash("sha256").update(ENV.DASHBOARD_OPERATOR_PASSWORD_HASH ?? "").digest("hex");
}
export function dashboardEnabled(): boolean {
  return !!(
    ENV.CONTROL_PLANE_DATABASE_URL &&
    ENV.DASHBOARD_OPERATOR_USERNAME &&
    ENV.DASHBOARD_OPERATOR_PASSWORD_HASH &&
    (ENV.REDIS_URL || !ENV.IS_PRODUCTION)
  );
}
export function dashboardCookieName(): string {
  return sessionCookie;
}
function cookieOptions() {
  return { httpOnly: true, secure: ENV.IS_PRODUCTION, sameSite: "strict" as const, path: "/" };
}
export async function checkOperator(username: string, password: string): Promise<boolean> {
  if (!dashboardEnabled()) return false;
  if (username.length > 200 || password.length > 1024) return false;
  const expected = Buffer.from(ENV.DASHBOARD_OPERATOR_USERNAME!);
  const received = Buffer.from(username);
  const userMatch = expected.length === received.length && timingSafeEqual(expected, received);
  // Verify password even if username is wrong, to reduce timing differences.
  const passwordMatch = await argon2.verify(ENV.DASHBOARD_OPERATOR_PASSWORD_HASH!, password);
  return userMatch && passwordMatch;
}
export async function openOperatorSession(res: Response): Promise<string> {
  const sid = randomBytes(32).toString("base64url");
  const csrf = randomBytes(32).toString("base64url");
  await kv.set(
    "operator:session:" + sid,
    JSON.stringify({
      operator: ENV.DASHBOARD_OPERATOR_USERNAME!,
      csrf,
      credentialVersion: credentialVersion(),
    } satisfies OperatorSession),
    ttlSeconds,
  );
  res.cookie(sessionCookie, sid, { ...cookieOptions(), maxAge: ttlSeconds * 1000 });
  return csrf;
}
export async function closeOperatorSession(req: Request, res: Response): Promise<void> {
  const sid = req.cookies?.[sessionCookie];
  if (typeof sid === "string") await kv.del("operator:session:" + sid);
  res.clearCookie(sessionCookie, cookieOptions());
}
export async function requireOperator(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Frame-Options", "DENY");
  if (!dashboardEnabled()) {
    res.status(404).end();
    return;
  }
  const sid = req.cookies?.[sessionCookie];
  if (typeof sid !== "string" || !/^[a-zA-Z0-9_-]{43}$/.test(sid)) {
    res.redirect(303, "/dashboard/login");
    return;
  }
  try {
    const raw = await kv.get("operator:session:" + sid);
    if (!raw) {
      res.redirect(303, "/dashboard/login");
      return;
    }
    const session = JSON.parse(raw) as OperatorSession;
    if (session.operator !== ENV.DASHBOARD_OPERATOR_USERNAME ||
      session.credentialVersion !== credentialVersion() ||
      typeof session.csrf !== "string") {
      res.redirect(303, "/dashboard/login");
      return;
    }
    res.locals.operator = session;
    next();
  } catch {
    res.status(503).send("Dashboard session store unavailable");
  }
}
export function verifyDashboardPost(req: Request, res: Response): boolean {
  const origin = req.get("origin");
  const host = req.get("host");
  // Exact-origin check is mandatory when browser supplies Origin.
  if (
    origin &&
    (!host ||
      new URL(origin).host !== host ||
      (ENV.IS_PRODUCTION && new URL(origin).protocol !== "https:"))
  )
    return false;
  const provided = req.body?._csrf;
  const expected = (res.locals.operator as OperatorSession | undefined)?.csrf;
  if (typeof provided !== "string" || typeof expected !== "string") return false;
  const a = Buffer.from(provided),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
