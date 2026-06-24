# syntax=docker/dockerfile:1

# ---------- builder ----------
FROM node:22-bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.31.0 --activate
WORKDIR /build

# Compile native modules (sqlite3, better-sqlite3) from source so they link against THIS
# image's glibc — not a newer-glibc prebuilt binary that fails to load in the runtime stage.
ENV npm_config_build_from_source=true

# Install deps (native modules sqlite3/better-sqlite3 + prisma build per pnpm-workspace onlyBuiltDependencies)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm install --frozen-lockfile --prod=false

# Build (NEXT_PUBLIC_* are inlined at build time)
COPY . .
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=${NEXT_PUBLIC_TURNSTILE_SITE_KEY}
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ---------- runtime ----------
FROM node:22-bookworm-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends tini ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Next.js standalone server + static assets
COPY --from=builder /build/.next/standalone ./
COPY --from=builder /build/.next/static ./.next/static
COPY --from=builder /build/public ./public

# serverExternalPackages (@bsv/*, knex, better-sqlite3) are NOT traced into standalone —
# bring the full node_modules (compiled natives) + prisma CLI + generated client + migrations.
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/generated ./generated
COPY --from=builder /build/prisma ./prisma
COPY --from=builder /build/prisma.config.ts ./prisma.config.ts
COPY --from=builder /build/scripts ./scripts

# /data is the mount point for the wallet + policy SQLite DBs (a PVC in k8s).
RUN mkdir -p /data && chown -R 1000:1000 /data /app
USER 1000
EXPOSE 3000

# Apply the policy-DB migration (idempotent), then start the standalone server.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && exec node server.js"]
