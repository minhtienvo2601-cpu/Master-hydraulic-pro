# Biến dùng chung cho các script sao lưu. Nạp từ /etc/tradejournal/backup.env hoặc biến môi trường.
#   DATABASE_URL     postgresql://user:pass@host:5432/tradejournal   (URL libpq; "+psycopg" sẽ tự bỏ)
#   AGE_RECIPIENT    khóa công khai age (age1...). Máy production CHỈ giữ khóa công khai → không tự giải mã được bản sao lưu.
#   AGE_IDENTITY     đường dẫn tệp khóa bí mật age (chỉ cần khi KHÔI PHỤC; lưu ngoài production)
#   SRC_IMAGES       rclone remote của bucket ảnh production, vd prod-s3:tradejournal-images
#   BACKUP_REMOTE    rclone remote ở TÀI KHOẢN/VÙNG KHÁC, vd backup-b2:tradejournal-backup
set -euo pipefail
[ -f /etc/tradejournal/backup.env ] && . /etc/tradejournal/backup.env
pg_url() { printf '%s' "${1/+psycopg/}"; }
log() { echo "[$(date -u +%FT%TZ)] $*"; }
