import { escapeHtml as esc } from '../oidc/html.js';
import type { DashboardApplication } from './repository.js';
import type { OperatorSession } from './auth.js';

export const palette = {
  background:'#EBEBD8', primary:'#637545', dark:'#455230', muted:'#9BA685',
} as const;

const css = String.raw`
:root{--cream:#EBEBD8;--olive:#637545;--forest:#455230;--sage:#9BA685;--white:#fbfcf5;--ink:#28311f}
*{box-sizing:border-box}body{margin:0;background:var(--cream);color:var(--ink);font:15px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}
a{color:inherit;text-decoration:none}button,input,select,textarea{font:inherit}button{cursor:pointer}
.shell{display:grid;grid-template-columns:245px minmax(0,1fr);min-height:100vh}.aside{background:var(--forest);color:#f9f9ec;padding:30px 23px;display:flex;flex-direction:column;gap:42px}
.brand{display:flex;align-items:center;gap:12px;font-weight:800;letter-spacing:-.4px;font-size:21px}.mark{width:38px;height:38px;display:grid;place-items:center;border-radius:12px;background:var(--sage);color:var(--forest);font-size:24px}
.nav{display:grid;gap:7px}.nav a{display:flex;align-items:center;gap:13px;padding:13px 15px;border-radius:11px;color:#e3e9d9}
.nav a.active,.nav a:hover{background:rgba(235,235,216,.15);color:#fff}.nav span{font-size:20px}.asidefoot{margin-top:auto;color:#d0dac5;font-size:12px}
.main{padding:39px clamp(22px,5vw,70px);max-width:1500px;width:100%;margin:0 auto}.top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:34px}
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
@media(max-width:920px){.shell{grid-template-columns:1fr}.aside{padding:17px;gap:13px}.nav{display:flex;flex-wrap:wrap}.asidefoot{display:none}.main{padding:25px}.cards{grid-template-columns:1fr}.grid2{grid-template-columns:1fr}}
@media(max-width:600px){.top,.panelhead{flex-direction:column;align-items:flex-start}table{font-size:12px}td,th{padding:10px 4px}}
`;
function document(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${esc(title)} · Auth Garden</title><style>${css}</style></head><body>${body}</body></html>`;
}
export function layout(title: string, body: string, active = 'applications'): string {
  const nav = [['applications','/dashboard','▦','Applications'],['new','/dashboard/new','＋','Create app']];
  const links=nav.map(([key,href,icon,label])=>`<a class="${active===key?'active':''}" href="${href}"><span>${icon}</span>${label}</a>`).join('');
  return document(title,`<div class="shell"><aside class="aside"><div class="brand"><div class="mark">✳</div> Auth Garden</div><nav class="nav">${links}</nav><div class="asidefoot">CONTROL PLANE · ISOLATED IDENTITIES<br>Managed securely across your apps</div></aside><main class="main">${body}</main></div>`);
}
export function status(value: string): string {
  const type=['ACTIVE','READY'].includes(value)?'':'pending';
  const cls=['SUSPENDED','ERROR','DISABLED'].includes(value)?'error':type;
  return `<span class="pill ${cls}">${esc(value)}</span>`;
}
export function flash(message: string, kind: 'success'|'warn'|'error'='success'): string {
  return `<div class="notice ${kind==='warn'?'warn':kind==='error'?'bad':''}">${esc(message)}</div>`;
}
export function loginPage(message?: string): string {
  return document('Operator sign in',`<div class="login-wrap"><div class="login-card"><div class="brand"><div class="mark">✳</div> Auth Garden</div><p class="eyebrow" style="margin-top:36px">Secure operator access</p><h1>Welcome back.</h1><p class="sub">Sign in to manage your isolated application identities.</p>${message?flash(message,'error'):''}<form method="post" action="/dashboard/login"><div class="formrow"><label>Operator username</label><input name="username" autocomplete="username" required maxlength="120"></div><div class="formrow"><label>Password</label><input name="password" type="password" autocomplete="current-password" required maxlength="1024"></div><button class="btn" style="width:100%">Sign in securely →</button></form><p class="tiny" style="margin-top:25px">Operator sessions are private, expiring and server-side.</p></div></div>`);
}
export function appListPage(apps: DashboardApplication[], notice = ''): string {
  const active = apps.filter(a=>a.status==='ACTIVE').length;
  const ready = apps.filter(a=>a.provisionState==='READY').length;
  const rows=apps.map(app=>`<tr><td><a class="appname" href="/dashboard/apps/${encodeURIComponent(app.id)}">${esc(app.name)}</a><div class="tiny">${esc(app.slug)}</div></td><td>${esc(app.provider)}<div class="tiny">${esc(app.mode)}</div></td><td>${status(app.status)}</td><td>${status(app.provisionState)}</td><td><a class="appname" href="/dashboard/apps/${encodeURIComponent(app.id)}">Manage ↗</a></td></tr>`).join('');
  const body=`<div class="top"><div><div class="eyebrow">Overview / Control plane</div><h1>Your applications</h1><p class="sub">One dashboard. Separate identities for every project.</p></div><a class="btn" href="/dashboard/new">＋ New application</a></div>${notice?flash(notice):''}<div class="cards"><section class="stat"><div class="statlabel">Total applications</div><div class="statvalue">${apps.length}</div></section><section class="stat"><div class="statlabel">Active projects</div><div class="statvalue">${active}</div></section><section class="stat"><div class="statlabel">Databases ready</div><div class="statvalue">${ready}</div></section></div><section class="panel"><div class="panelhead"><h2>Application directory</h2><span class="pill">${apps.length} projects</span></div><table><thead><tr><th>Application</th><th>Database</th><th>App status</th><th>Provisioning</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="5" class="sub">No projects yet. Create your first app.</td></tr>'}</tbody></table></section><div class="notice">Every application's identity records remain in its own PostgreSQL database. This control plane stores only configuration and encrypted connection references.</div>`;
  return layout('Applications',body);
}
export function createAppPage(csrf: string, message=''): string {
  const body=`<div class="breadcrumbs"><a href="/dashboard">Applications</a> / Create</div><div class="eyebrow">Application setup</div><h1>Create a new app</h1><p class="sub">Register a client and choose how its isolated Auth database will be created.</p>${message?flash(message,'error'):''}<section class="panel" style="max-width:760px"><form method="post" action="/dashboard/apps"><input type="hidden" name="_csrf" value="${esc(csrf)}"><div class="grid2"><div class="formrow"><label>Application name</label><input name="name" placeholder="LeadLoop CRM" required maxlength="120"></div><div class="formrow"><label>Unique slug</label><input name="slug" placeholder="leadloop-crm" required pattern="[a-z0-9-]+"></div></div><div class="formrow"><label>Allowed callback URL</label><input name="redirectUri" type="url" placeholder="https://app.example.com/auth/callback" required><div class="tiny">Must be an exact HTTPS URL. Localhost HTTP is allowed for development.</div></div><div class="grid2"><div class="formrow"><label>Database provider</label><select name="provider"><option value="NEON">Neon PostgreSQL</option><option value="POSTGRESQL">Existing PostgreSQL</option></select></div><div class="formrow"><label>Database setup</label><select name="mode"><option value="MANAGED">Provision separate Neon project</option><option value="EXTERNAL">Connect existing empty database</option></select></div></div><div class="notice warn">Creating the application saves a DRAFT only. Neon resources are not created until you explicitly approve provisioning on the next screen.</div><button class="btn" type="submit">Create draft application →</button></form></section>`;
  return layout('Create application',body,'new');
}
export function detailPage(app: DashboardApplication, csrf: string, settings: {
 allowPasswordLogin: boolean; allowRegistration: boolean; sessionMinutes: number;
}, options: { notice?: string; count?: number|null; oneTimeKey?: string }={}): string {
  const row=(name:string,value:string)=>`<div class="metric-line"><span class="tiny">${esc(name)}</span><strong>${value}</strong></div>`;
  const canProvision=app.status==='DRAFT'&&app.provisionState==='PENDING';
  const canActivate=app.status==='DRAFT'&&app.provisionState==='READY';
  const csrfInput=`<input type="hidden" name="_csrf" value="${esc(csrf)}">`;
  const provision=canProvision
    ? app.mode==='MANAGED'
      ? `<form method="post" action="/dashboard/apps/${app.id}/provision">${csrfInput}<p class="sub">Creates a new Neon project and may incur charges. Provisioning cannot be reversed automatically.</p><label class="inline"><input type="checkbox" name="confirmCost" value="YES" required> I approve creating a billed Neon resource.</label><div style="margin-top:15px"><button class="btn">Approve & provision Neon</button></div></form>`
      : `<form method="post" action="/dashboard/apps/${app.id}/provision">${csrfInput}<div class="formrow"><label>Dedicated PostgreSQL connection URL</label><input type="password" name="connectionUrl" autocomplete="off" placeholder="postgresql://.../?sslmode=require" required></div><p class="tiny">Database must be empty, SSL-enabled, and on an approved hostname. Credentials are encrypted server-side.</p><button class="btn">Validate & connect database</button></form>`
    : `<div class="notice">Database provisioning: ${status(app.provisionState)}. Once ready, activate this application.</div>`;
  const activation=canActivate?`<form method="post" action="/dashboard/apps/${app.id}/activate">${csrfInput}<button class="btn">Activate application</button></form>`:'';
  const suspension=app.status==='ACTIVE'?`<form method="post" action="/dashboard/apps/${app.id}/suspend">${csrfInput}<button class="btn danger">Suspend application</button></form>`:'';
  const key=app.status==='ACTIVE'?`<form method="post" action="/dashboard/apps/${app.id}/keys">${csrfInput}<div class="formrow"><label>Credential label</label><input name="label" placeholder="Production BFF" required maxlength="100"></div><button class="btn light">Generate backend key</button></form>`:'<p class="tiny">Activate the app to issue credentials.</p>';
  const body=`<div class="breadcrumbs"><a href="/dashboard">Applications</a> / ${esc(app.name)}</div><div class="top"><div><div class="eyebrow">Application workspace</div><h1>${esc(app.name)}</h1><p class="sub">Manage client details, isolated database and security.</p></div>${status(app.status)}</div>${options.notice?flash(options.notice):''}${options.oneTimeKey?`<div class="notice warn"><strong>Copy this backend secret now — it will not be displayed again.</strong><p class="code">${esc(options.oneTimeKey)}</p>Only store it in a backend environment variable. Never put this key in a browser.</div>`:''}<div class="grid2"><section class="panel"><h2>Application details</h2>${row('Client ID',`<span class="code">${esc(app.clientId)}</span>`)}${row('Database provider',esc(app.provider))}${row('Provision mode',esc(app.mode))}${row('Database status',status(app.provisionState))}${row('Schema version',esc(app.schemaVersion||'Not initialized'))}${row('SSO',app.ssoEnabled?'On':'Off (isolated)')}${row('Users',options.count==null?'—':String(options.count))}<p><a class="btn light" href="/dashboard/apps/${app.id}/users">Manage users →</a></p><div class="formrow" style="margin-top:20px"><label>Registered callbacks</label>${app.redirectUris.map(u=>`<div class="code">${esc(u)}</div>`).join('')}</div></section><section class="panel"><h2>Database provisioning</h2>${provision}${activation}<div style="margin-top:15px">${suspension}</div></section></div><div class="grid2"><section class="panel"><h2>Authentication policy</h2><form method="post" action="/dashboard/apps/${app.id}/settings">${csrfInput}<div class="formrow"><label class="inline"><input type="checkbox" name="allowPasswordLogin" value="true" ${settings.allowPasswordLogin?'checked':''}> Password login enabled</label></div><div class="formrow"><label class="inline"><input type="checkbox" name="allowRegistration" value="true" ${settings.allowRegistration?'checked':''}> Registration enabled</label></div><div class="formrow"><label>Session policy (minutes)</label><input name="sessionMinutes" type="number" min="5" max="10080" value="${settings.sessionMinutes}"></div><button class="btn">Save policy</button></form><p class="tiny" style="margin-top:14px">Session duration is saved as configuration; custom token lifetime enforcement is not yet supported.</p></section><section class="panel"><h2>Backend credentials</h2><p class="sub">Generate an application-specific key for your server, never the frontend.</p>${key}</section></div>`;
  return layout(app.name,body);
}

export function appUsersPage(
  app: DashboardApplication, csrf: string,
  users: import('./repository.js').TenantUserRow[],
): string {
  const csrfInput='<input type="hidden" name="_csrf" value="'+esc(csrf)+'">';
  const rows=users.map(user=>`<tr>
    <td><div class="appname">${esc(user.email)}</div><div class="tiny">${esc(user.id)}</div></td>
    <td>${status(user.role)}</td>
    <td>${esc(new Date(user.createdAt).toLocaleDateString('en-US'))}</td>
    <td><form method="post" action="/dashboard/apps/${esc(app.id)}/users/${esc(user.id)}/role">
      ${csrfInput}
      <select name="role" aria-label="Role for ${esc(user.email)}">
      <option value="USER" ${user.role==='USER'?'selected':''}>USER</option>
      <option value="ADMIN" ${user.role==='ADMIN'?'selected':''}>ADMIN</option></select>
      <button class="btn light">Save</button></form></td>
    </tr>`).join('');
  return layout('Users · '+app.name,`
    <div class="breadcrumbs"><a href="/dashboard">Applications</a> / <a href="/dashboard/apps/${esc(app.id)}">${esc(app.name)}</a> / Users</div>
    <div class="eyebrow">Tenant identity directory</div>
    <h1>Users · ${esc(app.name)}</h1>
    <p class="sub">Showing up to 100 latest users from this application's own Auth database.</p>
    <section class="panel"><table><thead><tr><th>Identity</th><th>Role</th><th>Created</th><th>Manage</th></tr></thead>
    <tbody>${rows||'<tr><td colspan="4">No users found</td></tr>'}</tbody></table></section>`);
}
