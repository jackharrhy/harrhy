FROM platformatic/node-caged:26-slim AS build
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY apps/maps-service/package.json ./apps/maps-service/
COPY packages/identity/package.json ./packages/identity/
COPY packages/json-schema/package.json ./packages/json-schema/
COPY packages/maps-editor/package.json ./packages/maps-editor/
COPY packages/maps-protocol/package.json ./packages/maps-protocol/
COPY packages/maps-renderer/package.json ./packages/maps-renderer/
COPY packages/mcp/package.json ./packages/mcp/
COPY packages/request-body/package.json ./packages/request-body/
COPY packages/result/package.json ./packages/result/
RUN npm ci --workspace @harrhy/maps-service --include-workspace-root=true
COPY tsconfig.base.json ./
COPY apps/maps-service ./apps/maps-service
COPY packages/identity ./packages/identity
COPY packages/json-schema ./packages/json-schema
COPY packages/maps-editor ./packages/maps-editor
COPY packages/maps-protocol ./packages/maps-protocol
COPY packages/maps-renderer ./packages/maps-renderer
COPY packages/mcp ./packages/mcp
COPY packages/request-body ./packages/request-body
COPY packages/result ./packages/result
RUN npm run build --workspace @harrhy/worldview-renderer \
  && npm run build --workspace @harrhy/maps-editor \
  && npm run build --workspace @harrhy/maps-protocol \
  && npm run build --workspace @harrhy/maps-service \
  && npm prune --omit=dev --workspace @harrhy/maps-service --include-workspace-root=true

FROM platformatic/node-caged:26-slim
RUN groupadd --gid 1000 node && useradd --uid 1000 --gid node --create-home node
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8792
ENV HARRHY_MAPS_DATA_ROOT=/app/data

WORKDIR /app/apps/maps-service
COPY --from=build --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/package.json /app/tsconfig.base.json /app/
COPY --from=build --chown=node:node /app/apps/maps-service /app/apps/maps-service
COPY --from=build --chown=node:node /app/packages/identity /app/packages/identity
COPY --from=build --chown=node:node /app/packages/json-schema /app/packages/json-schema
COPY --from=build --chown=node:node /app/packages/maps-editor /app/packages/maps-editor
COPY --from=build --chown=node:node /app/packages/maps-protocol /app/packages/maps-protocol
COPY --from=build --chown=node:node /app/packages/maps-renderer /app/packages/maps-renderer
COPY --from=build --chown=node:node /app/packages/mcp /app/packages/mcp
COPY --from=build --chown=node:node /app/packages/request-body /app/packages/request-body
COPY --from=build --chown=node:node /app/packages/result /app/packages/result
RUN mkdir -p /app/data && chown node:node /app/data

USER node
EXPOSE 8792
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8792/health').then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"]
CMD ["node", "dist/server.js"]
