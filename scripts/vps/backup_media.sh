#!/usr/bin/env bash
set -euo pipefail

MEDIA_VOLUME="${MEDIA_VOLUME:-bookborrow_media}"
BACKUP_DIR="${BACKUP_DIR:-/root/capstone15/backups/bookborrow-media}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
output="$BACKUP_DIR/${MEDIA_VOLUME}-${timestamp}.tar.gz"
output_file="$(basename "$output")"

mkdir -p "$BACKUP_DIR"

docker volume inspect "$MEDIA_VOLUME" >/dev/null
docker run --rm \
  -v "$MEDIA_VOLUME:/media:ro" \
  -v "$BACKUP_DIR:/backup" \
  alpine:3.20 \
  sh -c "cd /media && tar -czf /backup/$output_file ."

printf '%s\n' "$output"
