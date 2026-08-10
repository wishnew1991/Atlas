FROM node:24-slim AS base
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- builder ----
FROM base AS builder
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npx prisma generate --schema prisma/schema.postgresql.prisma --no-hints || true
# BETTER_AUTH_SECRET is required at build time: `next build` executes the
# auth module while collecting page data. This placeholder is build-only —
# the emitted standalone reads the real secret from the Cloud Run env at
# runtime, which takes precedence.
ENV BETTER_AUTH_SECRET=build-only-placeholder-never-used-at-runtime
RUN npm run build

# ---- runner ----
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Install production dependencies directly. The Next.js standalone trace
# (serverExternalPackages) does NOT include @prisma/*, pg, better-auth,
# better-sqlite3, etc., so we install the full prod tree here.
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps

# Prisma's generated client (created by `prisma generate` in the builder) is
# produced into node_modules/.prisma/client. The CLI is a devDependency, so
# copy the generated client from the builder stage.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone/server.js ./server.js
COPY --from=builder /app/.next/standalone/.next ./.next
COPY --from=builder /app/.next/static ./.next/static

RUN mkdir -p /app/dev-db && chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 8080

CMD ["node", "server.js"]