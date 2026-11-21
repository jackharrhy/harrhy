FROM platformatic/node-caged:26-slim AS manifests
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN npm install --global --ignore-scripts pnpm@12.21.0
ENV PNPM_CONFIG_ENABLE_GLOBAL_VIRTUAL_STORE=false
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/artbin/package.json apps/artbin/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/artbin-core/package.json packages/artbin-core/package.json
COPY packages/identity/package.json packages/identity/package.json
COPY packages/request-body/package.json packages/request-body/package.json
COPY packages/mcp/package.json packages/mcp/package.json
COPY packages/json-schema/package.json packages/json-schema/package.json
COPY packages/result/package.json packages/result/package.json
COPY packages/maps-renderer/package.json packages/maps-renderer/package.json
COPY packages/schmovement/package.json packages/schmovement/package.json

FROM manifests AS production-dependencies
RUN pnpm --filter @harrhy/artbin-app... install --frozen-lockfile --config.enable-global-virtual-store=false --prod --ignore-scripts

FROM manifests AS build
RUN pnpm --filter @harrhy/artbin-app... --filter . install --frozen-lockfile --config.enable-global-virtual-store=false --ignore-scripts
# Build against the compression-enabled runtime, then transfer only the binding.
RUN addon="$(realpath apps/artbin/node_modules/better-sqlite3)" \
  && rm -rf "$addon/prebuilds" \
  && pnpm exec node-gyp rebuild --directory "$addon" --nodedir=/usr/local --jobs=2 \
  && cp "$addon/build/Release/better_sqlite3.node" /tmp/better_sqlite3.node
COPY tsconfig.base.json ./
COPY apps/artbin apps/artbin
COPY packages/ui packages/ui
COPY packages/artbin-core packages/artbin-core
COPY packages/identity packages/identity
COPY packages/request-body packages/request-body
COPY packages/mcp packages/mcp
COPY packages/json-schema packages/json-schema
COPY packages/result packages/result
COPY packages/maps-renderer packages/maps-renderer
COPY packages/schmovement packages/schmovement
RUN pnpm --filter @harrhy/worldview-renderer run build

# Overlay built sources without replacing the production workspace links.
RUN find apps packages -type d -name node_modules -prune -exec rm -rf {} +

FROM platformatic/node-caged:26-slim
RUN groupadd --gid 1000 node && useradd --uid 1000 --gid node --create-home node
RUN apt-get update && apt-get install -y --no-install-recommends imagemagick ca-certificates && rm -rf /var/lib/apt/lists/*
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=production-dependencies /app/packages/ui ./packages/ui
COPY --from=build /app/packages/ui ./packages/ui
COPY --from=production-dependencies /app/packages/artbin-core ./packages/artbin-core
COPY --from=build /app/packages/artbin-core ./packages/artbin-core
COPY --from=production-dependencies /app/packages/identity ./packages/identity
COPY --from=build /app/packages/identity ./packages/identity
COPY --from=production-dependencies /app/packages/request-body ./packages/request-body
COPY --from=build /app/packages/request-body ./packages/request-body
COPY --from=production-dependencies /app/packages/mcp ./packages/mcp
COPY --from=build /app/packages/mcp ./packages/mcp
COPY --from=production-dependencies /app/packages/json-schema ./packages/json-schema
COPY --from=build /app/packages/json-schema ./packages/json-schema
COPY --from=production-dependencies /app/packages/result ./packages/result
COPY --from=build /app/packages/result ./packages/result
COPY --from=production-dependencies /app/packages/maps-renderer ./packages/maps-renderer
COPY --from=production-dependencies /app/packages/schmovement ./packages/schmovement
COPY --from=build /app/packages/maps-renderer ./packages/maps-renderer
COPY --from=build /app/packages/schmovement ./packages/schmovement
COPY --from=production-dependencies /app/apps/artbin ./apps/artbin
COPY --from=build /app/apps/artbin ./apps/artbin
RUN chmod -R a+rX \
    /app/tsconfig.base.json \
    /app/packages/ui \
    /app/packages/artbin-core \
    /app/packages/identity \
    /app/packages/request-body \
    /app/packages/mcp \
    /app/packages/json-schema \
    /app/packages/result \
    /app/packages/maps-renderer \
    /app/apps/artbin
COPY --from=build /tmp/better_sqlite3.node /tmp/better_sqlite3.node
RUN addon="$(realpath apps/artbin/node_modules/better-sqlite3)" \
    && rm -rf "$addon/prebuilds" \
    && install -D -m 755 /tmp/better_sqlite3.node "$addon/build/Release/better_sqlite3.node" \
    && rm /tmp/better_sqlite3.node \
    && node apps/artbin/node_modules/playwright/cli.js install --with-deps --no-shell chromium \
    && mkdir -p apps/artbin/data apps/artbin/public/uploads apps/artbin/tmp/uploads \
    && chown -R node:node apps/artbin/data apps/artbin/public/uploads apps/artbin/tmp/uploads
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app/apps/artbin
USER node
EXPOSE 3000
CMD ["node", "--import", "remix/node-tsx", "server.ts"]
