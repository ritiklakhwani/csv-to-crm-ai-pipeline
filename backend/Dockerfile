# syntax=docker/dockerfile:1

# ------------------------------------------------------------------------------------------------
# Express API + AI extraction pipeline.
#
# Multi-stage: a build stage compiles TypeScript with tsup (which bundles the source-only
# @groweasy/shared workspace package into dist), a prod-deps stage installs only runtime
# dependencies, and a slim runtime stage runs as a non-root user with nothing but dist + prod
# node_modules. Build from the REPO ROOT so the pnpm workspace manifests are in context:
#
#   docker build -f backend/Dockerfile .
# ------------------------------------------------------------------------------------------------

FROM node:22-alpine AS base
# corepack reads packageManager from package.json, so every stage uses the pinned pnpm version
RUN corepack enable
WORKDIR /app

# --- build: compile backend/dist (shared gets bundled in by tsup's noExternal) -------------------
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY shared/package.json shared/package.json
COPY backend/package.json backend/package.json
# @groweasy/backend... = backend plus its workspace dependencies (shared)
RUN pnpm install --frozen-lockfile --filter "@groweasy/backend..."
COPY shared shared
COPY backend backend
RUN pnpm --filter @groweasy/backend build

# --- prod-deps: runtime node_modules only (no toolchain, no dev types) ---------------------------
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY shared/package.json shared/package.json
COPY backend/package.json backend/package.json
RUN pnpm install --prod --frozen-lockfile --filter "@groweasy/backend..."
# shared is source-only; the bundle inlines it, but the workspace symlink must resolve
COPY shared shared

# --- runtime: slim, non-root -----------------------------------------------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY --from=prod-deps --chown=app:app /app/node_modules node_modules
COPY --from=prod-deps --chown=app:app /app/backend/node_modules backend/node_modules
COPY --from=prod-deps --chown=app:app /app/shared shared
COPY --from=build --chown=app:app /app/backend/dist backend/dist
COPY --chown=app:app backend/package.json backend/package.json

USER app
EXPOSE 4000

# platform health checks (Render/Railway/compose) probe this
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-4000}/api/v1/health" || exit 1

CMD ["node", "backend/dist/index.js"]
