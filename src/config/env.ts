import 'dotenv/config';
import { z } from 'zod';

/**
 * Zod-validated, fail-fast configuration (Requirements 10.2, 11.3, 12.1, 12.4).
 *
 * All configuration is read from environment variables (12-factor). The schema
 * below is parsed once at import time; if anything required is missing or
 * invalid, we print an aggregated list of problems and exit(1) so the service
 * never boots into a half-configured state.
 */

// Coerce common boolean spellings ("true"/"1"/"yes") into a real boolean.
const booleanish = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v.trim() === '') return fallback;
      return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
    });

const numeric = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== '' ? Number(v) : fallback))
    .pipe(z.number().int().nonnegative());

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: numeric(5000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // JWT secrets (current) + optional previous secrets for rotation grace.
  JWT_ACCESS_SECRET: z.string().min(1, 'JWT_ACCESS_SECRET is required'),
  JWT_REFRESH_SECRET: z.string().min(1, 'JWT_REFRESH_SECRET is required'),
  JWT_ACCESS_SECRET_PREVIOUS: z.string().optional(),
  JWT_REFRESH_SECRET_PREVIOUS: z.string().optional(),

  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),

  CLIENT_ORIGIN: z.string().default('http://localhost:3000'),
  REFRESH_COOKIE_NAME: z.string().default('refreshToken'),

  // Optional Redis. When absent, the in-memory KV fallback is used.
  REDIS_URL: z.string().optional(),

  // Password policy.
  PASSWORD_MIN_LENGTH: numeric(8),
  PASSWORD_REQUIRE_NUMBER: booleanish(true),
  PASSWORD_REQUIRE_SYMBOL: booleanish(true),

  // Rate limiting (per IP+email) for /login and /register.
  RATE_LIMIT_MAX: numeric(5),
  RATE_LIMIT_WINDOW_MINUTES: numeric(15),

  // Account lockout (per email).
  LOCKOUT_THRESHOLD: numeric(5),
  LOCKOUT_WINDOW_MINUTES: numeric(15),

  // Password reset token TTL.
  RESET_TOKEN_TTL_MINUTES: numeric(30),

  // Prisma connection pool sizing.
  DB_POOL_SIZE: numeric(10),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  // Cannot use the pino logger here — it depends on ENV which failed to load.
  console.error(
    `\nInvalid environment configuration:\n${issues}\n\n` +
      `Set the missing/invalid variables (see .env.example) and restart.\n`,
  );
  process.exit(1);
}

const data = parsed.data;

export const ENV = {
  ...data,
  IS_PRODUCTION: data.NODE_ENV === 'production',
} as const;

// Number of days the refresh token remains valid, used for DB expiry + cookie.
export const REFRESH_TOKEN_TTL_DAYS = 7;
