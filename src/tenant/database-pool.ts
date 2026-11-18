import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ENV } from '../config/env.js';
import { resolveTenantConnectionSecret } from '../provisioning/secrets.js';
import { validateTenantPostgresUrl } from '../provisioning/connection-policy.js';
import type { VerifiedTenant } from './client-credentials.js';

interface Entry {
  db: PrismaClient;
  refs: number;
  lastUsed: number;
  secretRef: string;
}
/** Bounded idle-evicting LRU. Never evict an in-flight connection. */
export class TenantDatabasePool {
  private readonly cache = new Map<string, Entry>();
  private readonly creating = new Map<string, Promise<Entry>>();
  private stopped = false;
  constructor(
    private readonly capacity: number,
    private readonly maxIdleMs: number,
    private readonly resolve: (ref: string) => Promise<string>,
    private readonly create: (url: string) => PrismaClient,
  ) {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || maxIdleMs < 0) {
      throw new Error('Invalid tenant pool limits');
    }
  }
  get size(): number { return this.cache.size; }

  private async take(app: VerifiedTenant): Promise<Entry> {
    if (this.stopped) throw new Error('Tenant pool is shutting down');
    const existing = this.cache.get(app.id);
    if (existing && existing.secretRef === app.secretRef) {
      existing.refs++;
      existing.lastUsed = Date.now();
      this.cache.delete(app.id);
      this.cache.set(app.id, existing);
      return existing;
    }
    if (existing && existing.refs > 0) throw new Error('Tenant credential rotation is in progress');
    const inflight = this.creating.get(app.id);
    if (inflight) {
      const entry = await inflight;
      if (entry.secretRef !== app.secretRef) throw new Error('Tenant credentials changed during connection');
      entry.refs++;
      return entry;
    }
    const loading = (async (): Promise<Entry> => {
      if (existing) {
        this.cache.delete(app.id);
        await existing.db.$disconnect();
      }
      // Expire inactive connections first; capacity is an absolute upper bound.
      for (const [id, entry] of this.cache) {
        if (entry.refs === 0 && Date.now() - entry.lastUsed >= this.maxIdleMs) {
          this.cache.delete(id);
          await entry.db.$disconnect();
        }
      }
      while (this.cache.size >= this.capacity) {
        const idle = [...this.cache.entries()].find(([, entry]) => entry.refs === 0);
        if (!idle) throw new Error('All tenant database slots are busy');
        this.cache.delete(idle[0]);
        await idle[1].db.$disconnect();
      }
      const connection = await this.resolve(app.secretRef);
      validateTenantPostgresUrl(connection);
      const db = this.create(connection);
      try { await db.$queryRaw`SELECT 1`; }
      catch (e) { await db.$disconnect(); throw e; }
      const entry: Entry = { db, refs: 1, lastUsed: Date.now(), secretRef: app.secretRef };
      this.cache.set(app.id, entry);
      return entry;
    })();
    this.creating.set(app.id, loading);
    try {
      // Initial caller's lease is reserved before making the client visible.
      return await loading;
    } finally {
      this.creating.delete(app.id);
    }
  }

  async withTenant<T>(app: VerifiedTenant, fn: (db: PrismaClient) => Promise<T>): Promise<T> {
    const entry = await this.take(app);
    try { return await fn(entry.db); }
    finally { entry.refs--; entry.lastUsed = Date.now(); }
  }

  async close(): Promise<void> {
    this.stopped = true;
    await Promise.allSettled([...this.creating.values()]);
    const entries = [...this.cache.values()];
    if (entries.some(x => x.refs > 0)) throw new Error('Tenant operations are still active');
    this.cache.clear();
    await Promise.all(entries.map(x => x.db.$disconnect()));
  }
}
export const tenantPool = new TenantDatabasePool(
  ENV.TENANT_POOL_MAX_CLIENTS,
  ENV.TENANT_POOL_IDLE_MS,
  resolveTenantConnectionSecret,
  (url) => new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, max: ENV.TENANT_POOL_CONNECTIONS_PER_APP,
      connectionTimeoutMillis: 8000, idleTimeoutMillis: 12000 }),
    log: ENV.IS_PRODUCTION ? ['error'] : ['warn','error'],
  }),
);
