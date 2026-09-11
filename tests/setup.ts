// Provide required env BEFORE any src module (which validates env at import
// time via Zod and would otherwise process.exit(1)). Only set values that are
// not already present, so a real .env can override for integration runs.
const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '5050',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/testdb',
  JWT_ACCESS_SECRET: 'test-access-secret',
  JWT_REFRESH_SECRET: 'test-refresh-secret',
  ACCESS_TOKEN_TTL: '15m',
  REFRESH_TOKEN_TTL: '7d',
  LOG_LEVEL: 'silent',
  LOCKOUT_THRESHOLD: '5',
  LOCKOUT_WINDOW_MINUTES: '15',
};

for (const [key, value] of Object.entries(defaults)) {
  if (!process.env[key]) process.env[key] = value;
}
