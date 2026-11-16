FROM platformatic/node-caged:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/garden/package.json apps/garden/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN npm ci --workspace @harrhy/garden --include-workspace-root=false && npm prune --omit=dev --workspace @harrhy/garden

FROM platformatic/node-caged:26-slim
RUN groupadd --gid 1000 node && useradd --uid 1000 --gid node --create-home node
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY tsconfig.base.json ./tsconfig.base.json
COPY apps/garden ./apps/garden
COPY packages/ui ./packages/ui
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4322 GARDEN_CONTENT_PATH=/app/data/published
WORKDIR /app/apps/garden
USER node
EXPOSE 4322
CMD ["npm", "start"]
