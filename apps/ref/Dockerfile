ARG CELLD_IMAGE=ghcr.io/jackharrhy/celld@sha256:0d63d5e360981f9e779c44b144abddb4ca174fc37630a80da7ddc57670c3f970
FROM ${CELLD_IMAGE} AS celld

FROM node:26-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68 AS build
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/4orm/package.json ./apps/4orm/
COPY apps/8mb/package.json ./apps/8mb/
COPY apps/artbin/package.json ./apps/artbin/
COPY apps/artbin-cli/package.json ./apps/artbin-cli/
COPY apps/atlas/package.json ./apps/atlas/
COPY apps/auth/package.json ./apps/auth/
COPY apps/burger/package.json ./apps/burger/
COPY apps/cms/package.json ./apps/cms/
COPY apps/cms-edge/package.json ./apps/cms-edge/
COPY apps/garden/package.json ./apps/garden/
COPY apps/gurgur/package.json ./apps/gurgur/
COPY apps/img/package.json ./apps/img/
COPY apps/letters-to-steve/package.json ./apps/letters-to-steve/
COPY apps/lists/package.json ./apps/lists/
COPY apps/maps-collaboration/package.json ./apps/maps-collaboration/
COPY apps/maps-compiler/package.json ./apps/maps-compiler/
COPY apps/maps-service/package.json ./apps/maps-service/
COPY apps/marky/package.json ./apps/marky/
COPY apps/pool/package.json ./apps/pool/
COPY apps/radio/package.json ./apps/radio/
COPY apps/ref/package.json ./apps/ref/
COPY apps/rotund/package.json ./apps/rotund/
COPY apps/ui/package.json ./apps/ui/
COPY apps/worldview/package.json ./apps/worldview/
COPY packages/artbin-core/package.json ./packages/artbin-core/
COPY packages/artbin-ui/package.json ./packages/artbin-ui/
COPY packages/burger-core/package.json ./packages/burger-core/
COPY packages/dev-auth/package.json ./packages/dev-auth/
COPY packages/gurgur-engine/package.json ./packages/gurgur-engine/
COPY packages/gurgur-game/package.json ./packages/gurgur-game/
COPY packages/identity/package.json ./packages/identity/
COPY packages/json-schema/package.json ./packages/json-schema/
COPY packages/logger/package.json ./packages/logger/
COPY packages/maps-editor/package.json ./packages/maps-editor/
COPY packages/maps-protocol/package.json ./packages/maps-protocol/
COPY packages/maps-renderer/package.json ./packages/maps-renderer/
COPY packages/mcp/package.json ./packages/mcp/
COPY packages/pool/package.json ./packages/pool/
COPY packages/pool-protocol/package.json ./packages/pool-protocol/
COPY packages/pool-simulation/package.json ./packages/pool-simulation/
COPY packages/request-body/package.json ./packages/request-body/
COPY packages/result/package.json ./packages/result/
COPY packages/rich-text/package.json ./packages/rich-text/
COPY packages/ui/package.json ./packages/ui/
COPY packages/webmcp/package.json ./packages/webmcp/
# Radio has a workspace postinstall hook, including in full-workspace installs.
COPY apps/radio/scripts/sync-icon-font.mjs ./apps/radio/scripts/
RUN npm ci
COPY . .
RUN npm run build --workspace @harrhy/ref

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
COPY --from=build /app /app

RUN mkdir -p /app/.celld \
  && chmod +x /app/apps/ref/scripts/start-celld.sh \
  && chown -R node:node /app

USER node

EXPOSE 8080
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["/app/apps/ref/scripts/start-celld.sh"]
