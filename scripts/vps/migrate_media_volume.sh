#!/usr/bin/env bash
set -euo pipefail

BACKEND_CONTAINER="${BACKEND_CONTAINER:-fastapi-backend}"
MEDIA_VOLUME="${MEDIA_VOLUME:-bookborrow_media}"
BACKUP_DIR="${BACKUP_DIR:-/root/capstone15/backups/bookborrow-media}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
snapshot_dir="$BACKUP_DIR/container-media-${timestamp}"

mkdir -p "$BACKUP_DIR"
docker volume create "$MEDIA_VOLUME" >/dev/null

if docker inspect "$BACKEND_CONTAINER" >/dev/null 2>&1 && docker exec "$BACKEND_CONTAINER" test -d /app/media; then
  docker cp "$BACKEND_CONTAINER:/app/media" "$snapshot_dir"
else
  mkdir -p "$snapshot_dir"
fi

docker run --rm \
  -v "$MEDIA_VOLUME:/media" \
  -v "$snapshot_dir:/snapshot:ro" \
  alpine:3.20 \
  sh -c "mkdir -p /media && cp -a /snapshot/. /media/"

printf 'media_snapshot=%s\n' "$snapshot_dir"
printf 'media_volume=%s\n' "$MEDIA_VOLUME"
