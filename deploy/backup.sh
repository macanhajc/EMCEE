#!/usr/bin/env bash
# Nightly Postgres backup (R1, docs/cost-plan.md): pg_dump inside the
# postgres container -> gzip -> upload to Backblaze B2 or Cloudflare R2 via
# rclone (both expose an S3-compatible API; rclone abstracts the
# difference, so either works unchanged here). Crontab entry: deploy/crontab.
#
# One-time setup on the VPS, not done by this script:
#   - Install rclone and configure a remote (`rclone config`) named by
#     RCLONE_REMOTE below.
#   - Give that bucket a lifecycle/expiration rule (B2 "Lifecycle Rules",
#     R2 "Object Lifecycle Rules") for pruning old backups remotely — this
#     script only prunes its own local copies (KEEP_LOCAL_DAYS), on
#     purpose: the provider's native retention is one less thing to get
#     wrong than reimplementing remote deletion here.
#
# Usage (see deploy/crontab for the real cron wiring):
#   cd /path/to/repo && ./deploy/backup.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-botmarket-prod}"
COMPOSE_FILE="${COMPOSE_FILE:-$SCRIPT_DIR/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/.env.prod}"
RCLONE_REMOTE="${RCLONE_REMOTE:?set RCLONE_REMOTE, e.g. b2:botmarket-backups}"
BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/backups}"
KEEP_LOCAL_DAYS="${KEEP_LOCAL_DAYS:-7}"

log() { echo "[$(date -u -Iseconds)] $*"; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

compose() {
  docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump_file="$BACKUP_DIR/botmarket-${timestamp}.sql.gz"

log "starting backup -> $dump_file"
compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "$dump_file"

if [ ! -s "$dump_file" ]; then
  log "ERROR: dump is empty, aborting upload"
  rm -f "$dump_file"
  exit 1
fi

log "uploading to $RCLONE_REMOTE"
rclone copy "$dump_file" "$RCLONE_REMOTE" --no-traverse

log "pruning local backups older than ${KEEP_LOCAL_DAYS}d"
find "$BACKUP_DIR" -name 'botmarket-*.sql.gz' -mtime "+${KEEP_LOCAL_DAYS}" -delete

log "backup complete"
