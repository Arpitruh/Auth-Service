/** Strict credentialed CORS allowlist. This does not provide authentication or CSRF protection. */
export function parseAllowedOrigins(raw: string): ReadonlySet<string> {
  const values = raw.split(',').map((v) => v.trim()).filter(Boolean);
  if (values.length === 0) throw new Error('At least one CLIENT_ORIGIN is required.');
  const origins = new Set<string>();
  for (const value of values) {
    if (value === '*') throw new Error('Wildcard browser origins are not allowed with credentials.');
    let url: URL;
    try { url = new URL(value); }
    catch { throw new Error('CLIENT_ORIGINS must contain HTTP(S) origins.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.search || url.hash || url.pathname !== '/') {
      throw new Error('CLIENT_ORIGINS must contain origins without paths, query strings, or credentials.');
    }
    origins.add(url.origin);
  }
  return origins;
}
