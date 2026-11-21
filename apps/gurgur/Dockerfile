FROM node:26-bookworm AS build
WORKDIR /app
COPY --from=oven/bun:1.4.4 /usr/local/bin/bun /usr/local/bin/bun
RUN npm install --global --ignore-scripts pnpm@12.21.0
ENV PNPM_CONFIG_ENABLE_GLOBAL_VIRTUAL_STORE=false
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/gurgur/package.json ./apps/gurgur/
COPY packages/gurgur-engine/package.json ./packages/gurgur-engine/
COPY packages/gurgur-game/package.json ./packages/gurgur-game/
RUN pnpm --filter @harrhy/gurgur... install --frozen-lockfile --config.enable-global-virtual-store=false
COPY tsconfig.base.json ./
COPY apps/gurgur ./apps/gurgur
COPY packages/gurgur-engine ./packages/gurgur-engine
COPY packages/gurgur-game ./packages/gurgur-game
RUN pnpm --filter @harrhy/gurgur run build

FROM oven/bun:1.4.4-slim AS runtime
WORKDIR /app/dist
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 \
    DATABASE_PATH=/app/data/world.sqlite RTC_PORT_MIN=40000 RTC_PORT_MAX=40100
COPY --from=build --chown=bun:bun /app/apps/gurgur/dist ./
RUN mkdir /app/data && chown bun:bun /app/data
USER bun
EXPOSE 3000
EXPOSE 40000-40100/udp
VOLUME ["/app/data"]
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e 'const r=await fetch("http://127.0.0.1:"+(process.env.PORT??"3000")+"/readyz");process.exit(r.ok?0:1)'
CMD ["bun", "server/src/index.js"]
