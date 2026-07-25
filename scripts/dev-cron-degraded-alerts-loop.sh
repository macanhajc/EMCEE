#!/usr/bin/env sh
# Loop wrapper around dev-cron-degraded-alerts.sh, same 5-minute cadence as
# apps/web/vercel.json's real cron. Meant to be started once per dev session
# (nohup ... & disown) and left running alongside the Next dev server and the
# Python supervisor — see that script's header for why this exists at all.
set -eu
cd "$(dirname "$0")"

while true; do
  ./dev-cron-degraded-alerts.sh
  sleep 300
done
