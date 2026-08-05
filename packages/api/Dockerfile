# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────
# Quanta API — production image
#
# Two stages:
#   1) builder  — installs all deps, runs prisma generate, compiles TS
#   2) runner   — slim node:slim, runs as non-root, ships tini for
#                 PID-1 signal handling, includes the prisma client
#                 + the compiled JS only
#
# Build context: packages/api  (set in fly.toml)
# Final size: ~250MB (node + prisma engine + app)
# ─────────────────────────────────────────────────────────────

FROM node:20-bookworm-slim AS builder

WORKDIR /app

# OpenSSL is required by Prisma's query engine for libquery_engine.so.
# bookworm-slim has libssl3 already but include explicitly so changes
# to the base don't silently break the build.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Copy manifest + Prisma schema first so the npm install layer caches when
# only source changes. package.json's `postinstall` runs `prisma generate`,
# which needs prisma/schema.prisma present — so the schema must be copied
# BEFORE install (this is also why there's no separate generate step; the
# postinstall during `npm install` does it). We deliberately don't use a
# workspace install — Fly's build context is packages/api/, so the manifest
# here is the leaf package.
COPY package.json ./
COPY prisma ./prisma
RUN npm install --no-audit --no-fund

# Now bring in source + compile.
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

# ─────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner

# tini handles SIGTERM/SIGINT cleanly so Fly's rolling deploys don't
# leave orphaned processes.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 node-app \
 && useradd --system --uid 1001 --gid node-app node-app

WORKDIR /app

# Copy compiled output + node_modules (which contains the prisma engine
# fetched during builder's prisma generate) + the schema (needed for
# `prisma migrate deploy` at release time) + the seed script.
COPY --from=builder --chown=node-app:node-app /app/dist ./dist
COPY --from=builder --chown=node-app:node-app /app/node_modules ./node_modules
COPY --from=builder --chown=node-app:node-app /app/package.json ./package.json
COPY --from=builder --chown=node-app:node-app /app/prisma ./prisma
# Release-time migration script (fly.toml release_command).
COPY --chown=node-app:node-app scripts ./scripts

ENV NODE_ENV=production
ENV API_PORT=4000

USER node-app
EXPOSE 4000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
