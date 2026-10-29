# syntax=docker/dockerfile:1.7
# Production image for Scholaris (Next.js standalone output + Prisma migrations).

FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npx next build

FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
# Standalone server + static assets
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
# Migrations run at start-up (prisma CLI + schema + config)
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=build --chown=app:app /app/prisma.config.ts ./prisma.config.ts
COPY --from=deps --chown=app:app /app/node_modules/prisma ./node_modules/prisma
COPY --from=deps --chown=app:app /app/node_modules/@prisma ./node_modules/@prisma
RUN mkdir -p /app/storage && chown app:app /app/storage
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node server.js"]
