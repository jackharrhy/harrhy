FROM platformatic/node-caged:26-slim AS manifests
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN npm install --global --ignore-scripts pnpm@12.21.0
ENV PNPM_CONFIG_ENABLE_GLOBAL_VIRTUAL_STORE=false
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/maps-service/package.json ./apps/maps-service/
COPY packages/identity/package.json ./packages/identity/
COPY packages/json-schema/package.json ./packages/json-schema/
COPY packages/maps-editor/package.json ./packages/maps-editor/
COPY packages/maps-protocol/package.json ./packages/maps-protocol/
COPY packages/maps-renderer/package.json ./packages/maps-renderer/
COPY packages/schmovement/package.json ./packages/schmovement/
COPY packages/mcp/package.json ./packages/mcp/
COPY packages/request-body/package.json ./packages/request-body/
COPY packages/result/package.json ./packages/result/

FROM manifests AS production-dependencies
RUN pnpm --filter @harrhy/maps-service... install --frozen-lockfile --config.enable-global-virtual-store=false --prod

FROM manifests AS build
RUN pnpm --filter @harrhy/maps-service... --filter . install --frozen-lockfile --config.enable-global-virtual-store=false
COPY tsconfig.base.json ./
COPY apps/maps-service ./apps/maps-service
COPY packages/identity ./packages/identity
COPY packages/json-schema ./packages/json-schema
COPY packages/maps-editor ./packages/maps-editor
COPY packages/maps-protocol ./packages/maps-protocol
COPY packages/maps-renderer ./packages/maps-renderer
COPY packages/schmovement ./packages/schmovement
COPY packages/mcp ./packages/mcp
COPY packages/request-body ./packages/request-body
COPY packages/result ./packages/result
RUN pnpm --filter @harrhy/worldview-renderer run build \
  && pnpm --filter @harrhy/maps-editor run build \
  && pnpm --filter @harrhy/maps-protocol run build \
  && pnpm --filter @harrhy/maps-service run build

# Overlay built sources without replacing the production workspace links.
RUN find apps packages -type d -name node_modules -prune -exec rm -rf {} +

FROM platformatic/node-caged:26-slim
RUN groupadd --gid 1000 node && useradd --uid 1000 --gid node --create-home node
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8792
ENV HARRHY_MAPS_DATA_ROOT=/app/data

WORKDIR /app/apps/maps-service
COPY --from=production-dependencies --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/package.json /app/tsconfig.base.json /app/
COPY --from=production-dependencies --chown=node:node /app/apps/maps-service /app/apps/maps-service
COPY --from=build --chown=node:node /app/apps/maps-service /app/apps/maps-service
COPY --from=production-dependencies --chown=node:node /app/packages/identity /app/packages/identity
COPY --from=build --chown=node:node /app/packages/identity /app/packages/identity
COPY --from=production-dependencies --chown=node:node /app/packages/json-schema /app/packages/json-schema
COPY --from=build --chown=node:node /app/packages/json-schema /app/packages/json-schema
COPY --from=production-dependencies --chown=node:node /app/packages/maps-editor /app/packages/maps-editor
COPY --from=build --chown=node:node /app/packages/maps-editor /app/packages/maps-editor
COPY --from=production-dependencies --chown=node:node /app/packages/maps-protocol /app/packages/maps-protocol
COPY --from=build --chown=node:node /app/packages/maps-protocol /app/packages/maps-protocol
COPY --from=production-dependencies --chown=node:node /app/packages/maps-renderer /app/packages/maps-renderer
COPY --from=production-dependencies --chown=node:node /app/packages/schmovement /app/packages/schmovement
COPY --from=build --chown=node:node /app/packages/maps-renderer /app/packages/maps-renderer
COPY --from=build --chown=node:node /app/packages/schmovement /app/packages/schmovement
COPY --from=production-dependencies --chown=node:node /app/packages/mcp /app/packages/mcp
COPY --from=build --chown=node:node /app/packages/mcp /app/packages/mcp
COPY --from=production-dependencies --chown=node:node /app/packages/request-body /app/packages/request-body
COPY --from=build --chown=node:node /app/packages/request-body /app/packages/request-body
COPY --from=production-dependencies --chown=node:node /app/packages/result /app/packages/result
COPY --from=build --chown=node:node /app/packages/result /app/packages/result
RUN mkdir -p /app/data && chown node:node /app/data

USER node
EXPOSE 8792
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8792/health').then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"]
CMD ["node", "dist/server.js"]
