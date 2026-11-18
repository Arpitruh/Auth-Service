import 'dotenv/config';
import { Pool } from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const url = process.env.CONTROL_PLANE_DATABASE_URL;
if (!url) {
  console.error('CONTROL_PLANE_DATABASE_URL is required to migrate the central registry');
  process.exitCode = 1;
} else {
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock($1)', [78192844]);
      await client.query(`CREATE TABLE IF NOT EXISTS "ControlSchemaMigration" (
        "id" text PRIMARY KEY, "checksum" text NOT NULL, "appliedAt" timestamptz NOT NULL DEFAULT now()
      )`);
      const folder = new URL('../control-plane/migrations/', import.meta.url);
      const scripts = (await readdir(folder)).filter(name => /^\d+.*\.sql$/.test(name)).sort();
      for (const name of scripts) {
        const sql = await readFile(new URL(name, folder), 'utf8');
        const digest = createHash('sha256').update(sql).digest('hex');
        const found = await client.query('SELECT "checksum" FROM "ControlSchemaMigration" WHERE "id"=$1', [name]);
        if (found.rows.length) {
          if (found.rows[0].checksum !== digest) throw Error('Checksum mismatch for ' + name);
          continue;
        }
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO "ControlSchemaMigration" ("id","checksum") VALUES ($1,$2)', [name,digest]);
          await client.query('COMMIT');
          console.log('Applied control-plane migration:', name);
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }
      await client.query('SELECT pg_advisory_unlock($1)', [78192844]);
    } finally { client.release(); }
  } catch (error) {
    console.error('Control-plane migration failed:', error.message);
    process.exitCode = 1;
  } finally { await pool.end(); }
}
