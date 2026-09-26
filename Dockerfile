FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN groupadd --system --gid 1001 dispatch && \
    useradd --system --uid 1001 --gid dispatch --home-dir /app dispatch && \
    mkdir -p /var/lib/mayday-dispatch /var/backups/mayday-dispatch && \
    chown -R dispatch:dispatch /app /var/lib/mayday-dispatch /var/backups/mayday-dispatch
COPY --from=builder --chown=dispatch:dispatch /app/.next/standalone ./
COPY --from=builder --chown=dispatch:dispatch /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=builder --chown=dispatch:dispatch /app/scripts/db-status.mjs ./scripts/db-status.mjs
COPY --from=builder --chown=dispatch:dispatch /app/scripts/db-backup.mjs ./scripts/db-backup.mjs
COPY --from=builder --chown=dispatch:dispatch /app/scripts/db-restore.mjs ./scripts/db-restore.mjs
COPY --from=builder --chown=dispatch:dispatch /app/scripts/runtime-operations.mjs ./scripts/runtime-operations.mjs
COPY --from=builder --chown=dispatch:dispatch /app/scripts/start-production.mjs ./scripts/start-production.mjs
COPY --from=builder --chown=dispatch:dispatch /app/package.json ./package.json
USER dispatch
EXPOSE 3000
VOLUME ["/var/lib/mayday-dispatch", "/var/backups/mayday-dispatch"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/start-production.mjs"]
