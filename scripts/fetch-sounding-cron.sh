#!/usr/bin/env bash
# Primary sounding-fetch sweep, meant to run from cron on an always-on box.
# GitHub Actions runs the same check as a fallback (.github/workflows/fetch-sounding.yml)
# in case this machine is down — whichever gets there first wins, since both
# just no-op once today's sounding is already stored.
#
# Runs every minute through the 12Z hour (crontab: `* 12 * * *`), starting
# right at 12:00Z rather than GH Actions' 12:15Z, so the log's first
# "fetching" line pins down how soon the KOAK 12Z sounding actually posts —
# observed as late as 12:43Z in the past, hence the 13:00Z catch-all too.
#
# If CRON_SECRET is ever set in Vercel, uncomment the header line below and
# export CRON_SECRET in this script's environment (e.g. via crontab or a
# sourced env file) — see README.md "Deploying".
set -euo pipefail

APP_URL="https://steamer-view.vercel.app"
LOG_FILE="${HOME}/.local/log/fetch-sounding-cron.log"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >> "$LOG_FILE"
}

today=$(date -u +%Y-%m-%d)
response=$(curl -sf "${APP_URL}/api/sounding" || echo '{}')
launch_date=$(echo "$response" | jq -r '.data.launchTimeUTC // empty' | cut -c1-10)

if [ "$launch_date" = "$today" ]; then
  log "skip: today's sounding already stored"
  exit 0
fi

log "fetching: stored launch date is '${launch_date:-none}', want ${today}"

curl_auth_args=()
if [ -n "${CRON_SECRET:-}" ]; then
  curl_auth_args=(-H "Authorization: Bearer ${CRON_SECRET}")
fi

if curl -sf "${curl_auth_args[@]}" "${APP_URL}/api/cron/fetch-sounding" >> "$LOG_FILE" 2>&1; then
  log "fetch succeeded"
else
  log "fetch failed"
  exit 1
fi
