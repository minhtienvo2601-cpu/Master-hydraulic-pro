#!/usr/bin/env bash
# Khôi phục từ bản sao lưu vào môi trường ĐÍCH (staging hoặc production mới).
#   ./restore.sh [db-YYYYMMDDTHHMMSSZ.dump.age]   (mặc định: bản mới nhất)
# Biến: DATABASE_URL (đích, phải là DB rỗng/được phép ghi đè), AGE_IDENTITY, BACKUP_REMOTE, DEST_IMAGES (bucket đích),
#       APP_DIR (thư mục backend để chạy migration + kiểm tra)
. "$(dirname "$0")/common.sh"
: "${DATABASE_URL:?}" "${AGE_IDENTITY:?}" "${BACKUP_REMOTE:?}" "${DEST_IMAGES:?}" "${APP_DIR:?}"
name="${1:-$(rclone lsf "$BACKUP_REMOTE/db/" --include '*.dump.age' | sort | tail -n1)}"
[ -n "$name" ] || { log "Không tìm thấy bản sao lưu"; exit 1; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
log "Tải $name"
rclone copy "$BACKUP_REMOTE/db/" "$tmp" --include "$name" --include "$name.sha256"
( cd "$tmp" && sha256sum -c "$name.sha256" )
log "Giải mã + pg_restore"
age -d -i "$AGE_IDENTITY" -o "$tmp/db.dump" "$tmp/$name"
pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error -d "$(pg_url "$DATABASE_URL")" "$tmp/db.dump"
log "Khôi phục ảnh → $DEST_IMAGES"
rclone copy "$BACKUP_REMOTE/images" "$DEST_IMAGES" --checksum --transfers 8
log "Migration + kiểm tra liên kết ảnh"
( cd "$APP_DIR" && TJ_DATABASE_URL="$DATABASE_URL" alembic upgrade head && TJ_DATABASE_URL="$DATABASE_URL" python -m app.cli verify-storage --check-hash )
log "Khôi phục hoàn tất từ $name"
