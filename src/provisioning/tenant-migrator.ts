import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { validateTenantPostgresUrl } from './connection-policy.js';

const run = promisify(execFile);
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** A trusted migration job only. Never accepts a database selected by a browser client ID. */
export async function migrateFreshTenantDatabase(connectionString: string): Promise<string> {
  const url = validateTenantPostgresUrl(connectionString);
  const pool = new Pool({
    connectionString: url.toString(), max: 1, connectionTimeoutMillis: 8000,
    statement_timeout: 15000,
  });
  try {
    // Neon may still be starting after createProject; retry ONLY read-only
    // connection checks. Never retry the non-idempotent Neon POST.
    let connected = false;
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        await pool.query('SELECT 1');
        connected = true; break;
      } catch {
        if (attempt === 7) break;
        await pause(2000);
      }
    }
    if (!connected) throw new Error('Tenant database was not ready');

    const check = await pool.query<{ name: string }>(`
      SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE'
        AND table_name NOT LIKE 'pg_%'
    `);
    if (check.rows.length) throw new Error('Tenant database is not empty; migration refused');
  } finally { await pool.end(); }

  try {
    await run(process.execPath, ['./node_modules/prisma/build/index.js','migrate','deploy'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: url.toString() },
      timeout: 90000, maxBuffer: 1024 * 1024,
    });
  } catch {
    // Never leak connection strings and credentials through provider error text.
    throw new Error('Tenant schema migration failed');
  }
  const verify = new Pool({ connectionString: url.toString(), max: 1 });
  try {
    const res = await verify.query<{ migration_name: string }>(`
      SELECT migration_name FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      ORDER BY finished_at DESC LIMIT 1
    `);
    if (!res.rows[0]) throw new Error('Tenant schema migration ledger is empty');
    return res.rows[0].migration_name;
  } finally { await verify.end(); }
}
