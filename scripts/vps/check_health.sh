#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-https://www.bookborrow.org}"
DISK_THRESHOLD="${DISK_THRESHOLD:-85}"
CERT_WARN_DAYS="${CERT_WARN_DAYS:-21}"
COMPOSE_FILES="${COMPOSE_FILES:-compose.yaml}"

failures=0

check() {
  local name="$1"
  shift
  if "$@"; then
    printf '[OK] %s\n' "$name"
  else
    printf '[FAIL] %s\n' "$name" >&2
    failures=$((failures + 1))
  fi
}

check "docker compose services are running" \
  docker compose -f "$COMPOSE_FILES" ps --status running

for service in mysql-db fastapi-backend next-frontend nginx-proxy; do
  check "$service container exists" docker inspect "$service" >/dev/null
  restarts="$(docker inspect -f '{{.RestartCount}}' "$service" 2>/dev/null || echo 999)"
  if [ "$restarts" -gt 0 ]; then
    printf '[WARN] %s restart count is %s\n' "$service" "$restarts" >&2
  else
    printf '[OK] %s restart count is 0\n' "$service"
  fi
done

check "backend health endpoint" curl -fsS --max-time 10 http://127.0.0.1:8000/health >/dev/null
check "public frontend" curl -kfsS --max-time 15 "$DOMAIN" >/dev/null
check "public books API" curl -kfsS --max-time 15 "$DOMAIN/api/v1/books" >/dev/null

disk_used="$(df -P / | awk 'NR==2 {gsub(/%/, "", $5); print $5}')"
if [ "$disk_used" -ge "$DISK_THRESHOLD" ]; then
  printf '[FAIL] disk usage is %s%%, threshold is %s%%\n' "$disk_used" "$DISK_THRESHOLD" >&2
  failures=$((failures + 1))
else
  printf '[OK] disk usage is %s%%\n' "$disk_used"
fi

host="${DOMAIN#https://}"
host="${host#http://}"
host="${host%%/*}"
expiry_epoch="$(
  echo | openssl s_client -servername "$host" -connect "$host:443" 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null \
    | cut -d= -f2 \
    | xargs -I{} date -d "{}" +%s 2>/dev/null || true
)"

if [ -n "$expiry_epoch" ]; then
  now_epoch="$(date +%s)"
  days_left=$(( (expiry_epoch - now_epoch) / 86400 ))
  if [ "$days_left" -lt "$CERT_WARN_DAYS" ]; then
    printf '[FAIL] TLS certificate expires in %s days\n' "$days_left" >&2
    failures=$((failures + 1))
  else
    printf '[OK] TLS certificate expires in %s days\n' "$days_left"
  fi
else
  printf '[WARN] TLS certificate expiry check skipped\n' >&2
fi

if [ "$failures" -gt 0 ]; then
  exit 1
fi
