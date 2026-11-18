/** Exact-match redirect URI policy for registered OIDC clients.
 * Redirect allowlisting is NOT client authentication by itself.
 */
export function canonicalRedirectUri(input: string): string {
  if (input.length > 2048 || !input.trim() || /[\\\r\n\t]/.test(input)) {
    throw new Error('Redirect URI is invalid');
  }
  const raw = new URL(input);
  if (raw.username || raw.password || raw.hash || raw.hostname.endsWith('.') ||
      raw.hostname.includes('*') || raw.pathname.includes('..')) {
    throw new Error('Redirect URI contains unsafe components');
  }
  const loopback = raw.hostname === 'localhost' || raw.hostname === '127.0.0.1' || raw.hostname === '[::1]';
  if (raw.protocol !== 'https:' && !(raw.protocol === 'http:' && loopback)) {
    throw new Error('HTTPS is required outside loopback development');
  }
  if (raw.protocol === 'http:' && raw.hostname !== 'localhost' && !loopback) {
    throw new Error('Non-local insecure redirect is forbidden');
  }
  // Do not strip query params: OAuth requires exact redirect matching.
  return raw.toString();
}

export function validateRedirectUris(values: string[]): string[] {
  if (!values.length || values.length > 20) throw new Error('1-20 redirect URIs are required');
  const normalized = values.map(canonicalRedirectUri);
  if (new Set(normalized).size !== normalized.length) throw new Error('Duplicate redirect URI');
  return normalized;
}
