#!/usr/bin/env bash
# Sao lưu database hằng ngày: pg_dump (custom format) → mã hóa age → tải lên vùng sao lưu độc lập.
. "$(dirname "$0")/common.sh"
: "${DATABASE_URL:?}" "${AGE_RECIPIENT:?}" "${BACKUP_REMOTE:?}"
ts=$(date -u +%Y%m%dT%H%M%SZ)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
f="$tmp/db-$ts.dump.age"
log "pg_dump → $f"
pg_dump --format=custom --no-owner --no-privileges "$(pg_url "$DATABASE_URL")" | age -r "$AGE_RECIPIENT" -o "$f"
( cd "$tmp" && sha256sum "db-$ts.dump.age" > "db-$ts.dump.age.sha256" )
rclone copy "$tmp" "$BACKUP_REMOTE/db/" --include "db-$ts.*"
log "Đã tải lên $BACKUP_REMOTE/db/db-$ts.dump.age ($(stat -c%s "$f") bytes)"
