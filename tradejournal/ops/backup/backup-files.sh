#!/usr/bin/env bash
# Sao lưu ảnh mới/thay đổi. Dùng "copy" (không phải "sync") nên xóa ở production KHÔNG xóa ở bản sao lưu.
# Thời hạn lưu giữ do lifecycle rule của bucket sao lưu quyết định (xem docs/BACKUP_RESTORE.md).
# Ảnh được mã hóa phía máy chủ của nhà cung cấp; nếu cần mã hóa phía client, cấu hình rclone "crypt" cho BACKUP_REMOTE.
. "$(dirname "$0")/common.sh"
: "${SRC_IMAGES:?}" "${BACKUP_REMOTE:?}"
log "rclone copy $SRC_IMAGES → $BACKUP_REMOTE/images"
rclone copy "$SRC_IMAGES" "$BACKUP_REMOTE/images" --checksum --transfers 8
log "Xong"
