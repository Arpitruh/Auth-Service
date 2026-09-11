# syntax=docker/dockerfile:1

# ---- Builder: install all deps, generate Prisma client, compile TS ----
FROM node:20-slim AS builder
WORKDIR /app

# Prisma 7 + argon2 need build tooling for native bits. argon2 has no prebuilt
# binary for this image, so node-gyp compiles it from source and requires
# python3 + a C/C++ toolchain (make, g++).
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json ./
COPY src ./src

# Generate the Prisma client and compile to dist/.
RUN npx prisma generate
RUN npm run build

# Drop dev dependencies for a lean runtime node_modules.
RUN npm prune --omit=dev

# ---- Runtime: minimal image, non-root ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Copy only what the runtime needs.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY package.json ./
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Run as the built-in non-root `node` user.
USER node

EXPOSE 5000

# Liveness probe hits the dependency-free /health endpoint.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Apply migrations, then launch the server.
CMD ["./docker-entrypoint.sh"]
