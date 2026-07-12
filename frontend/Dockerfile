# syntax=docker/dockerfile:1

# ------------------------------------------------------------------------------------------------
# Next.js frontend, built as a standalone server (output: 'standalone' in next.config.ts), so the
# runtime image carries only the traced server bundle + static assets — no node_modules install.
#
# NEXT_PUBLIC_* values are inlined into the client bundle AT BUILD TIME, so the API origin is a
# build arg, not a runtime env var. Build from the REPO ROOT:
#
#   docker build -f frontend/Dockerfile --build-arg NEXT_PUBLIC_API_URL=http://localhost:4000 .
# ------------------------------------------------------------------------------------------------

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# --- build ------------------------------------------------------------------------------------
FROM base AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY shared/package.json shared/package.json
COPY frontend/package.json frontend/package.json
RUN pnpm install --frozen-lockfile --filter "@groweasy/frontend..."
COPY shared shared
COPY frontend frontend
RUN pnpm --filter @groweasy/frontend build

# --- runtime: the traced standalone output, non-root -------------------------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

# standalone preserves the monorepo layout, so the server entry lives at frontend/server.js
COPY --from=build --chown=app:app /app/frontend/.next/standalone ./
COPY --from=build --chown=app:app /app/frontend/.next/static frontend/.next/static
COPY --from=build --chown=app:app /app/frontend/public frontend/public

USER app
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "frontend/server.js"]
