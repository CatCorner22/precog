#!/usr/bin/env bash
set -euo pipefail

if [[ ! ${CRON_SECRET:-} =~ ^[A-Za-z0-9._~+/-]+=*$ ]]; then
  printf 'Set CRON_SECRET to a bearer token, for example with openssl rand -hex 32.\n' >&2
  exit 1
fi

origin="http://127.0.0.1:${PORT:-8080}"
for ((attempt = 1; ; attempt++)); do
  status=0
  curl --disable --noproxy '*' --fail --silent --max-time 5 --output /dev/null \
    "$origin/api/health" || status=$?
  if ((status == 0)); then break; fi
  if ((status != 7 || attempt == 60)); then
    printf 'Precog health check failed (curl exit %s). The digest was not sent.\n' "$status" >&2
    exit "$status"
  fi
  sleep 2
done

printf 'Authorization: Bearer %s\n' "$CRON_SECRET" |
  curl --disable --noproxy '*' --fail --silent --show-error --max-time 300 \
    --header @- "$origin/api/cron/digest"
