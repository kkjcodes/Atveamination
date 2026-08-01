FROM node:20-alpine AS base
RUN apk add --no-cache openssl libc6-compat

# ── All production dependencies ────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Build ──────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=4096

RUN npx prisma generate
RUN npm run build

# ── Production-only node_modules (no devDeps, but prisma CLI is a prod dep) ─
FROM base AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Runtime ────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

# System ffmpeg + fonts. The npm ffmpeg-static binary is compiled without
# libfreetype, so the drawtext filter (used by the business fork for burned
# overlay text) fails with "No such filter: 'drawtext'". Alpine's ffmpeg has
# libfreetype baked in; ttf-dejavu provides a default font when drawtext
# omits the font: parameter. FFMPEG_BIN redirects ffmpeg-static's export to
# the system binary — no code changes needed.
RUN apk add --no-cache ffmpeg ttf-dejavu fontconfig
ENV FFMPEG_BIN=/usr/bin/ffmpeg

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Full prod node_modules: covers Next.js server, Prisma CLI, and all their
# transitive deps without manually tracking the dep tree.
COPY --from=prod-deps /app/node_modules ./node_modules

# Restore generated Prisma client from builder (prisma generate output).
# @prisma/client wraps the real generated code in .prisma/client/ (dot-prefixed,
# not captured by prod-deps which installs packages but never runs generate).
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# ffmpeg-static and ffprobe-static ship native binaries not captured by module tracing.
COPY --from=builder /app/node_modules/ffmpeg-static ./node_modules/ffmpeg-static
COPY --from=builder /app/node_modules/ffprobe-static ./node_modules/ffprobe-static

# Static assets and Next.js standalone server (without its own node_modules —
# we use prod-deps above instead, which is a superset).
# chown to nextjs because the runtime music-sync script rewrites
# manifest.json under public/business/music — root-owned files would fail
# the write silently (start.sh suppresses non-zero exit from sync).
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone/server.js ./server.js
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma schema + migrations + config for startup migration runner
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

COPY --from=builder --chown=nextjs:nodejs /app/start.sh ./start.sh
RUN chmod +x start.sh

# Deploy-time scripts (music sync). Runs from start.sh on every boot.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

USER nextjs
EXPOSE 3000

CMD ["./start.sh"]
