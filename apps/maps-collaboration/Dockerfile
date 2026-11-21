ARG CELLD_IMAGE=ghcr.io/jackharrhy/celld@sha256:dfea10316af715b6540c4d2257182537e5bc620b072310273c54d5cbd929820a
FROM ${CELLD_IMAGE} AS celld

FROM node:26-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68 AS manifests
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN npm install --global --ignore-scripts pnpm@12.21.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/maps-collaboration/package.json ./apps/maps-collaboration/
COPY packages/maps-editor/package.json ./packages/maps-editor/
COPY packages/maps-protocol/package.json ./packages/maps-protocol/
COPY packages/schmovement/package.json ./packages/schmovement/
COPY packages/schmovement/package.json ./packages/schmovement/

FROM manifests AS dependencies
RUN pnpm --filter @harrhy/maps-collaboration... install --frozen-lockfile

FROM manifests AS build
# Shared Maps builds need root tsrs; runtime dependencies remain in the prior stage.
RUN pnpm --filter @harrhy/maps-collaboration... --filter . install --frozen-lockfile
COPY tsconfig.base.json ./
COPY apps/maps-collaboration ./apps/maps-collaboration
COPY packages/maps-editor ./packages/maps-editor
COPY packages/maps-protocol ./packages/maps-protocol
COPY packages/schmovement ./packages/schmovement
COPY packages/schmovement ./packages/schmovement
RUN pnpm --filter @harrhy/worldview-renderer run build \
  && pnpm --filter @harrhy/maps-editor run build \
  && pnpm --filter @harrhy/maps-protocol run build

# Overlay built sources without replacing the runtime workspace links.
RUN find apps packages -type d -name node_modules -prune -exec rm -rf {} +

FROM node:26-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68 AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

ARG CELLD_IMAGE
LABEL dev.jackharrhy.maps-collaboration.celld-image=${CELLD_IMAGE}

ENV NODE_ENV=production
ENV CELLD_ADDR=0.0.0.0:44100
ENV CELLD_INTERNAL_ADDR=127.0.0.1:44101
ENV CELLD_BUCKET=sqlite:///app/.celld/object-store/objects.sqlite3
ENV CELLD_DURABILITY=bucket
ENV CELLD_WATCH=/app/.celld/state

WORKDIR /app/apps/maps-collaboration
COPY --from=celld /usr/local/bin/celld /usr/local/bin/celld
COPY --from=dependencies --chown=node:node /app/node_modules /app/node_modules
COPY --from=dependencies --chown=node:node /app/package.json /app/
COPY --from=build --chown=node:node /app/tsconfig.base.json /app/
COPY --from=dependencies --chown=node:node /app/apps/maps-collaboration /app/apps/maps-collaboration
COPY --from=build --chown=node:node /app/apps/maps-collaboration /app/apps/maps-collaboration
COPY --from=dependencies --chown=node:node /app/packages/maps-editor /app/packages/maps-editor
COPY --from=build --chown=node:node /app/packages/maps-editor /app/packages/maps-editor
COPY --from=dependencies --chown=node:node /app/packages/maps-protocol /app/packages/maps-protocol
COPY --from=build --chown=node:node /app/packages/maps-protocol /app/packages/maps-protocol
COPY --from=dependencies --chown=node:node /app/packages/schmovement /app/packages/schmovement
COPY --from=dependencies --chown=node:node /app/packages/schmovement /app/packages/schmovement
COPY --from=build --chown=node:node /app/packages/schmovement /app/packages/schmovement
COPY --from=build --chown=node:node /app/packages/schmovement /app/packages/schmovement
RUN mkdir -p /app/.celld \
  && chmod +x /app/apps/maps-collaboration/scripts/start-celld.sh \
  && chown -R node:node /app/.celld

USER node
# Celld resolves esbuild from this workspace at startup.
RUN test -x "$(node -p 'require.resolve("esbuild/bin/esbuild")')"
EXPOSE 44100
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:44100/health').then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"]
CMD ["/app/apps/maps-collaboration/scripts/start-celld.sh"]
