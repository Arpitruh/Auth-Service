import { Router, urlencoded, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import { ENV } from "../config/env.js";
import { kv } from "../lib/store.js";
import { registerApplication } from "../control-plane/registry.js";
import { activateApplication, suspendApplication } from "../control-plane/lifecycle.js";
import { provisionTenant } from "../provisioning/provision.js";
import { issueApplicationKey } from "../tenant/client-credentials.js";
import {
  dashboardEnabled,
  checkOperator,
  openOperatorSession,
  closeOperatorSession,
  requireOperator,
  verifyDashboardPost,
  type OperatorSession,
} from "./auth.js";
import {
  listDashboardApps,
  getDashboardApp,
  getApplicationSettings,
  updateApplicationSettings,
  countTenantUsers,
  listAppUsers,
  changeAppUserRole,
} from "./repository.js";
import { appListPage, createAppPage, detailPage, loginPage, appUsersPage, recoveryPage, dashboardUiScript } from "./views.js";

export const dashboardRoutes = Router();
dashboardRoutes.use(urlencoded({ extended: false, limit: "16kb" }));
dashboardRoutes.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  );
  if (!dashboardEnabled()) {
    res.status(404).end();
    return;
  }
  next();
});
function validOrigin(req: Request): boolean {
  const origin = req.get("origin");
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return parsed.host === req.get("host") && (!ENV.IS_PRODUCTION || parsed.protocol === "https:");
  } catch {
    return false;
  }
}
function fail(res: Response, text = "Request could not be completed"): void {
  res.status(400).type("text").send(text);
}
function appId(req: Request): string {
  const id = req.params.id;
  return typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id) ? id : "";
}
function field(req: Request, name: string, max = 2048): string {
  const raw: unknown = req.body?.[name];
  return typeof raw === "string" && raw.length <= max ? raw.trim() : "";
}
function csrf(res: Response): string {
  return (res.locals.operator as OperatorSession).csrf;
}
function validPost(req: Request, res: Response): boolean {
  return validOrigin(req) && verifyDashboardPost(req, res);
}
function redirect(res: Response, path: string, message: string): void {
  res.redirect(303, path + "?status=" + encodeURIComponent(message));
}

dashboardRoutes.get("/ui.js", (_req, res) => {
  res.type("application/javascript").send(dashboardUiScript);
});
dashboardRoutes.get("/recover", (_req, res) => {
  res.type("html").send(recoveryPage());
});
dashboardRoutes.get("/login", (_req, res) => {
  res.type("html").send(loginPage());
});
dashboardRoutes.post("/login", async (req, res) => {
  if (!validOrigin(req)) {
    fail(res, "Invalid origin");
    return;
  }
  const fingerprint = createHash("sha256")
    .update(req.ip ?? "unknown")
    .digest("hex");
  try {
    if ((await kv.incr("dashboard:login:" + fingerprint, 900)) > 8) {
      res.status(429).type("html").send(loginPage("Too many attempts"));
      return;
    }
    if (!(await checkOperator(field(req, "username", 120), field(req, "password", 1024)))) {
      res.status(401).type("html").send(loginPage("Incorrect credentials"));
      return;
    }
    await openOperatorSession(res);
    await kv.del("dashboard:login:" + fingerprint);
    res.redirect(303, "/dashboard");
  } catch (error) {
    // Log only an error category/code; never expose Redis URLs, credentials or session data.
    const code = error && typeof error === "object" && "code" in error &&
      typeof error.code === "string" ? error.code : "UNKNOWN";
    const kind = error instanceof Error ? error.constructor.name : typeof error;
    // Classify failure messages without logging arbitrary server errors, URLs or secrets.
    const detail = error instanceof Error ? error.message.toLowerCase() : "";
    const reason =
      /already connecting|already connected/.test(detail) ? "ALREADY_CONNECTING" :
      /connection is closed|connection closed|socket closed/.test(detail) ? "CONNECTION_CLOSED" :
      /offline queue|stream isn't writeable|stream is not writable/.test(detail) ? "OFFLINE_QUEUE" :
      /max retries|retries per request/.test(detail) ? "RETRIES_EXHAUSTED" :
      /timeout|timed out/.test(detail) ? "TIMEOUT" :
      /certificate|self.signed|unable to verify/.test(detail) ? "TLS_CERTIFICATE" :
      /wrongpass|noauth|authentication|invalid password/.test(detail) ? "AUTHENTICATION" :
      /getaddrinfo|enotfound|dns/.test(detail) ? "DNS" :
      /connect|socket|network/.test(detail) ? "NETWORK" : "OTHER";
    console.error("Dashboard session store failure:", { code, kind, reason });
    res.status(503).type("html").send(loginPage("Session store unavailable"));
  }
});
dashboardRoutes.use(requireOperator);
dashboardRoutes.post("/logout", async (req, res) => {
  if (!validPost(req, res)) {
    fail(res, "Invalid session");
    return;
  }
  await closeOperatorSession(req, res);
  res.redirect(303, "/dashboard/login");
});
dashboardRoutes.get("/", async (req, res) => {
  try {
    const apps = await listDashboardApps();
    const notice = typeof req.query.status === "string" ? req.query.status.slice(0, 120) : "";
    res.type("html").send(appListPage(apps, notice, csrf(res)));
  } catch {
    res.status(503).send("Control plane unavailable");
  }
});
dashboardRoutes.get("/new", (_req, res) => res.type("html").send(createAppPage(csrf(res))));
dashboardRoutes.post("/apps", async (req, res) => {
  if (!validPost(req, res)) {
    fail(res, "Invalid session");
    return;
  }
  const provider = field(req, "provider"),
    mode = field(req, "mode");
  if (!["NEON", "POSTGRESQL"].includes(provider) || !["MANAGED", "EXTERNAL"].includes(mode)) {
    fail(res, "Invalid database settings");
    return;
  }
  try {
    const app = await registerApplication({
      name: field(req, "name", 120),
      slug: field(req, "slug", 64),
      redirectUris: [field(req, "redirectUri")],
      provider: provider as "NEON" | "POSTGRESQL",
      mode: mode as "MANAGED" | "EXTERNAL",
    });
    res.redirect(303, "/dashboard/apps/" + app.id);
  } catch {
    res
      .status(400)
      .type("html")
      .send(createAppPage(csrf(res), "Check values or duplicate slug"));
  }
});
dashboardRoutes.get("/apps/:id", async (req, res) => {
  const id = appId(req);
  if (!id) {
    res.status(404).end();
    return;
  }
  try {
    const app = await getDashboardApp(id);
    if (!app) {
      res.status(404).end();
      return;
    }
    const settings = await getApplicationSettings(id);
    let count: number | null = null;
    try {
      count = await countTenantUsers(app);
    } catch {
      /* unavailable != zero */
    }
    const notice = typeof req.query.status === "string" ? req.query.status.slice(0, 120) : "";
    res.type("html").send(detailPage(app, csrf(res), settings, { notice, count }));
  } catch {
    res.status(503).send("Control plane unavailable");
  }
});
dashboardRoutes.post("/apps/:id/settings", async (req, res) => {
  const id = appId(req);
  if (!id || !validPost(req, res)) {
    fail(res, "Invalid request");
    return;
  }
  try {
    await updateApplicationSettings(id, {
      allowPasswordLogin: field(req, "allowPasswordLogin") === "true",
      allowRegistration: field(req, "allowRegistration") === "true",
      sessionMinutes: Number(field(req, "sessionMinutes", 6)),
    });
    redirect(res, "/dashboard/apps/" + id, "Authentication policy saved");
  } catch {
    fail(res, "Unable to save policy");
  }
});
dashboardRoutes.post("/apps/:id/activate", async (req, res) => {
  const id = appId(req);
  if (!id || !validPost(req, res)) {
    fail(res, "Invalid request");
    return;
  }
  try {
    if (!(await activateApplication(id, "system:dashboard-operator"))) {
      fail(res, "Database is not ready");
      return;
    }
    redirect(res, "/dashboard/apps/" + id, "Application activated");
  } catch {
    fail(res);
  }
});
dashboardRoutes.post("/apps/:id/suspend", async (req, res) => {
  const id = appId(req);
  if (!id || !validPost(req, res)) {
    fail(res, "Invalid request");
    return;
  }
  try {
    await suspendApplication(id, "system:dashboard-operator");
    redirect(res, "/dashboard/apps/" + id, "Application suspended");
  } catch {
    fail(res);
  }
});
dashboardRoutes.post("/apps/:id/keys", async (req, res) => {
  const id = appId(req);
  if (!id || !validPost(req, res)) {
    fail(res, "Invalid request");
    return;
  }
  try {
    const key = await issueApplicationKey(id, field(req, "label", 100));
    const app = await getDashboardApp(id);
    if (!app) throw new Error("Missing app");
    const settings = await getApplicationSettings(id);
    res.type("html").send(detailPage(app, csrf(res), settings, { oneTimeKey: key }));
  } catch {
    fail(res, "Key cannot be issued");
  }
});
dashboardRoutes.post("/apps/:id/provision", async (req, res) => {
  const id = appId(req);
  if (!id || !validPost(req, res)) {
    fail(res, "Invalid request");
    return;
  }
  const app = await getDashboardApp(id).catch(() => null);
  if (!app || app.status !== "DRAFT" || app.provisionState !== "PENDING") {
    fail(res, "Application is not eligible");
    return;
  }
  try {
    if (app.mode === "MANAGED") {
      if (field(req, "confirmCost") !== "YES") {
        fail(res, "Explicit cost approval required");
        return;
      }
      await provisionTenant({ mode: "MANAGED", applicationId: id });
    } else {
      const connectionUrl = field(req, "connectionUrl", 4096);
      if (!connectionUrl) {
        fail(res, "Connection URL required");
        return;
      }
      await provisionTenant({ mode: "EXTERNAL", applicationId: id, connectionUrl });
    }
    redirect(res, "/dashboard/apps/" + id, "Database ready. Review and activate.");
  } catch {
    fail(res, "Provisioning failed. Manual recovery may be required.");
  }
});

dashboardRoutes.get("/apps/:id/users", async (req, res) => {
  const id = appId(req);
  if (!id) {
    res.status(404).end();
    return;
  }
  const app = await getDashboardApp(id).catch(() => null);
  if (!app) {
    res.status(404).end();
    return;
  }
  try {
    const users = await listAppUsers(app);
    res.type("html").send(appUsersPage(app, csrf(res), users));
  } catch {
    res.status(503).send("Tenant directory unavailable");
  }
});
dashboardRoutes.post("/apps/:id/users/:userId/role", async (req, res) => {
  const id = appId(req);
  const userId = req.params.userId;
  if (!id || typeof userId !== "string" || !validPost(req, res)) {
    fail(res, "Invalid request");
    return;
  }
  const app = await getDashboardApp(id).catch(() => null);
  if (!app) {
    res.status(404).end();
    return;
  }
  try {
    await changeAppUserRole(app, userId, field(req, "role", 10));
    redirect(res, "/dashboard/apps/" + id + "/users", "Role updated");
  } catch {
    fail(res, "User role change failed");
  }
});
