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
COPY apps/world/package.json ./apps/world/
COPY packages/maps-renderer/package.json ./packages/maps-renderer/
COPY packages/pool/package.json ./packages/pool/
COPY packages/schmovement/package.json ./packages/schmovement/
COPY packages/ui/package.json ./packages/ui/
RUN pnpm --filter @harrhy/world... --filter . install --frozen-lockfile --config.enable-global-virtual-store=false
COPY tsconfig.base.json ./
COPY apps/world ./apps/world
COPY packages/maps-renderer ./packages/maps-renderer
COPY packages/pool ./packages/pool
COPY packages/schmovement ./packages/schmovement
COPY packages/ui ./packages/ui
RUN pnpm --filter @harrhy/world run build

FROM node:26-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68 AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
ARG CELLD_IMAGE
LABEL dev.jackharrhy.world.celld-image=${CELLD_IMAGE}
ENV NODE_ENV=production \
    CELLD_ADDR=0.0.0.0:44100 \
    CELLD_INTERNAL_ADDR=127.0.0.1:44101 \
    CELLD_BUCKET=sqlite:///app/.celld/object-store/objects.sqlite3 \
    CELLD_DURABILITY=bucket \
    CELLD_WATCH=/app/.celld/state \
    CELLD_ESBUILD=/app/apps/world/node_modules/.bin/esbuild
WORKDIR /app/apps/world
COPY --from=celld /usr/local/bin/celld /usr/local/bin/celld
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/package.json /app/tsconfig.base.json /app/
COPY --from=build /app/apps/world /app/apps/world
COPY --from=build /app/packages/maps-renderer /app/packages/maps-renderer
COPY --from=build /app/packages/pool /app/packages/pool
COPY --from=build /app/packages/schmovement /app/packages/schmovement
COPY --from=build /app/packages/ui /app/packages/ui
RUN chmod -R a+rX /app/apps /app/packages \
  && chmod a+r /app/package.json /app/tsconfig.base.json \
  && mkdir -p /app/.celld/object-store /app/.celld/state \
  && chown -R node:node /app/.celld
USER node
EXPOSE 44100
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:44100/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["/bin/sh", "/app/apps/world/scripts/start-celld.sh"]
