#!/bin/sh
# Container entrypoint: apply any pending DB migrations, then start the server.
#
# `prisma migrate deploy` only applies already-generated migrations (never
# creates new ones), which is the correct, non-interactive behavior for
# production. It reads DATABASE_URL via prisma.config.ts.
set -e

echo "[entrypoint] Applying database migrations..."
npx prisma migrate deploy

# Initialize the independent application registry when explicitly configured.
# This migration script refuses to target the legacy auth database.
if [ -n "${CONTROL_PLANE_DATABASE_URL:-}" ]; then
  echo "[entrypoint] Applying control-plane migrations..."
  node scripts/migrate-control-plane.mjs
fi

echo "[entrypoint] Starting server..."
exec node dist/server.js
