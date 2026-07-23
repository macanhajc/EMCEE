#!/usr/bin/env bash
# Hits one of apps/web's /api/cron/* routes with the bearer auth those
# routes require (specs/02-architecture.md's VPS-crontab equivalent to
# Vercel Cron — same routes/schedule as apps/web/vercel.json). Not called
# directly: deploy/crontab wires this in with the route each schedule needs.
#
# Secrets come from .env.prod, sourced here rather than typed into
# crontab — crontab treats a bare "%" as a literal newline unless escaped,
# which is exactly the kind of thing a bearer token can contain by chance.
#
# Usage: deploy/cron-hit.sh <route-path>   e.g. /api/cron/degraded-alerts

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/.env.prod}"
route="${1:?usage: cron-hit.sh <route-path>}"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

curl -fsS -H "Authorization: Bearer ${CRON_SECRET}" "https://${DOMAIN}${route}"
