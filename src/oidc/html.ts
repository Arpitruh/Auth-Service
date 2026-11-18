export function escapeHtml(raw: string): string {
  return raw.replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[char]!));
}
export function loginHtml(name: string, flowId: string, csrf: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>Secure sign in</title>
<style>body{font-family:system-ui;background:#f5f6fa;display:grid;place-items:center;min-height:100vh;margin:0}
main{width:min(370px,90vw);padding:28px;background:#fff;border:1px solid #ddd;border-radius:14px}
label{display:block;margin:15px 0 5px}input{width:100%;box-sizing:border-box;padding:12px}
button{margin-top:22px;width:100%;padding:13px;border:0;border-radius:8px;background:#202a44;color:#fff;cursor:pointer}
small{color:#666}</style></head><body><main><h1>Sign in</h1>
<p>Continue to ${escapeHtml(name)}</p><form method="post" action="/oauth/authorize/complete">
<input type="hidden" name="flow" value="${escapeHtml(flowId)}">
<input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
<label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="username">
<label for="password">Password</label><input id="password" name="password" type="password" required autocomplete="current-password">
<button type="submit">Continue securely</button></form>
<small>Your account belongs only to this application.</small></main></body></html>`;
}
