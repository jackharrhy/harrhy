FROM node:26-bookworm AS manifests
WORKDIR /app
COPY --from=oven/bun:1.4.4 /usr/local/bin/bun /usr/local/bin/bun
RUN npm install --global --ignore-scripts pnpm@12.21.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/lists/package.json apps/lists/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/identity/package.json packages/identity/package.json
COPY packages/mcp/package.json packages/mcp/package.json
COPY packages/request-body/package.json packages/request-body/package.json
COPY packages/json-schema/package.json packages/json-schema/package.json
COPY packages/result/package.json packages/result/package.json

FROM manifests AS production-dependencies
RUN pnpm --filter @harrhy/lists... install --frozen-lockfile --prod

FROM manifests AS build
RUN pnpm --filter @harrhy/lists... install --frozen-lockfile
COPY apps/lists apps/lists
COPY packages/ui packages/ui
COPY packages/identity packages/identity
COPY packages/mcp packages/mcp
COPY packages/request-body packages/request-body
COPY packages/json-schema packages/json-schema
COPY packages/result packages/result
WORKDIR /app/apps/lists
RUN pnpm run build:assets
WORKDIR /app

# Overlay built sources without replacing the production workspace links.
RUN find apps packages -type d -name node_modules -prune -exec rm -rf {} +

FROM oven/bun:1.4.4-slim AS runtime
ENV NODE_ENV=production DB_PATH=/data/lists.db PORT=8080
WORKDIR /app
COPY --from=production-dependencies --chown=bun:bun /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=bun:bun /app/apps/lists ./apps/lists
COPY --from=build --chown=bun:bun /app/apps/lists ./apps/lists
COPY --from=production-dependencies --chown=bun:bun /app/packages/ui ./packages/ui
COPY --from=build --chown=bun:bun /app/packages/ui ./packages/ui
COPY --from=production-dependencies --chown=bun:bun /app/packages/identity ./packages/identity
COPY --from=build --chown=bun:bun /app/packages/identity ./packages/identity
COPY --from=production-dependencies --chown=bun:bun /app/packages/mcp ./packages/mcp
COPY --from=build --chown=bun:bun /app/packages/mcp ./packages/mcp
COPY --from=production-dependencies --chown=bun:bun /app/packages/request-body ./packages/request-body
COPY --from=build --chown=bun:bun /app/packages/request-body ./packages/request-body
COPY --from=production-dependencies --chown=bun:bun /app/packages/json-schema ./packages/json-schema
COPY --from=build --chown=bun:bun /app/packages/json-schema ./packages/json-schema
COPY --from=production-dependencies --chown=bun:bun /app/packages/result ./packages/result
COPY --from=build --chown=bun:bun /app/packages/result ./packages/result
RUN mkdir /data && chown bun:bun /data
WORKDIR /app/apps/lists
USER bun
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e 'const r=await fetch("http://127.0.0.1:8080/health");process.exit(r.ok?0:1)'
CMD ["bun", "src/index.ts"]
