import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { validateTenantPostgresUrl } from './connection-policy.js';

const run = promisify(execFile);
const migrationVersion = '20260911120000_hardening_token_lifecycle';

/** Validate isolation: only initialize an empty database; never touch arbitrary app business tables. */
export async function migrateFreshTenantDatabase(connectionString: string): Promise<string> {
  const url = validateTenantPostgresUrl(connectionString);
  const pool = new Pool({
    connectionString: url.toString(),
    max: 1,
    connectionTimeoutMillis: 10000,
    statement_timeout: 15000,
  });
  try {
    const check = await pool.query<{ name: string }>(`
      SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE'
        AND table_name NOT LIKE 'pg_%'
    `);
    if (check.rows.length) throw new Error('Tenant DB is not empty; migration refused');
  } finally {
    await pool.end();
  }
  // The Prisma CLI reads the explicit per-tenant URL from its child environment.
  // Keep output private: Prisma or driver errors can include connection metadata.
  try {
    await run(process.execPath, [
      './node_modules/prisma/build/index.js','migrate','deploy',
    ], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: url.toString() },
      timeout: 90000,
      maxBuffer: 1024 * 1024,
    });
  } catch {
    throw new Error('Tenant schema migration failed');
  }
  return migrationVersion;
}
