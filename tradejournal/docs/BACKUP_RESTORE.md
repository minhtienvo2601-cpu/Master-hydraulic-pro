# Sao lưu & khôi phục

## Nguyên tắc

- Bản sao lưu nằm ở **tài khoản cloud / vùng lưu trữ khác** production (`BACKUP_REMOTE`), với khóa truy cập chỉ có quyền **ghi thêm**, không xóa (dùng Object Lock / bucket versioning + lifecycle).
- DB được **mã hóa bằng `age` khóa công khai** trước khi rời máy chạy sao lưu. Khóa bí mật (`AGE_IDENTITY`) giữ ngoại tuyến (trình quản lý mật khẩu + bản in trong két), không đặt trên production → người chiếm production không đọc được bản sao lưu.
- Ảnh được sao chép bằng `rclone copy` (không `sync`): xóa ở production **không** lan sang bản sao lưu. Bucket sao lưu bật mã hóa phía máy chủ; nếu cần mã hóa phía client, cấu hình remote kiểu `crypt` của rclone.
- Metadata và liên kết ảnh ↔ giao dịch nằm trong DB (`trade_images.storage_key`, `sha256`), nên khôi phục DB + ảnh là đủ để liên kết đúng. Sau khôi phục, `verify-storage --check-hash` kiểm tra **từng** ảnh tồn tại và đúng nội dung.
- Cấu hình cần để phục hồi: `backend/.env.example` (danh sách biến), `docker-compose.yml`, tài liệu này. Giá trị secrets lưu trong trình quản lý bí mật, có bản sao ngoại tuyến.

## Lịch đề xuất (`ops/backup/crontab.example`)

| Việc | Tần suất | Script |
|---|---|---|
| Dump DB mã hóa | Hằng ngày 02:15 UTC | `backup-db.sh` |
| Sao chép ảnh mới/thay đổi | 6 giờ/lần | `backup-files.sh` |
| Diễn tập phục hồi sang staging | Hằng tháng | `restore-drill.sh` |

Nếu dùng Postgres được quản lý (Neon, Supabase, RDS, Cloud SQL…), **vẫn** chạy `backup-db.sh`: snapshot/PITR của nhà cung cấp nằm cùng tài khoản nên không phải bản sao lưu độc lập.

## Thời hạn lưu giữ (cần hai bên thống nhất)

Đề xuất: bản hằng ngày giữ 14 ngày, bản ngày 1 hằng tháng giữ 12 tháng (lifecycle rule trên bucket sao lưu). Ảnh: giữ phiên bản cũ 30 ngày.

## Mục tiêu khôi phục (mục tiêu thiết kế, chưa phải SLA)

- **RPO ≤ 24 giờ** cho DB (dump hằng ngày); ảnh ≤ 6 giờ. Muốn thấp hơn: bật PITR của Postgres được quản lý.
- **RTO ≤ 8 giờ**. Diễn tập trên dữ liệu thử nghiệm: khôi phục DB + ảnh + kiểm tra hash hoàn tất trong vài giây; thời gian thực tế phụ thuộc dung lượng và phải đo lại trên staging với dữ liệu thật.

## Cấu hình

```bash
# Một lần: tạo cặp khóa age trên máy an toàn (KHÔNG phải production)
age-keygen -o tj-backup.key          # in ra khóa công khai age1...
# /etc/tradejournal/backup.env trên máy chạy sao lưu:
DATABASE_URL=postgresql://backup_ro:...@db-host:5432/tradejournal   # user chỉ đọc
AGE_RECIPIENT=age1...                                               # chỉ khóa CÔNG KHAI
SRC_IMAGES=prod-s3:tradejournal-images                              # rclone remote, quyền đọc
BACKUP_REMOTE=backup-b2:tradejournal-backup                         # rclone remote ở tài khoản khác, quyền ghi
```

## Khôi phục

```bash
export DATABASE_URL=postgresql://tj:...@new-db:5432/tradejournal   # DB đích (rỗng hoặc được phép ghi đè)
export AGE_IDENTITY=/secure/tj-backup.key
export BACKUP_REMOTE=backup-b2:tradejournal-backup
export DEST_IMAGES=new-s3:tradejournal-images
export APP_DIR=/opt/tradejournal/backend
# cùng các biến TJ_STORAGE_* của môi trường đích để bước kiểm tra đọc đúng bucket
ops/backup/restore.sh                       # bản mới nhất, hoặc truyền tên tệp cụ thể
```

Các bước script thực hiện: tải bản dump + kiểm tra SHA-256 → giải mã → `pg_restore --clean` → sao chép ảnh → `alembic upgrade head` → `python -m app.cli verify-storage --check-hash` (thoát mã ≠ 0 nếu thiếu/sai ảnh).

### Kết quả diễn tập (môi trường phát triển, dữ liệu e2e)

```
pg_dump → db-20261021T011108Z.dump.age (55 KB, mã hóa age), tải lên vùng sao lưu
rclone copy ảnh → backup/images
restore-drill.sh → tradejournal_restore:
  Tổng 2 ảnh, thiếu 0, sai hash 0
  users=7 trades=11 images=2   (khớp DB nguồn: trades=11, images=2)
  Restore drill OK trong 1s
```

## Sự cố thường gặp

| Tình huống | Xử lý |
|---|---|
| Mất DB production | Tạo DB mới → `restore.sh` → trỏ `TJ_DATABASE_URL` sang DB mới → khởi động lại backend. |
| Mất/hỏng bucket ảnh | `rclone copy $BACKUP_REMOTE/images <bucket mới>` → đổi `TJ_S3_*` → `cli verify-storage --check-hash`. |
| Ảnh đã đánh dấu xóa nhưng object còn | `python -m app.cli gc-storage` (an toàn: chỉ xóa object của bản ghi đã `deleted_at`). |
| Người dùng ngưng tài khoản cần dữ liệu | `python -m app.cli export-user --email ... --out user.zip` (chạy trên DB production hoặc DB đã khôi phục). |
