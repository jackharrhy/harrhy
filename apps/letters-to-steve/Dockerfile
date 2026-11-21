FROM platformatic/node-caged:26-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN npm install --global --ignore-scripts pnpm@12.21.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/letters-to-steve/package.json apps/letters-to-steve/package.json
COPY packages/identity/package.json packages/identity/package.json
RUN pnpm --filter @harrhy/letters-to-steve... install --frozen-lockfile --config.enable-global-virtual-store=false --prod
COPY apps/letters-to-steve ./apps/letters-to-steve
COPY packages/identity ./packages/identity

FROM platformatic/node-caged:26-slim
RUN groupadd --gid 1000 node && useradd --uid 1000 --gid node --create-home node
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=44110 DATABASE_PATH=/app/data/letters.sqlite UPLOAD_DIRECTORY=/app/data/uploads
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node tsconfig.base.json ./tsconfig.base.json
COPY --from=build --chown=node:node /app/apps/letters-to-steve ./apps/letters-to-steve
COPY --from=build --chown=node:node /app/packages/identity ./packages/identity
RUN mkdir -p /app/data/uploads && chown -R node:node /app/data
WORKDIR /app/apps/letters-to-steve
USER node
EXPOSE 44110
CMD ["npm", "start"]
