FROM platformatic/node-caged:26-slim AS build
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY apps/maps-compiler/package.json ./apps/maps-compiler/
COPY packages/maps-editor/package.json ./packages/maps-editor/
COPY packages/maps-protocol/package.json ./packages/maps-protocol/
COPY packages/maps-renderer/package.json ./packages/maps-renderer/
COPY packages/request-body/package.json ./packages/request-body/
RUN npm ci --workspace @harrhy/maps-compiler --include-workspace-root=true
COPY tsconfig.base.json ./
COPY apps/maps-compiler ./apps/maps-compiler
COPY packages/maps-editor ./packages/maps-editor
COPY packages/maps-protocol ./packages/maps-protocol
COPY packages/maps-renderer ./packages/maps-renderer
COPY packages/request-body ./packages/request-body
RUN npm run build --workspace @harrhy/worldview-renderer \
  && npm run build --workspace @harrhy/maps-editor \
  && npm run build --workspace @harrhy/maps-protocol \
  && npm run build --workspace @harrhy/maps-compiler \
  && npm prune --omit=dev --workspace @harrhy/maps-compiler --include-workspace-root=true

FROM platformatic/node-caged:26-slim
RUN groupadd --gid 1000 node && useradd --uid 1000 --gid node --create-home node
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV HARRHY_MAPS_COMPILER_HOST=0.0.0.0
ENV HARRHY_MAPS_COMPILER_PORT=8788
WORKDIR /app/apps/maps-compiler
COPY --from=build --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/package.json /app/tsconfig.base.json /app/
COPY --from=build --chown=node:node /app/apps/maps-compiler /app/apps/maps-compiler
COPY --from=build --chown=node:node /app/packages/maps-editor /app/packages/maps-editor
COPY --from=build --chown=node:node /app/packages/maps-protocol /app/packages/maps-protocol
COPY --from=build --chown=node:node /app/packages/maps-renderer /app/packages/maps-renderer
COPY --from=build --chown=node:node /app/packages/request-body /app/packages/request-body
USER node
EXPOSE 8788
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8788/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist/server.js"]
