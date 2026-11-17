FROM node:26-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68 AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc tsconfig.base.json ./
COPY apps/harry-sluggers/package.json apps/harry-sluggers/
COPY packages/ui/package.json packages/ui/
RUN npm ci --workspace @harrhy/harry-sluggers --include-workspace-root=false --ignore-scripts
COPY apps/harry-sluggers apps/harry-sluggers
COPY packages/ui packages/ui
RUN npm exec --workspace @harrhy/harry-sluggers -- esbuild app/browser.ts --bundle --format=esm --platform=browser --outfile=dist/runtime.js
FROM node:26-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68
WORKDIR /app
COPY --from=build --chown=node:node /app /app
ENV NODE_ENV=production
ENV HARRHY_SLUGGERS_HOST=0.0.0.0
ENV PORT=8080
USER node
EXPOSE 8080
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:8080/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "--import", "remix/node-tsx", "apps/harry-sluggers/server.ts"]
