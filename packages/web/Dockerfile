# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────
# Quanta Web — production image
#
# Stage 1: Vite build → static dist/
# Stage 2: nginx:alpine, dist served from /usr/share/nginx/html
#          + nginx.conf.template envsubst'd at startup so a single
#          image works in any environment (just change API_INTERNAL_URL)
#
# Build context: packages/web
# Final size: ~50MB (nginx-alpine + dist)
# ─────────────────────────────────────────────────────────────

FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json vite.config.ts tailwind.config.js postcss.config.js index.html ./
COPY src ./src
COPY public ./public

# Vite reads VITE_* env vars at build time and bakes them into the bundle.
# We don't need any here today (the SPA calls /api/* relatively and the
# nginx layer proxies to the API container), but leave a placeholder so
# future build-time config is one ENV line away.
RUN npm run build

# ─────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# envsubst lives in gettext on alpine. The runtime entrypoint uses it
# to template the upstream URL into nginx.conf before nginx starts.
RUN apk add --no-cache gettext

# Replace the default nginx config with our SPA-aware template.
COPY nginx.conf.template /etc/nginx/templates/quanta.conf.template
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
 && rm /etc/nginx/conf.d/default.conf

# Static build output.
COPY --from=builder /app/dist /usr/share/nginx/html

# Fly assigns the public port — we listen on 8080 inside the container.
# (nginx default is 80; we override in nginx.conf.template.)
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
