FROM platformatic/node-caged:26-slim AS manifests
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN npm install --global --ignore-scripts pnpm@12.21.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/cms/package.json ./apps/cms/
COPY packages/identity/package.json ./packages/identity/
COPY packages/json-schema/package.json ./packages/json-schema/
COPY packages/logger/package.json ./packages/logger/
COPY packages/mcp/package.json ./packages/mcp/
COPY packages/request-body/package.json ./packages/request-body/
COPY packages/result/package.json ./packages/result/
COPY packages/rich-text/package.json ./packages/rich-text/
COPY packages/ui/package.json ./packages/ui/

FROM manifests AS production-dependencies
RUN pnpm --filter @harrhy/cms... install --frozen-lockfile --prod

FROM manifests AS build
RUN pnpm --filter @harrhy/cms... --filter . install --frozen-lockfile
COPY tsconfig.base.json ./
COPY apps/cms ./apps/cms
COPY packages/identity ./packages/identity
COPY packages/json-schema ./packages/json-schema
COPY packages/logger ./packages/logger
COPY packages/mcp ./packages/mcp
COPY packages/request-body ./packages/request-body
COPY packages/result ./packages/result
COPY packages/rich-text ./packages/rich-text
COPY packages/ui ./packages/ui
RUN pnpm --filter @harrhy/cms run build

# Overlay built sources without replacing the production workspace links.
RUN find apps packages -type d -name node_modules -prune -exec rm -rf {} +

FROM platformatic/node-caged:26-slim
RUN groupadd --gid 1000 node && useradd --uid 1000 --gid node --create-home node
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
ARG APP_REVISION=unknown
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4351 HARRHY_CMS_DATA_DIR=/app/data APP_REVISION=$APP_REVISION
WORKDIR /app/apps/cms
COPY --from=production-dependencies --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/package.json /app/tsconfig.base.json /app/
COPY --from=production-dependencies --chown=node:node /app/apps/cms /app/apps/cms
COPY --from=build --chown=node:node /app/apps/cms /app/apps/cms
COPY --from=production-dependencies --chown=node:node /app/packages/identity /app/packages/identity
COPY --from=build --chown=node:node /app/packages/identity /app/packages/identity
COPY --from=production-dependencies --chown=node:node /app/packages/json-schema /app/packages/json-schema
COPY --from=build --chown=node:node /app/packages/json-schema /app/packages/json-schema
COPY --from=production-dependencies --chown=node:node /app/packages/logger /app/packages/logger
COPY --from=build --chown=node:node /app/packages/logger /app/packages/logger
COPY --from=production-dependencies --chown=node:node /app/packages/mcp /app/packages/mcp
COPY --from=build --chown=node:node /app/packages/mcp /app/packages/mcp
COPY --from=production-dependencies --chown=node:node /app/packages/request-body /app/packages/request-body
COPY --from=build --chown=node:node /app/packages/request-body /app/packages/request-body
COPY --from=production-dependencies --chown=node:node /app/packages/result /app/packages/result
COPY --from=build --chown=node:node /app/packages/result /app/packages/result
COPY --from=production-dependencies --chown=node:node /app/packages/rich-text /app/packages/rich-text
COPY --from=build --chown=node:node /app/packages/rich-text /app/packages/rich-text
COPY --from=production-dependencies --chown=node:node /app/packages/ui /app/packages/ui
COPY --from=build --chown=node:node /app/packages/ui /app/packages/ui
RUN mkdir -p /app/data /app/backups && chown node:node /app/data /app/backups
USER node
EXPOSE 4351
CMD ["node", "--import", "remix/node-tsx", "server.ts"]
