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
# Print the JSON body even when Tripletex-steget feiler, so partial counts stay visible.
body=$(mktemp)
code=$(printf 'Authorization: Bearer %s\n' "$secret" | curl -sS -X POST -H @- -o "$body" -w '%{http_code}' "$url") || {
  rm -f "$body"
  exit 1
}
cat "$body"
rm -f "$body"
echo
if [ "$code" -ge 400 ]; then
  exit 1
fi
