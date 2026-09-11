#!/bin/sh
# Container entrypoint: apply any pending DB migrations, then start the server.
#
# `prisma migrate deploy` only applies already-generated migrations (never
# creates new ones), which is the correct, non-interactive behavior for
# production. It reads DATABASE_URL via prisma.config.ts.
set -e

echo "[entrypoint] Applying database migrations..."
npx prisma migrate deploy

echo "[entrypoint] Starting server..."
exec node dist/server.js
