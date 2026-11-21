FROM platformatic/node-caged:26-slim AS dependencies
WORKDIR /app
RUN npm install --global --ignore-scripts pnpm@12.21.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/ui/package.json apps/ui/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm --filter @harrhy/ui-app... install --frozen-lockfile --prod
COPY packages/ui ./packages/ui
COPY apps/ui ./apps/ui

FROM platformatic/node-caged:26-slim
RUN groupadd --gid 1000 node && useradd --uid 1000 --gid node --create-home node
WORKDIR /app
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node tsconfig.base.json ./tsconfig.base.json
COPY --from=dependencies --chown=node:node /app/packages/ui ./packages/ui
COPY --from=dependencies --chown=node:node /app/apps/ui ./apps/ui
WORKDIR /app/apps/ui
ENV HOST=0.0.0.0 PORT=18943 NODE_ENV=production
USER node
EXPOSE 18943
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:18943/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "--import", "remix/node-tsx", "server.ts"]
