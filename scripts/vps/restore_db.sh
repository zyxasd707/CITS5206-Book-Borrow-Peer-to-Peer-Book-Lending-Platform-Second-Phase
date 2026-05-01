#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "" ]; then
  echo "Usage: $0 <backup.sql.gz>" >&2
  exit 2
fi

backup_file="$1"
DB_CONTAINER="${DB_CONTAINER:-mysql-db}"
DB_NAME="${DB_NAME:-BookBorrow}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-rootpassword}"

if [ ! -f "$backup_file" ]; then
  echo "Backup file not found: $backup_file" >&2
  exit 2
fi

gzip -dc "$backup_file" | docker exec -i "$DB_CONTAINER" sh -c \
  "mysql -u'$DB_USER' -p'$DB_PASSWORD' '$DB_NAME'"

printf 'Restored %s into %s/%s\n' "$backup_file" "$DB_CONTAINER" "$DB_NAME"
