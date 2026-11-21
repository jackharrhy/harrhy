FROM node:26-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68 AS build
WORKDIR /app
RUN npm install --global --ignore-scripts pnpm@12.21.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps/harry-sluggers/package.json apps/harry-sluggers/
COPY packages/ui/package.json packages/ui/
RUN pnpm --filter @harrhy/harry-sluggers... install --frozen-lockfile --config.enable-global-virtual-store=false --ignore-scripts
COPY apps/harry-sluggers apps/harry-sluggers
COPY packages/ui packages/ui
RUN pnpm --filter @harrhy/harry-sluggers exec esbuild app/browser.ts --bundle --format=esm --platform=browser --outfile=dist/runtime.js

FROM node:26-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/tsconfig.base.json /app/tsconfig.base.json
COPY --from=build --chown=node:node /app/apps/harry-sluggers /app/apps/harry-sluggers
COPY --from=build --chown=node:node /app/packages/ui /app/packages/ui
ENV NODE_ENV=production
ENV HARRHY_SLUGGERS_HOST=0.0.0.0
ENV PORT=8080
USER node
EXPOSE 8080
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:8080/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "--import", "remix/node-tsx", "apps/harry-sluggers/server.ts"]
