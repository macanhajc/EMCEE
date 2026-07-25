#!/usr/bin/env sh
# Local-dev stand-in for the Vercel Cron job in apps/web/vercel.json
# (degraded-alerts, */5 * * * *). Nothing invokes that route on a schedule
# outside a real deployment or a VPS crontab (see the route's own docstring,
# apps/web/src/app/api/cron/degraded-alerts/route.ts) — so a crash-loop never
# alerts anyone while developing locally unless something hits it by hand.
# Installed as a user crontab entry (crontab -l to see it, crontab -e to
# remove it) rather than run standalone; reads CRON_SECRET from apps/web/.env
# so the secret itself never lands in this (committed) script.
set -eu
cd "$(dirname "$0")/.."

CRON_SECRET=$(grep -m1 '^CRON_SECRET=' apps/web/.env | cut -d= -f2-)
if [ -z "$CRON_SECRET" ]; then
  echo "$(date -Is) CRON_SECRET not set in apps/web/.env — skipping" >&2
  exit 1
fi

curl -sS -X GET "${APP_ORIGIN:-http://localhost:3000}/api/cron/degraded-alerts" \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -w '\n%{http_code}\n'
