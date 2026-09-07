# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Rehearsal Room — production image
#   deps (dev) -> builder (compile) -> proddeps (runtime modules) -> runner
# ---------------------------------------------------------------------------

FROM node:22-bookworm-slim AS base
WORKDIR /app
# openssl: Prisma engines link against it; ca-certificates: outbound HTTPS
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1

# ---- deps: full install (incl. dev) so we can build ----
FROM base AS deps
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: generate client + compile ----
FROM base AS builder
ENV NODE_ENV=production
# not used at build time (nothing connects), just keeps tooling quiet
ENV DATABASE_URL=file:/tmp/build.db
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# ---- proddeps: runtime node_modules only (prisma is a dependency) ----
FROM base AS proddeps
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate

# ---- runner ----
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=file:/app/data/prod.db \
    STORAGE_DIR=/app/data/storage

RUN groupadd -g 1001 nodejs \
 && useradd -u 1001 -g nodejs -m -d /home/nextjs nextjs

COPY --from=proddeps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder  --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder  --chown=nextjs:nodejs /app/public ./public
COPY --from=builder  --chown=nextjs:nodejs /app/prisma ./prisma
COPY --chown=nextjs:nodejs package.json next.config.ts ./
COPY --chown=nextjs:nodejs deploy/docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh \
 && mkdir -p /app/data/storage \
 && chown -R nextjs:nodejs /app/data

USER nextjs
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
