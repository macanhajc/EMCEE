# syntax=docker/dockerfile:1
# check=skip=SecretsUsedInArgOrEnv
#
# Prod image for the control plane (R1, docs/cost-plan.md). Build from the
# monorepo root so the pnpm workspace (packages/schemas) resolves:
#   docker build -f apps/web/Dockerfile -t botmarket-web .
#
# The skipped check above covers the build-only ARGs/ENVs further down —
# they're documented placeholders (see the comment above them), never real
# secrets. Real secrets reach the container at runtime via the prod compose
# file's environment, never through this image.

FROM node:26-alpine AS base
# Standard Next.js/Alpine pairing — some transitive deps (@swc/core and
# friends, see pnpm-workspace.yaml's allowBuilds) ship glibc-linked
# binaries; libc6-compat shims them on musl.
RUN apk add --no-cache libc6-compat
WORKDIR /app
# Node 26 no longer bundles Corepack; install it explicitly, then let it
# pick up the exact pnpm version pinned in package.json's "packageManager"
# (same source pnpm/action-setup reads in CI).
RUN npm install -g corepack@latest && corepack enable

# ---- deps: install the whole workspace, keyed only on lockfile + manifests
# so this layer doesn't invalidate on every source change ----
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/schemas/package.json packages/schemas/package.json
RUN pnpm install --frozen-lockfile

# ---- builder ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .

# next build fails fast on missing env (apps/web/src/lib/stripe.ts and the
# Auth.js config read theirs at module scope). These build-time values are
# never shipped anywhere real — the runner stage below reads the actual
# secrets fresh from the container environment at request time. Mirrors
# the placeholders CI's build step uses (.github/workflows/ci.yml).
ARG DATABASE_URL=postgres://build:build@localhost:5432/build
ARG AUTH_SECRET=build-time-placeholder-not-a-real-secret
ARG STRIPE_SECRET_KEY=sk_test_build_placeholder_not_real
# NEXT_PUBLIC_* are the exception: Next.js inlines these into the client
# bundle at build time, so real values belong here if you want Sentry/
# PostHog wired in the shipped image (docs/cost-plan.md notes both are
# write-only/public-safe). SENTRY_* enable source-map upload; all optional.
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ARG SENTRY_AUTH_TOKEN
ENV DATABASE_URL=$DATABASE_URL \
    AUTH_SECRET=$AUTH_SECRET \
    STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY \
    NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST \
    SENTRY_ORG=$SENTRY_ORG \
    SENTRY_PROJECT=$SENTRY_PROJECT \
    SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN

RUN pnpm --filter web build

# ---- runner: only the traced standalone output ----
FROM node:26-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

# Real runtime secrets (DATABASE_URL, AUTH_SECRET, STRIPE_SECRET_KEY,
# TOKEN_SEAL_PUBLIC_KEY, ...) are supplied by the prod compose file's
# environment, not baked into the image.
CMD ["node", "apps/web/server.js"]
