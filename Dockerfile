# One image, three entry points:
#   serve (default): node apps/server/dist/serve.js
#   migrate:         node apps/server/dist/migrate.js
#   operator:        node apps/server/dist/operator.js <command>
ARG BUN_IMAGE=docker.io/oven/bun:1.4.2
ARG NODE_IMAGE=docker.io/library/node:24-slim

FROM ${BUN_IMAGE} AS build
WORKDIR /app

COPY package.json bun.lock ./
COPY packages/domain/package.json packages/domain/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages packages
COPY apps apps
RUN bun run build

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app

# The server bundle includes its dependencies, so the runtime needs no node_modules.
COPY --from=build --chown=root:root /app/apps/server/dist apps/server/dist
COPY --from=build --chown=root:root /app/apps/web/dist apps/web/dist

USER node
EXPOSE 4000
CMD ["node", "apps/server/dist/serve.js"]
