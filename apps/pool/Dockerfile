FROM node:26-bookworm AS build
WORKDIR /app
COPY --from=oven/bun:1.4.4 /usr/local/bin/bun /usr/local/bin/bun
RUN npm install --global --ignore-scripts pnpm@12.21.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/pool/package.json ./apps/pool/
COPY packages/pool/package.json ./packages/pool/
COPY packages/pool-protocol/package.json ./packages/pool-protocol/
COPY packages/pool-simulation/package.json ./packages/pool-simulation/
RUN pnpm --filter @harrhy/pool-app... install --frozen-lockfile
COPY tsconfig.base.json ./
COPY apps/pool ./apps/pool
COPY packages/pool ./packages/pool
COPY packages/pool-protocol ./packages/pool-protocol
COPY packages/pool-simulation ./packages/pool-simulation
ARG APP_REVISION=development
RUN APP_REVISION=$APP_REVISION pnpm --filter @harrhy/pool-app run build

FROM oven/bun:1.4.4-slim AS runtime
WORKDIR /app
ARG APP_REVISION=development
ENV NODE_ENV=production HOST=0.0.0.0 API_PORT=3188 \
    DATA_DIR=/app/data WEB_ROOT=/app/dist/client APP_REVISION=$APP_REVISION
COPY --from=build --chown=bun:bun /app/apps/pool/dist ./dist
RUN mkdir /app/data && chown bun:bun /app/data
USER bun
EXPOSE 3188
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e 'const r=await fetch("http://127.0.0.1:"+(process.env.API_PORT??"3188")+"/api/health");process.exit(r.ok?0:1)'
CMD ["bun", "dist/server/index.js"]
