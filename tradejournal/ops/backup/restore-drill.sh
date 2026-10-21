#!/usr/bin/env bash
# Kiểm tra phục hồi định kỳ (khuyến nghị hằng tháng): khôi phục bản mới nhất vào STAGING rồi so số bản ghi.
# Thoát mã khác 0 nếu thất bại → nối với hệ thống cảnh báo (cron + healthchecks.io / email).
. "$(dirname "$0")/common.sh"
: "${DATABASE_URL:?DATABASE_URL phải trỏ tới DB staging}"
start=$(date +%s)
"$(dirname "$0")/restore.sh" "$@"
psql "$(pg_url "$DATABASE_URL")" -At -c "select 'users='||count(*) from users union all select 'trades='||count(*) from trades union all select 'images='||count(*) from trade_images where deleted_at is null"
log "Restore drill OK trong $(( $(date +%s) - start ))s (so với RTO mục tiêu 8 giờ)"
