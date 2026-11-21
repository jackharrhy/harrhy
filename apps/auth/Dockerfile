FROM platformatic/node-caged:26-slim AS assets
WORKDIR /app
RUN npm install --global --ignore-scripts pnpm@12.21.0
ENV PNPM_CONFIG_ENABLE_GLOBAL_VIRTUAL_STORE=false
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/auth/package.json apps/auth/package.json
COPY packages/logger/package.json packages/logger/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/ui/styles.ts packages/ui/styles.ts
RUN pnpm --filter @harrhy/auth... install --frozen-lockfile --config.enable-global-virtual-store=false
COPY packages/logger ./packages/logger

FROM platformatic/node-caged:26-slim
RUN groupadd --gid 1000 node && useradd --uid 1000 --gid node --create-home node
WORKDIR /app
COPY --from=assets --chown=node:node /app/node_modules ./node_modules
COPY --from=assets --chown=node:node /app/packages/ui ./packages/ui
COPY --from=assets --chown=node:node /app/packages/logger ./packages/logger
ARG HARRHY_AUTH_VERSION=development
ENV HARRHY_AUTH_VERSION=${HARRHY_AUTH_VERSION}
WORKDIR /app/apps/auth
RUN node -e "const assert = require('node:assert/strict'); assert.equal(process.versions.node.split('.')[0], '26'); assert.equal(process.config.variables.v8_enable_pointer_compression, 1)"
COPY --from=assets --chown=node:node /app/apps/auth /app/apps/auth
COPY --chown=node:node apps/auth/tsconfig.json ./tsconfig.json
COPY --chown=node:node apps/auth/LICENSE ./LICENSE
COPY --chown=node:node apps/auth/src ./src
COPY --chown=node:node apps/auth/public ./public
COPY --chown=node:node apps/auth/config ./config
USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "src/server.mjs"]
