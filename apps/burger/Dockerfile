FROM node:26-bookworm AS build
WORKDIR /app
COPY --from=oven/bun:1.4.4 /usr/local/bin/bun /usr/local/bin/bun
COPY package.json package-lock.json .npmrc ./
COPY apps/burger/package.json ./apps/burger/
COPY packages/burger-core/package.json ./packages/burger-core/
RUN npm ci --workspace @harrhy/burger --include-workspace-root=false
COPY tsconfig.base.json ./
COPY apps/burger ./apps/burger
COPY packages/burger-core ./packages/burger-core
RUN npm run build --workspace @harrhy/burger

FROM oven/bun:1.4.4-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=5000 DB_PATH=/app/data/burger.sqlite \
    WEB_ROOT=/app/dist/client
COPY --from=build --chown=bun:bun /app/apps/burger/dist ./dist
RUN mkdir /app/data && chown bun:bun /app/data
USER bun
EXPOSE 5000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e 'const r=await fetch("http://127.0.0.1:"+(process.env.PORT??"5000")+"/api/atlas");process.exit(r.ok?0:1)'
CMD ["bun", "dist/server/server.js"]
