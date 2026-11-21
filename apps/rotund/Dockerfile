FROM platformatic/node-caged:26-slim AS manifests
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN npm install --global --ignore-scripts pnpm@12.21.0
ENV PNPM_CONFIG_ENABLE_GLOBAL_VIRTUAL_STORE=false
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/rotund/package.json apps/rotund/package.json

FROM manifests AS production-dependencies
RUN pnpm --filter @harrhy/rotund... install --frozen-lockfile --config.enable-global-virtual-store=false --prod

FROM manifests AS build
RUN pnpm --filter @harrhy/rotund... install --frozen-lockfile --config.enable-global-virtual-store=false
COPY apps/rotund ./apps/rotund
RUN pnpm --filter @harrhy/rotund run build

FROM platformatic/node-caged:26-slim
RUN groupadd --gid 1000 node && useradd --uid 1000 --gid node --create-home node
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=80
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/rotund/dist ./apps/rotund/dist
COPY --from=production-dependencies --chown=node:node /app/apps/rotund ./apps/rotund
WORKDIR /app/apps/rotund
USER node
EXPOSE 80
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:80/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist/server.js"]
