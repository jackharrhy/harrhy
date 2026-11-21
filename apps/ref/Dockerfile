ARG CELLD_IMAGE=ghcr.io/jackharrhy/celld@sha256:dfea10316af715b6540c4d2257182537e5bc620b072310273c54d5cbd929820a
FROM ${CELLD_IMAGE} AS celld

FROM node:26-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68 AS build
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN npm install --global --ignore-scripts pnpm@12.21.0
ENV PNPM_CONFIG_ENABLE_GLOBAL_VIRTUAL_STORE=false
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/ref/package.json ./apps/ref/
COPY packages/board/package.json ./packages/board/
COPY packages/dev-auth/package.json ./packages/dev-auth/
COPY packages/identity/package.json ./packages/identity/
COPY packages/json-schema/package.json ./packages/json-schema/
COPY packages/live-state/package.json ./packages/live-state/
COPY packages/logger/package.json ./packages/logger/
COPY packages/mcp/package.json ./packages/mcp/
COPY packages/request-body/package.json ./packages/request-body/
COPY packages/result/package.json ./packages/result/
COPY packages/ui/package.json ./packages/ui/
COPY packages/webmcp/package.json ./packages/webmcp/
RUN pnpm --filter @harrhy/ref... install --frozen-lockfile --config.enable-global-virtual-store=false
COPY tsconfig.base.json ./
COPY apps/ref ./apps/ref
COPY packages/board ./packages/board
COPY packages/dev-auth ./packages/dev-auth
COPY packages/identity ./packages/identity
COPY packages/json-schema ./packages/json-schema
COPY packages/live-state ./packages/live-state
COPY packages/logger ./packages/logger
COPY packages/mcp ./packages/mcp
COPY packages/request-body ./packages/request-body
COPY packages/result ./packages/result
COPY packages/ui ./packages/ui
COPY packages/webmcp ./packages/webmcp
ARG HARRHY_REF_VERSION=development
RUN HARRHY_REF_VERSION=$HARRHY_REF_VERSION NODE_ENV=production pnpm --filter @harrhy/ref run build

FROM node:26-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68 AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

ARG CELLD_IMAGE
LABEL dev.jackharrhy.ref.celld-image=${CELLD_IMAGE}

ENV NODE_ENV=production
ENV CELLD_ADDR=0.0.0.0:8080
ENV CELLD_INTERNAL_ADDR=127.0.0.1:8081
ENV CELLD_BUCKET=sqlite:///app/.celld/object-store/objects.sqlite3
ENV CELLD_DURABILITY=bucket
ENV CELLD_WATCH=/app/.celld/state

WORKDIR /app/apps/ref
COPY --from=celld /usr/local/bin/celld /usr/local/bin/celld
COPY --from=build --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/package.json /app/tsconfig.base.json /app/
COPY --from=build --chown=node:node /app/apps/ref /app/apps/ref
COPY --from=build --chown=node:node /app/packages/board /app/packages/board
COPY --from=build --chown=node:node /app/packages/dev-auth /app/packages/dev-auth
COPY --from=build --chown=node:node /app/packages/identity /app/packages/identity
COPY --from=build --chown=node:node /app/packages/json-schema /app/packages/json-schema
COPY --from=build --chown=node:node /app/packages/live-state /app/packages/live-state
COPY --from=build --chown=node:node /app/packages/logger /app/packages/logger
COPY --from=build --chown=node:node /app/packages/mcp /app/packages/mcp
COPY --from=build --chown=node:node /app/packages/request-body /app/packages/request-body
COPY --from=build --chown=node:node /app/packages/result /app/packages/result
COPY --from=build --chown=node:node /app/packages/ui /app/packages/ui
COPY --from=build --chown=node:node /app/packages/webmcp /app/packages/webmcp

RUN mkdir -p /app/.celld \
  && chmod +x /app/apps/ref/scripts/start-celld.sh \
  && chown -R node:node /app

USER node

EXPOSE 8080
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["/app/apps/ref/scripts/start-celld.sh"]
