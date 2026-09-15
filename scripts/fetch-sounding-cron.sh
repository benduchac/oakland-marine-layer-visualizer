#!/usr/bin/env bash
# Primary sounding-fetch sweep, meant to run on an always-on box via the
# systemd units in scripts/systemd/ (not cron — see fetch-sounding.timer for
# why). GitHub Actions runs the same check as a fallback
# (.github/workflows/fetch-sounding.yml) in case this machine is down —
# whichever gets there first wins, since both just no-op once today's
# sounding is already stored.
#
# Runs every minute through the 12Z hour, starting right at 12:00Z. The
# actual balloon for a 12Z sounding launches ~11Z — an hour early, per NWS
# convention — and clears the 0-2000ft band this app cares about within a
# couple minutes of that, consistent with the archive having it ready by
# 12:02Z the one morning (2026-09-14) we've timed this closely. The 13:00Z
# catch-all stays as a hedge for slower mornings.
#
# If CRON_SECRET is ever set in Vercel, set it in fetch-sounding.service's
# [Service] block (Environment=CRON_SECRET=...) — see README.md "Deploying".
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
