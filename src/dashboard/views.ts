import { escapeHtml as esc } from "../oidc/html.js";
import type { DashboardApplication } from "./repository.js";
import type { OperatorSession } from "./auth.js";

export const palette = {
  background: "#EBEBD8",
  primary: "#637545",
  dark: "#455230",
  muted: "#9BA685",
} as const;

const css = String.raw`
:root{--cream:#EBEBD8;--olive:#637545;--forest:#455230;--sage:#9BA685;--white:#fbfcf5;--ink:#28311f}
*{box-sizing:border-box}body{margin:0;background:var(--cream);color:var(--ink);font:15px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}
a{color:inherit;text-decoration:none}button,input,select,textarea{font:inherit}button{cursor:pointer}button:disabled{opacity:.65;cursor:wait}.nav-logout{margin-top:auto}.nav-logout button{width:100%;border:1px solid #9BA685;background:transparent;color:#fff;text-align:left;padding:12px 15px;border-radius:10px}.nav-logout button:hover{background:rgba(255,255,255,.12)}.busy-note{display:none;margin-left:8px}.is-submitting .busy-note{display:inline}.auth-recovery{display:block;text-align:center;margin-top:15px;font-size:13px;text-decoration:underline;color:var(--forest)}
.shell{display:grid;grid-template-columns:245px minmax(0,1fr);height:100vh;height:100dvh;overflow:hidden;transition:grid-template-columns .22s ease}.aside{background:var(--forest);color:#f9f9ec;padding:24px 16px;display:flex;flex-direction:column;gap:26px;height:100%;min-height:0;overflow:hidden}.shell[data-sidebar="collapsed"]{grid-template-columns:80px minmax(0,1fr)}
.aside-brand-row{display:flex;align-items:center;justify-content:space-between;gap:8px}.aside .brand{min-width:0;white-space:nowrap;overflow:hidden}.aside .brand-label{overflow:hidden;text-overflow:ellipsis}.sidebar-toggle,.mobile-sidebar-toggle{border:1px solid rgba(255,255,255,.24);background:rgba(255,255,255,.1);color:#fff;border-radius:9px;padding:8px;min-width:36px;min-height:36px;display:inline-grid;place-items:center;flex-shrink:0}.sidebar-toggle:hover,.mobile-sidebar-toggle:hover{background:rgba(255,255,255,.22)}.sidebar-toggle-icon{font-size:20px;line-height:1}
.shell[data-sidebar="collapsed"] .aside{padding:24px 13px}.shell[data-sidebar="collapsed"] .aside-brand-row{flex-direction:column;gap:16px}.shell[data-sidebar="collapsed"] .aside .brand-label,.shell[data-sidebar="collapsed"] .nav-label,.shell[data-sidebar="collapsed"] .asidefoot,.shell[data-sidebar="collapsed"] .logout-label,.shell[data-sidebar="collapsed"] .nav-logout .busy-note{display:none}.shell[data-sidebar="collapsed"] .nav a{justify-content:center;padding:12px}.shell[data-sidebar="collapsed"] .nav-logout button{display:grid;place-items:center;padding:10px}.shell[data-sidebar="collapsed"] .nav a span:first-child{font-size:23px}
.mobile-sidebar-toggle{display:none;background:var(--forest);border-color:var(--forest)}.sidebar-mobile-bar{display:none}.sidebar-backdrop{display:none}
.brand{display:flex;align-items:center;gap:12px;font-weight:800;letter-spacing:-.4px;font-size:21px}.mark{width:38px;height:38px;display:grid;place-items:center;border-radius:12px;background:var(--sage);color:var(--forest);font-size:24px}
.nav{display:grid;gap:7px}.nav a{display:flex;align-items:center;gap:13px;padding:13px 15px;border-radius:11px;color:#e3e9d9}
.nav a.active,.nav a:hover{background:rgba(235,235,216,.15);color:#fff}.nav span{font-size:20px}.asidefoot{margin-top:auto;color:#d0dac5;font-size:12px}
.main{padding:39px clamp(22px,5vw,70px) 22px;max-width:1500px;width:100%;margin:0 auto;min-width:0;min-height:0;height:100%;overflow-y:auto;overscroll-behavior:contain;display:flex;flex-direction:column}.main-content{flex:1;min-width:0}.top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:34px}
.eyebrow{text-transform:uppercase;font-weight:700;letter-spacing:2px;font-size:11px;color:var(--olive)}h1{font-size:clamp(29px,4vw,43px);letter-spacing:-1.7px;line-height:1.12;margin:5px 0 10px;color:var(--forest)}h2{font-size:20px;letter-spacing:-.5px;margin:0 0 14px}
.sub{color:#69735f;margin:0 0 24px}.btn{display:inline-flex;justify-content:center;align-items:center;gap:10px;background:var(--olive);color:white;border:0;border-radius:11px;padding:12px 18px;font-weight:700}
.btn:hover{background:var(--forest)}.btn.light{background:var(--cream);color:var(--forest);border:1px solid #b4bea4}.btn.danger{background:#8d5548}
.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:17px;margin-bottom:30px}.stat,.panel{border:1px solid #d3d9c6;border-radius:18px;background:var(--white);box-shadow:0 10px 30px rgba(69,82,48,.04)}
.stat{padding:24px}.statlabel{color:#6f795f;font-size:13px;font-weight:600}.statvalue{color:var(--forest);font-weight:800;font-size:34px;letter-spacing:-1px;margin-top:8px}
.panel{padding:25px;margin-bottom:22px}.panelhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
table{width:100%;border-collapse:collapse;text-align:left}th{color:#7c856e;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.9px}
td,th{padding:17px 10px;border-bottom:1px solid #e4e8d8}tr:last-child td{border-bottom:0}.appname{font-weight:750;color:var(--forest)}.tiny{font-size:12px;color:#7b8373}
.pill{display:inline-flex;padding:5px 10px;border-radius:99px;background:#e3e9d4;color:#566b3b;font-size:11px;font-weight:800;letter-spacing:.3px}
.pill.pending{background:#f3ebd2;color:#866c31}.pill.suspended,.pill.error{background:#f6dfd6;color:#974d3d}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:22px}.formrow{margin:0 0 17px}label{display:block;font-weight:700;color:var(--forest);font-size:13px;margin:0 0 7px}
input,select,textarea{width:100%;border:1px solid #cbd2bd;padding:12px 13px;border-radius:9px;background:#fff;color:#243021;outline:none}
input:focus,select:focus,textarea:focus{border-color:var(--olive);box-shadow:0 0 0 3px rgba(155,166,133,.22)}input[type=checkbox]{width:auto;accent-color:var(--olive)}
.inline{display:flex;align-items:center;gap:9px}.inline label{margin:0}.notice{padding:14px 17px;border-radius:11px;background:#e4eacc;color:#455230;font-size:13px;margin-bottom:20px}
.notice.warn{background:#f6e7cf;color:#815c31}.notice.bad{background:#f7e0d8;color:#913e2e}
.code{background:#e9eedd;padding:11px 13px;border-radius:8px;overflow-wrap:anywhere;font-family:ui-monospace,monospace;font-size:12px}
.actions{display:flex;gap:10px;flex-wrap:wrap}.breadcrumbs{font-size:13px;color:#758269;margin-bottom:20px}.breadcrumbs a{text-decoration:underline}
.login-wrap{min-height:100vh;display:grid;place-items:center;padding:20px;background:radial-gradient(circle at 15% 10%,#c7cfb5 0,transparent 40%),var(--cream)}
.login-card{background:var(--white);border:1px solid #cbd4ba;border-radius:23px;padding:38px;max-width:430px;width:100%;box-shadow:0 30px 100px rgba(69,82,48,.09)}
.metric-line{display:flex;justify-content:space-between;align-items:center;padding:13px 0;border-bottom:1px solid #e4e8dc}.metric-line:last-child{border-bottom:none}
:focus-visible{outline:3px solid #91a96c;outline-offset:3px}
.btn,.nav a,.appname{transition:background .18s,transform .18s,box-shadow .18s}.btn:active:not(:disabled){transform:scale(.985)}
.btn[aria-busy=true],button[aria-busy=true]{opacity:.78;cursor:progress}
.btn[aria-busy=true]::before,button[aria-busy=true]::before{content:'';display:inline-block;width:15px;height:15px;flex:0 0 15px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:auth-spin .7s linear infinite}
.auth-foot{border-top:1px solid #d3d9c6;padding:26px 0 10px;margin-top:auto;color:#68775b}
.auth-foot-grid{display:grid;grid-template-columns:minmax(180px,1.6fr) repeat(2,minmax(110px,1fr));gap:22px}
.auth-foot strong{display:block;color:var(--forest);margin-bottom:8px;font-size:14px}.auth-foot p{font-size:12px;line-height:1.65;margin:5px 0;color:#68775b}.auth-foot nav{display:grid;gap:9px}.auth-foot a{font-size:12px;color:#455230;text-decoration:underline;text-underline-offset:3px}
.auth-foot-line{border-top:1px solid #d3d9c6;margin-top:19px;padding-top:15px;display:flex;gap:12px;justify-content:space-between;flex-wrap:wrap;font-size:12px}
.login-wrap{display:flex;flex-direction:column;justify-content:space-between;align-items:stretch;gap:35px}.login-card{margin:auto}.login-wrap>.auth-foot{width:min(100%,1080px);margin:0 auto}
.empty-state{text-align:center;padding:50px 24px;background:linear-gradient(140deg,#f8faf1,#eef1e3);border:1px dashed #bdcba9;border-radius:16px}
.empty-icon{width:58px;height:58px;display:grid;place-items:center;margin:0 auto 17px;background:#dde8cc;color:var(--forest);font-size:28px;border-radius:17px}
.empty-state h3{margin:0 0 7px;color:var(--forest);font-size:21px}.empty-state p{max-width:530px;margin:0 auto 19px;color:#67745d}
.empty-state .btn{display:inline-flex}.table-wrap{overflow-x:auto;width:100%}
.nav-progress{position:fixed;z-index:100;inset:0;background:rgba(241,244,232,.92);backdrop-filter:blur(5px);display:none;align-items:center;justify-content:center;padding:20px}
.nav-progress[aria-hidden=false]{display:flex}.nav-progress-card{width:min(580px,100%);background:var(--white);padding:28px;border:1px solid #d3d9c6;border-radius:18px;box-shadow:0 20px 60px #28311f17}
.nav-progress-card strong{display:block;color:var(--forest);font-size:18px;margin-bottom:7px}
.loading-bar{height:14px;border-radius:8px;background:linear-gradient(90deg,#e6ebd9 0%,#fafbf4 45%,#e6ebd9 90%);background-size:220% 100%;animation:auth-shimmer 1.4s linear infinite;margin-top:17px}
.loading-bar.short{width:45%}.loading-bar.medium{width:75%}.loading-bar.full{height:22px;width:100%}
.form-error{border-radius:9px;padding:12px;background:#f6dfd6;color:#893d2e;font-size:13px}.filter-empty{padding:22px;text-align:center;color:#647454}
@keyframes auth-spin{to{transform:rotate(360deg)}}@keyframes auth-shimmer{to{background-position-x:-220%}}
@media(prefers-reduced-motion:reduce){.loading-bar,.btn[aria-busy=true]::before,button[aria-busy=true]::before{animation:none!important}.btn,.nav a,.appname,.shell,.aside{transition:none!important}}
@media(max-width:920px){.shell,.shell[data-sidebar="collapsed"]{grid-template-columns:minmax(0,1fr)}.aside{position:fixed;inset:0 auto 0 0;width:min(285px,85vw);z-index:80;padding:24px 16px;transform:translateX(-105%);transition:transform .22s ease;box-shadow:12px 0 40px #1b241733}.shell[data-mobile-sidebar="open"] .aside{transform:translateX(0)}.shell[data-sidebar="collapsed"] .aside{padding:24px 16px}.shell[data-sidebar="collapsed"] .aside-brand-row{flex-direction:row}.shell[data-sidebar="collapsed"] .aside .brand-label,.shell[data-sidebar="collapsed"] .nav-label,.shell[data-sidebar="collapsed"] .asidefoot,.shell[data-sidebar="collapsed"] .logout-label{display:initial}.shell[data-sidebar="collapsed"] .nav a{justify-content:flex-start;padding:13px 15px}.shell[data-sidebar="collapsed"] .nav-logout button{display:block;padding:12px 15px}.nav{display:grid}.asidefoot{display:block}.main{padding:25px}.cards{grid-template-columns:1fr}.grid2{grid-template-columns:1fr}.sidebar-mobile-bar{display:flex;align-items:center;gap:12px;margin-bottom:22px}.mobile-sidebar-toggle{display:inline-grid}.sidebar-mobile-bar strong{color:var(--forest)}.sidebar-backdrop{position:fixed;inset:0;z-index:79;background:#17201488;display:none;border:0}.shell[data-mobile-sidebar="open"] .sidebar-backdrop{display:block}}
@media(max-width:600px){.top,.panelhead{flex-direction:column;align-items:flex-start}table{font-size:12px}td,th{padding:10px 4px}.auth-foot-grid{grid-template-columns:1fr 1fr}.auth-foot-grid>div:first-child{grid-column:1/-1}.main{padding:22px 17px 10px}.empty-state{padding:30px 16px}}
`;
const siteFooter = "<footer class=\"auth-foot\" aria-label=\"Website footer\"><div class=\"auth-foot-grid\"><div><strong>✳ Auth Garden</strong><p>A home for your application identities. Set up clients, manage access and keep each project's user database separate.</p></div><div><strong>Platform</strong><nav aria-label=\"Platform links\"><a href=\"/dashboard\">Applications</a><a href=\"/dashboard/new\">Create application</a><a href=\"/health\" target=\"_blank\" rel=\"noopener noreferrer\">Service health</a></nav></div><div><strong>Resources</strong><nav aria-label=\"Resource links\"><a href=\"/docs\" target=\"_blank\" rel=\"noopener noreferrer\">API documentation</a><a href=\"https://github.com/Arpitruh/Auth-Service\" target=\"_blank\" rel=\"noopener noreferrer\">GitHub repository</a></nav></div></div><div class=\"auth-foot-line\"><span>© 2026 Auth Garden. Built for isolated app authentication.</span><span>Secure control plane · Auth Service</span></div></footer>";
function document(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="same-origin"><title>${esc(title)} · Auth Garden</title><style>${css}</style><script src="/dashboard/ui.js" defer></script></head><body>${body}</body></html>`;
}
export function layout(title: string, body: string, active = "applications", csrf = ""): string {
  const nav = [
    ["applications", "/dashboard", "▦", "Applications"],
    ["new", "/dashboard/new", "＋", "Create app"],
  ];
  const links = nav
    .map(
      ([key, href, icon, label]) =>
        `<a class="${active === key ? "active" : ""}" href="${href}" title="${label}" ${active === key ? 'aria-current="page"' : ""}><span aria-hidden="true">${icon}</span><span class="nav-label">${label}</span></a>`,
    )
    .join("");
  const account = csrf ? `<form class="nav-logout" method="post" action="/dashboard/logout"><input type="hidden" name="_csrf" value="${esc(csrf)}"><button type="submit"><span aria-hidden="true">↪</span><span class="logout-label">Sign out securely</span><span class="busy-note">Signing out…</span></button></form>` : "";
  return document(
    title,
    `<div class="shell" id="auth-shell" data-sidebar="expanded" data-mobile-sidebar="closed"><aside class="aside" id="auth-sidebar" aria-label="Application sidebar"><div class="aside-brand-row"><div class="brand"><div class="mark">✳</div><span class="brand-label">Auth Garden</span></div><button class="sidebar-toggle" type="button" aria-label="Collapse sidebar" aria-controls="auth-sidebar" aria-expanded="true" title="Toggle sidebar"><span class="sidebar-toggle-icon" aria-hidden="true">☰</span></button></div><nav class="nav" aria-label="Main navigation">${links}</nav>${account}<div class="asidefoot">CONTROL PLANE · ISOLATED IDENTITIES<br>Managed securely across your apps</div></aside><button type="button" class="sidebar-backdrop" aria-label="Close navigation menu"></button><main class="main"><div class="sidebar-mobile-bar"><button class="mobile-sidebar-toggle" type="button" aria-controls="auth-sidebar" aria-expanded="false" aria-label="Open navigation menu">☰</button><strong>Auth Garden</strong></div><div class="main-content">${body}</div>${siteFooter}</main></div>`,
  );
}
export function status(value: string): string {
  const type = ["ACTIVE", "READY"].includes(value) ? "" : "pending";
  const cls = ["SUSPENDED", "ERROR", "DISABLED"].includes(value) ? "error" : type;
  return `<span class="pill ${cls}">${esc(value)}</span>`;
}
export function flash(message: string, kind: "success" | "warn" | "error" = "success"): string {
  return `<div class="notice ${kind === "warn" ? "warn" : kind === "error" ? "bad" : ""}">${esc(message)}</div>`;
}
export function loginPage(message?: string): string {
  return document(
    "Operator sign in",
    `<div class="login-wrap"><div class="login-card"><div class="brand"><div class="mark">✳</div> Auth Garden</div><p class="eyebrow" style="margin-top:36px">Secure operator access</p><h1>Welcome back.</h1><p class="sub">Sign in to manage your isolated application identities.</p>${message ? flash(message, "error") : ""}<form method="post" action="/dashboard/login"><div class="formrow"><label>Operator username</label><input name="username" autocomplete="username" required maxlength="120"></div><div class="formrow"><label>Password</label><input name="password" type="password" autocomplete="current-password" required maxlength="1024"></div><button class="btn" style="width:100%">Sign in securely →<span class="busy-note"> Signing in…</span></button></form><a class="auth-recovery" href="/dashboard/recover">Need to reset your operator password?</a><p class="tiny" style="margin-top:25px">Operator sessions are private, expiring and server-side.</p></div>${siteFooter}</div>`,
  );
}
export function appListPage(apps: DashboardApplication[], notice = "", csrf = ""): string {
  const active = apps.filter((a) => a.status === "ACTIVE").length;
  const ready = apps.filter((a) => a.provisionState === "READY").length;
  const rows = apps
    .map(
      (app) =>
        `<tr data-application-row data-status="${esc(app.status)}" data-search="${esc((app.name + " " + app.slug + " " + app.provider).toLowerCase())}"><td><a class="appname" href="/dashboard/apps/${encodeURIComponent(app.id)}">${esc(app.name)}</a><div class="tiny">${esc(app.slug)}</div></td><td>${esc(app.provider)}<div class="tiny">${esc(app.mode)}</div></td><td>${status(app.status)}</td><td>${status(app.provisionState)}</td><td><a class="appname" href="/dashboard/apps/${encodeURIComponent(app.id)}">Manage ↗</a></td></tr>`,
    )
    .join("");
  const body = `<div class="top"><div><div class="eyebrow">Overview / Control plane</div><h1>Your applications</h1><p class="sub">One dashboard. Separate identities for every project.</p></div><a class="btn" href="/dashboard/new">＋ New application</a></div>${notice ? flash(notice) : ""}<div class="cards"><section class="stat"><div class="statlabel">Total applications</div><div class="statvalue">${apps.length}</div></section><section class="stat"><div class="statlabel">Active projects</div><div class="statvalue">${active}</div></section><section class="stat"><div class="statlabel">Databases ready</div><div class="statvalue">${ready}</div></section></div><section class="panel"><div class="panelhead"><h2>Application directory</h2><span class="pill">${apps.length} projects</span></div><div class="grid2" style="margin-bottom:16px"><div><label for="app-search">Search applications</label><input id="app-search" type="search" placeholder="Search by app name, slug or provider"></div><div><label for="app-status">Filter by status</label><select id="app-status"><option value="">All statuses</option><option value="DRAFT">Draft</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></select></div></div><p class="tiny" id="filter-count" role="status" aria-live="polite"></p><div class="table-wrap"><table><thead><tr><th>Application</th><th>Database</th><th>App status</th><th>Provisioning</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="5"><div class="empty-state"><div class="empty-icon" aria-hidden="true">▦</div><h3>Your application directory is ready</h3><p>No Auth Garden applications are registered in this control plane yet. Apps created in Notification Service are managed separately and do not appear here automatically.</p><a class="btn" href="/dashboard/new">＋ Create your first application</a><p class="tiny" style="margin-top:16px">Creating a draft does not provision or charge for a database.</p></div></td></tr>'}</tbody></table></div></section><div class="notice">Every application's identity records remain in its own PostgreSQL database. This control plane stores only configuration and encrypted connection references.</div>`;
  return layout("Applications", body, "applications", csrf);
}
export function createAppPage(csrf: string, message = ""): string {
  const body = `<div class="breadcrumbs"><a href="/dashboard">Applications</a> / Create</div><div class="eyebrow">Application setup</div><h1>Create a new app</h1><p class="sub">Register a client and choose how its isolated Auth database will be created.</p>${message ? flash(message, "error") : ""}<section class="panel" style="max-width:760px"><form method="post" action="/dashboard/apps"><input type="hidden" name="_csrf" value="${esc(csrf)}"><div class="grid2"><div class="formrow"><label>Application name</label><input name="name" placeholder="LeadLoop CRM" required maxlength="120"></div><div class="formrow"><label>Unique slug</label><input name="slug" placeholder="leadloop-crm" required pattern="[a-z0-9-]+"></div></div><div class="formrow"><label>Allowed callback URL</label><input name="redirectUri" type="url" placeholder="https://app.example.com/auth/callback" required><div class="tiny">Must be an exact HTTPS URL. Localhost HTTP is allowed for development.</div></div><div class="grid2"><div class="formrow"><label>Database provider</label><select name="provider"><option value="NEON">Neon PostgreSQL</option><option value="POSTGRESQL">Existing PostgreSQL</option></select></div><div class="formrow"><label>Database setup</label><select name="mode"><option value="MANAGED">Provision separate Neon project</option><option value="EXTERNAL">Connect existing empty database</option></select></div></div><div class="notice warn">Creating the application saves a DRAFT only. Neon resources are not created until you explicitly approve provisioning on the next screen.</div><button class="btn" type="submit">Create draft application →</button></form></section>`;
  return layout("Create application", body, "new", csrf);
}
export function detailPage(
  app: DashboardApplication,
  csrf: string,
  settings: {
    allowPasswordLogin: boolean;
    allowRegistration: boolean;
    sessionMinutes: number;
  },
  options: { notice?: string; count?: number | null; oneTimeKey?: string } = {},
): string {
  const row = (name: string, value: string) =>
    `<div class="metric-line"><span class="tiny">${esc(name)}</span><strong>${value}</strong></div>`;
  const canProvision = app.status === "DRAFT" && app.provisionState === "PENDING";
  const canActivate = app.status === "DRAFT" && app.provisionState === "READY";
  const csrfInput = `<input type="hidden" name="_csrf" value="${esc(csrf)}">`;
  const provision = canProvision
    ? app.mode === "MANAGED"
      ? `<form method="post" action="/dashboard/apps/${app.id}/provision">${csrfInput}<p class="sub">Creates a new Neon project and may incur charges. Provisioning cannot be reversed automatically.</p><label class="inline"><input type="checkbox" name="confirmCost" value="YES" required> I approve creating a billed Neon resource.</label><div style="margin-top:15px"><button class="btn">Approve & provision Neon</button></div></form>`
      : `<form method="post" action="/dashboard/apps/${app.id}/provision">${csrfInput}<div class="formrow"><label>Dedicated PostgreSQL connection URL</label><input type="password" name="connectionUrl" autocomplete="off" placeholder="postgresql://.../?sslmode=require" required></div><p class="tiny">Database must be empty, SSL-enabled, and on an approved hostname. Credentials are encrypted server-side.</p><button class="btn">Validate & connect database</button></form>`
    : `<div class="notice">Database provisioning: ${status(app.provisionState)}. Once ready, activate this application.</div>`;
  const activation = canActivate
    ? `<form method="post" action="/dashboard/apps/${app.id}/activate">${csrfInput}<button class="btn">Activate application</button></form>`
    : "";
  const suspension =
    app.status === "ACTIVE"
      ? `<form method="post" action="/dashboard/apps/${app.id}/suspend">${csrfInput}<button class="btn danger">Suspend application</button></form>`
      : "";
  const key =
    app.status === "ACTIVE"
      ? `<form method="post" action="/dashboard/apps/${app.id}/keys">${csrfInput}<div class="formrow"><label>Credential label</label><input name="label" placeholder="Production BFF" required maxlength="100"></div><button class="btn light">Generate backend key</button></form>`
      : '<p class="tiny">Activate the app to issue credentials.</p>';
  const body = `<div class="breadcrumbs"><a href="/dashboard">Applications</a> / ${esc(app.name)}</div><div class="top"><div><div class="eyebrow">Application workspace</div><h1>${esc(app.name)}</h1><p class="sub">Manage client details, isolated database and security.</p></div>${status(app.status)}</div>${options.notice ? flash(options.notice) : ""}${options.oneTimeKey ? `<div class="notice warn"><strong>Copy this backend secret now — it will not be displayed again.</strong><p class="code">${esc(options.oneTimeKey)}</p>Only store it in a backend environment variable. Never put this key in a browser.</div>` : ""}<div class="grid2"><section class="panel"><h2>Application details</h2>${row("Client ID", `<span class="code">${esc(app.clientId)}</span>`)}${row("Database provider", esc(app.provider))}${row("Provision mode", esc(app.mode))}${row("Database status", status(app.provisionState))}${row("Schema version", esc(app.schemaVersion || "Not initialized"))}${row("SSO", app.ssoEnabled ? "On" : "Off (isolated)")}${row("Users", options.count == null ? "—" : String(options.count))}<p><a class="btn light" href="/dashboard/apps/${app.id}/users">Manage users →</a></p><div class="formrow" style="margin-top:20px"><label>Registered callbacks</label>${app.redirectUris.map((u) => `<div class="code">${esc(u)}</div>`).join("")}</div></section><section class="panel"><h2>Database provisioning</h2>${provision}${activation}<div style="margin-top:15px">${suspension}</div></section></div><div class="grid2"><section class="panel"><h2>Authentication policy</h2><form method="post" action="/dashboard/apps/${app.id}/settings">${csrfInput}<div class="formrow"><label class="inline"><input type="checkbox" name="allowPasswordLogin" value="true" ${settings.allowPasswordLogin ? "checked" : ""}> Password login enabled</label></div><div class="formrow"><label class="inline"><input type="checkbox" name="allowRegistration" value="true" ${settings.allowRegistration ? "checked" : ""}> Registration enabled</label></div><div class="formrow"><label>Session policy (minutes)</label><input name="sessionMinutes" type="number" min="5" max="10080" value="${settings.sessionMinutes}"></div><button class="btn">Save policy</button></form><p class="tiny" style="margin-top:14px">Session duration is saved as configuration; custom token lifetime enforcement is not yet supported.</p></section><section class="panel"><h2>Backend credentials</h2><p class="sub">Generate an application-specific key for your server, never the frontend.</p>${key}</section></div>`;
  return layout(app.name, body, "applications", csrf);
}

export function appUsersPage(
  app: DashboardApplication,
  csrf: string,
  users: import("./repository.js").TenantUserRow[],
): string {
  const csrfInput = '<input type="hidden" name="_csrf" value="' + esc(csrf) + '">';
  const rows = users
    .map(
      (user) => `<tr>
    <td><div class="appname">${esc(user.email)}</div><div class="tiny">${esc(user.id)}</div></td>
    <td>${status(user.role)}</td>
    <td>${esc(new Date(user.createdAt).toLocaleDateString("en-US"))}</td>
    <td><form method="post" action="/dashboard/apps/${esc(app.id)}/users/${esc(user.id)}/role">
      ${csrfInput}
      <select name="role" aria-label="Role for ${esc(user.email)}">
      <option value="USER" ${user.role === "USER" ? "selected" : ""}>USER</option>
      <option value="ADMIN" ${user.role === "ADMIN" ? "selected" : ""}>ADMIN</option></select>
      <button class="btn light">Save</button></form></td>
    </tr>`,
    )
    .join("");
  return layout(
    "Users · " + app.name,
    `
    <div class="breadcrumbs"><a href="/dashboard">Applications</a> / <a href="/dashboard/apps/${esc(app.id)}">${esc(app.name)}</a> / Users</div>
    <div class="eyebrow">Tenant identity directory</div>
    <h1>Users · ${esc(app.name)}</h1>
    <p class="sub">Showing up to 100 latest users from this application's own Auth database.</p>
    <section class="panel"><table><thead><tr><th>Identity</th><th>Role</th><th>Created</th><th>Manage</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4">No users found</td></tr>'}</tbody></table></section>`,
    "applications", csrf,
  );
}

/** External JS is permitted by our strict CSP; no inline scripts or unsafe-inline. */
export const dashboardUiScript = `(function() {
  // Progressive enhancement: navigation and forms still work without JS.
  const overlay = document.createElement("div");
  overlay.className = "nav-progress";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = '<div class="nav-progress-card"><strong id="progress-title">Loading your workspace…</strong><p class="sub">Getting the next page ready.</p><div class="loading-bar full"></div><div class="loading-bar medium"></div><div class="loading-bar short"></div></div>';
  document.body.appendChild(overlay);
  const shell = document.getElementById("auth-shell");
  const toggle = document.querySelector(".sidebar-toggle");
  const mobileToggle = document.querySelector(".mobile-sidebar-toggle");
  const backdrop = document.querySelector(".sidebar-backdrop");
  if (shell && toggle && mobileToggle && backdrop) {
    const mobile = window.matchMedia("(max-width: 920px)");
    let collapsed = false;
    try { collapsed = window.localStorage.getItem("auth-garden-sidebar") === "collapsed"; } catch {}
    function syncSidebar() {
      shell.dataset.sidebar = collapsed ? "collapsed" : "expanded";
      const expanded = !collapsed;
      toggle.setAttribute("aria-expanded", String(expanded));
      toggle.setAttribute("aria-label", expanded ? "Collapse sidebar" : "Expand sidebar");
      const mobileOpen = shell.dataset.mobileSidebar === "open";
      mobileToggle.setAttribute("aria-expanded", String(mobileOpen));
      mobileToggle.setAttribute("aria-label", mobileOpen ? "Close navigation menu" : "Open navigation menu");
      backdrop.setAttribute("aria-hidden", String(!mobileOpen));
    }
    toggle.addEventListener("click", function() {
      if (mobile.matches) shell.dataset.mobileSidebar = "closed";
      else {
        collapsed = !collapsed;
        try { window.localStorage.setItem("auth-garden-sidebar", collapsed ? "collapsed" : "expanded"); } catch {}
      }
      syncSidebar();
    });
    mobileToggle.addEventListener("click", function() {
      shell.dataset.mobileSidebar = shell.dataset.mobileSidebar === "open" ? "closed" : "open";
      syncSidebar();
    });
    backdrop.addEventListener("click", function() { shell.dataset.mobileSidebar = "closed"; syncSidebar(); });
    document.addEventListener("keydown", function(event) {
      if (event.key === "Escape" && shell.dataset.mobileSidebar === "open") {
        shell.dataset.mobileSidebar = "closed"; syncSidebar(); mobileToggle.focus();
      }
    });
    mobile.addEventListener("change", function() { shell.dataset.mobileSidebar = "closed"; syncSidebar(); });
    syncSidebar();
  }
  function loading(message) {
    const title = document.getElementById("progress-title");
    if (title) title.textContent = message;
    overlay.setAttribute("aria-hidden", "false");
  }
  function reset() {
    overlay.setAttribute("aria-hidden", "true");
    document.querySelectorAll("form.is-submitting").forEach(function(form) {
      form.classList.remove("is-submitting");
      form.dataset.submitting = "0";
      form.querySelectorAll("button[aria-busy=true]").forEach(function(button) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      });
    });
  }
  window.addEventListener("pageshow", reset);

  document.addEventListener("submit", function(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.dataset.submitting === "1") { event.preventDefault(); return; }
    if (!form.checkValidity()) return;
    form.dataset.submitting = "1";
    form.classList.add("is-submitting");
    const submitter = event.submitter instanceof HTMLButtonElement
      ? event.submitter : form.querySelector("button[type=submit], button:not([type])");
    if (submitter instanceof HTMLButtonElement) {
      submitter.setAttribute("aria-busy", "true");
      // Defer disabled state so the browser can capture submitter form values.
      setTimeout(function() { submitter.disabled = true; }, 0);
    }
    loading(form.action.includes("/login") ? "Signing in securely…" :
      form.action.includes("/logout") ? "Signing out…" : "Saving your changes…");
  });

  document.addEventListener("click", function(event) {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest("a[href]");
    if (!(link instanceof HTMLAnchorElement) || event.defaultPrevented ||
      event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
      (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || url.pathname === location.pathname && url.search === location.search) return;
    loading("Opening " + (link.textContent.trim() || "page") + "…");
  });

  const search = document.getElementById("app-search");
  const status = document.getElementById("app-status");
  const counter = document.getElementById("filter-count");
  if (!(search instanceof HTMLInputElement) || !(status instanceof HTMLSelectElement)) return;
  const rows = Array.from(document.querySelectorAll("[data-application-row]"));
  if (rows.length === 0) return;
  const table = document.querySelector(".table-wrap");
  const empty = document.createElement("p");
  empty.className = "filter-empty";
  empty.setAttribute("role", "status");
  empty.textContent = "No applications match these filters. Clear the search or choose another status.";
  empty.hidden = true;
  if (table) table.after(empty);
  const filter = function() {
    const query = search.value.trim().toLowerCase();
    let visible = 0;
    rows.forEach(function(row) {
      const matches = (row.getAttribute("data-search") || "").includes(query) &&
        (!status.value || row.getAttribute("data-status") === status.value);
      row.hidden = !matches;
      if (matches) visible++;
    });
    if (counter) counter.textContent = visible + " of " + rows.length + " applications shown";
    empty.hidden = visible !== 0;
  };
  search.addEventListener("input", filter);
  status.addEventListener("change", filter);
  filter();
})();`;

/** Recovery is intentionally operator-assisted: no unauthenticated reset links. */
export function recoveryPage(): string {
  return document("Operator password recovery", `<div class="login-wrap"><section class="login-card"><div class="brand"><div class="mark">✳</div> Auth Garden</div><h1 style="margin-top:28px">Reset operator access</h1><p class="sub">For security, this deployment does not offer email-based admin recovery. The service administrator must rotate the password hash through Render.</p><ol><li>Generate a new Argon2id hash in your trusted Auth Service terminal.</li><li>Update <code>DASHBOARD_OPERATOR_PASSWORD_HASH</code> in Render's Environment settings.</li><li>Redeploy the service, then sign in with the newly chosen password.</li></ol><div class="notice warn">Use a unique strong password. Do not enter your password into third-party hash generators.</div><a class="btn light" href="/dashboard/login">← Back to sign in</a></section>${siteFooter}</div>`);
}
