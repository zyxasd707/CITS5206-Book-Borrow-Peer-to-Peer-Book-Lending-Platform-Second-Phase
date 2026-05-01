#!/usr/bin/env bash
set -euo pipefail

ref="${1:-}"
if [ -z "$ref" ]; then
  echo "Usage: $0 <git-ref>" >&2
  exit 2
fi

git fetch origin --prune
git checkout "$ref"
docker compose -f compose.yaml build
docker compose -f compose.yaml up -d
docker compose -f compose.yaml ps
git log -1 --oneline
