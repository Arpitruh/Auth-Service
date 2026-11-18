import { isIP } from 'node:net';
import { ENV } from '../config/env.js';
import { distinctDatabaseTargets } from '../control-plane/registry.js';

export function validateTenantPostgresUrl(input: string): URL {
  let url: URL;
  try { url = new URL(input); } catch { throw new Error('Invalid PostgreSQL connection URL'); }
  if (!['postgresql:','postgres:'].includes(url.protocol) || !url.hostname ||
      !url.username || !url.password || !url.pathname || url.pathname === '/' ||
      url.hash || url.searchParams.get('sslmode') !== 'require') {
    throw new Error('Tenant database requires PostgreSQL credentials and sslmode=require');
  }
  if (isIP(url.hostname) || url.hostname === 'localhost' || !url.hostname.includes('.')) {
    throw new Error('Tenant database host must be a DNS hostname');
  }
  if (!distinctDatabaseTargets(input, ENV.DATABASE_URL) ||
      (ENV.CONTROL_PLANE_DATABASE_URL && !distinctDatabaseTargets(input, ENV.CONTROL_PLANE_DATABASE_URL))) {
    throw new Error('Tenant cannot use an existing service/control-plane database');
  }
  return url;
}
