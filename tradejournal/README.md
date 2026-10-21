# TradeJournal — MVP

Ứng dụng web responsive quản lý **nhật ký giao dịch Live** và **nhật ký Backtest thủ công**, có thống kê hiệu suất được tính tại backend theo một bộ công thức duy nhất. Triển khai theo tài liệu SRS v1.1.

> Ứng dụng không tự động đặt lệnh, không quản lý tiền tại broker và không cam kết lợi nhuận.

## Cấu trúc

```
tradejournal/
├── backend/            FastAPI + SQLAlchemy 2 + Alembic (PostgreSQL)
│   ├── app/
│   │   ├── stats.py        ← bộ quy tắc thống kê DUY NHẤT (thuần, có bộ test chuẩn)
│   │   ├── trade_calc.py   ← net P/L, R-multiple, phân loại thắng/thua
│   │   ├── models.py       ← mô hình dữ liệu (UUID, created_at/updated_at, UTC)
│   │   ├── csv_io.py       ← nhập/xuất CSV, ZIP + manifest
│   │   ├── storage.py      ← lưu ảnh (local / S3-compatible), kiểm tra magic bytes
│   │   ├── routers/        ← REST API /api/v1/...
│   │   └── cli.py          ← export-user, verify-storage, gc-storage, purge-sessions
│   ├── migrations/         ← Alembic (upgrade/downgrade)
│   └── tests/              ← unit + integration (bộ dữ liệu chuẩn ở tests/fixtures)
├── frontend/           Next.js 16 + React 19 + TypeScript, Recharts, Lightweight Charts
│   ├── src/app/            ← các màn hình
│   ├── src/components/     ← form, bảng, biểu đồ, gallery ảnh…
│   └── e2e/smoke.cjs       ← kiểm thử end-to-end bằng Playwright
├── ops/backup/         ← sao lưu DB + ảnh (mã hóa age, rclone), khôi phục, diễn tập phục hồi
├── docs/               ← tài liệu kỹ thuật & vận hành
└── docker-compose.yml  ← chạy toàn bộ stack trên 1 máy (Postgres + API + Web, ảnh lưu trong volume)
```

## Chạy nhanh bằng Docker

```bash
cd tradejournal
docker compose up --build
# mở http://localhost:3000 → Đăng ký
```

## Chạy để phát triển

```bash
# Backend (cần PostgreSQL 14+)
cd tradejournal/backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env   # sửa TJ_DATABASE_URL; đặt TJ_COOKIE_SECURE=false và TJ_STORAGE_BACKEND=local khi chạy http://localhost
alembic upgrade head
uvicorn app.main:app --reload --port 8000     # tài liệu API: http://localhost:8000/api/v1/docs

# Frontend
cd tradejournal/frontend
npm ci
BACKEND_URL=http://localhost:8000 npm run dev  # http://localhost:3000
```

## Kiểm thử

| Loại | Lệnh | Nội dung |
|---|---|---|
| Unit — công thức | `cd backend && pytest tests/test_stats.py` | Bộ dữ liệu chuẩn (thắng/thua/hòa, open, cancelled, thiếu rủi ro, có phí, không có lệnh thua, chuỗi drawdown, Buy/Sell, nhiều múi giờ) với kết quả kỳ vọng tính tay trước |
| Integration — API | `cd backend && pytest` | Tách Live/Backtest, cách ly người dùng, idempotency, khóa lạc quan, phiên bản chiến lược, ảnh, CSV round-trip, ZIP, rate limit, CSRF, audit log |
| End-to-end | `BASE_URL=http://localhost:3000 node frontend/e2e/smoke.cjs` | Đăng ký → tài khoản → chiến lược → phiên backtest → ghi lệnh → đổi thiết bị (mobile) → lệnh Live → ảnh → biểu đồ giá → dashboard → CSV |
| Diễn tập phục hồi | `ops/backup/restore-drill.sh` | Khôi phục bản sao lưu mới nhất sang staging, kiểm tra hash từng ảnh |

Biến `TJ_TEST_DATABASE_URL` trỏ tới DB test (mặc định `postgresql+psycopg://tj:tj@localhost:5432/tradejournal_test`). CI: `.github/workflows/tradejournal.yml`.

## Tài liệu

- [Kiến trúc & lựa chọn công nghệ](docs/ARCHITECTURE.md)
- [Đặc tả công thức thống kê & bộ dữ liệu chuẩn](docs/STATS_SPEC.md)
- [Tài liệu API](docs/API.md) (+ [`openapi.json`](docs/openapi.json), Swagger UI tại `/api/v1/docs`)
- [Định dạng nhập/xuất CSV](docs/CSV_FORMAT.md)
- [Sao lưu & khôi phục](docs/BACKUP_RESTORE.md)
- [Bảo mật](docs/SECURITY.md)
- [Triển khai, dịch vụ cloud & chi phí](docs/DEPLOYMENT.md)
- [Giới hạn của MVP & vấn đề còn mở](docs/LIMITATIONS.md)
- Hướng dẫn sử dụng cho người dùng: trang **Hướng dẫn** trong ứng dụng (`/guide`)

## Đối chiếu yêu cầu SRS → triển khai → kiểm thử

| SRS | Yêu cầu | Triển khai | Kiểm thử |
|---|---|---|---|
| 3.1 | Dashboard đủ chỉ số, bộ lọc đồng bộ, không trộn Backtest vào Live | `routers/dashboard.py` (1 truy vấn → mọi chỉ số), `app/page.tsx` | `test_live_and_backtest_are_separated`, `test_filters_update_metrics`, e2e |
| 3.2 | Nhật ký Live: đủ trường, ảnh, bảng tìm/lọc/sắp xếp/phân trang, xóa có xác nhận | `routers/trades.py`, `TradeForm.tsx`, `trades/page.tsx` | `test_validation_rules`, `test_edit_does_not_create_new_record` |
| 3.3A–C | Phiên backtest, ghi lệnh, tiến độ, lưu ngay & tiếp tục trên thiết bị khác | `routers/sessions.py`, `backtest/[id]/page.tsx` | `test_backtest_progress_persists_across_logout`, e2e (mobile) |
| 3.3D | Phiên bản chiến lược bất biến, sao chép phiên bản | `routers/strategies.py` (`confirmed` khóa quy tắc) | `test_strategy_versions_immutable_and_isolated_stats` |
| 3.3E | Lọc theo setup/phiên/điều kiện/tuân thủ/R/thời gian; so sánh phiên bản kèm cỡ mẫu | `queries.py`, `/strategies/{id}/compare` | như trên |
| 3.4A | Ảnh PNG/JPG/WebP, giới hạn dung lượng, chú thích, thay/xóa, kiểm tra quyền | `routers/images.py`, `storage.py` | `test_multiple_images_and_safe_delete`, `test_upload_validation`, `test_cross_user_isolation` |
| 3.4B | Biểu đồ nến tương tác; không tạo nến giả | `routers/prices.py`, `PriceChart.tsx` | `test_price_series_no_fake_data`, e2e |
| 4.x | Công thức Win rate, PF, R, Expectancy, Equity, MDD (tiền & %), chi phí | `stats.py`, `trade_calc.py` | `tests/test_stats.py`, `test_golden_dataset_through_api` |
| 5.2 | Sao lưu độc lập, mã hóa, kiểm tra phục hồi | `ops/backup/*` | diễn tập phục hồi (docs/BACKUP_RESTORE.md) |
| 5.3 | Xuất CSV/ZIP + manifest; xuất được khi tài khoản ngưng | `/export/*`, `cli export-user` | `test_export_archive_contains_manifest`, `test_csv_export_roundtrip` |
| 6 | UUID, timestamps, UTC, trade_type, khóa ngoại, migration/rollback | `models.py`, `migrations/` | CI: upgrade → downgrade → upgrade → `alembic check` |
| 8 | HTTPS, Argon2id, phân quyền backend, rate limit, secrets qua env, không log dữ liệu nhạy cảm | `security.py`, `deps.py`, `main.py` | `test_password_is_hashed_with_argon2`, `test_csrf_header_required`, `test_login_rate_limited` |
| 9 | Chống trùng (idempotency, CSV) | `Idempotency-Key`, `import_hash` | `test_idempotent_create`, `test_csv_import_preview_commit_and_no_duplicates` |
