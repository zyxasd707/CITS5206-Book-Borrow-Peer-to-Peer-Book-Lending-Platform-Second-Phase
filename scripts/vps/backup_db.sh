#!/usr/bin/env bash
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-mysql-db}"
DB_NAME="${DB_NAME:-BookBorrow}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-rootpassword}"
BACKUP_DIR="${BACKUP_DIR:-/root/capstone15/backups/bookborrow-db}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
output="$BACKUP_DIR/${DB_NAME}-${timestamp}.sql.gz"

mkdir -p "$BACKUP_DIR"

docker exec "$DB_CONTAINER" sh -c \
  "mysqldump --single-transaction --routines --triggers --events -u'$DB_USER' -p'$DB_PASSWORD' '$DB_NAME'" \
  | gzip -c > "$output"

printf '%s\n' "$output"
