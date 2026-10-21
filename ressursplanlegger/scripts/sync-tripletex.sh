#!/bin/sh
# Kjører Tripletex-synken. Leser SYNC_SECRET, ellers TRIPLETEX_SYNC_SECRET.
# Skriver ikke hemmeligheten ut.
set -eu
secret="${SYNC_SECRET:-${TRIPLETEX_SYNC_SECRET:-}}"
if [ -z "$secret" ]; then
  echo "SYNC_SECRET mangler." >&2
  exit 1
fi
url="${SYNC_URL:-http://127.0.0.1:3000/api/tripletex/sync}"
# Header from stdin so the secret is not in curl's argv.
printf 'Authorization: Bearer %s\n' "$secret" | curl -fsS -X POST -H @- "$url"
echo
