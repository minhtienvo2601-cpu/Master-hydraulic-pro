# Kiến trúc

```
Trình duyệt (máy tính / điện thoại)
        │ HTTPS (reverse proxy: Caddy / Nginx / Cloud LB)
        ▼
Next.js (frontend, cùng origin)  ── rewrite /api/* ──►  FastAPI (backend)
                                                         │        │
                                                PostgreSQL     Object storage (S3-compatible)
                                                         │        │
                                                         └── Backup độc lập (tài khoản/vùng khác, mã hóa age)
```

- **Frontend** chỉ hiển thị và gửi dữ liệu. Mọi quyền truy cập, kiểm tra dữ liệu và phép tính chính thức nằm ở backend.
- Frontend và API **cùng origin** (Next.js rewrite `/api/*`), nên cookie phiên `httpOnly; Secure; SameSite=Lax` hoạt động mà không cần mở CORS.
- **Dữ liệu tách biệt**: giao dịch (bảng `trades`), ảnh (object storage + metadata `trade_images`), dữ liệu giá lịch sử (`price_series`, `price_bars`).

## Lựa chọn công nghệ

| Thành phần | Chọn | Lý do / khác biệt so với đề xuất SRS |
|---|---|---|
| Frontend | Next.js 16 + React 19 + TypeScript | Đúng đề xuất. Dùng bản 16.x vì 15.x có cảnh báo bảo mật nghiêm trọng (npm audit) tại thời điểm xây dựng. CSS thuần (không UI kit) để giảm phụ thuộc. |
| Backend | Python FastAPI, SQLAlchemy 2, Alembic | Đúng đề xuất. OpenAPI tự sinh làm tài liệu API. |
| Database | PostgreSQL 16 | Đúng đề xuất. Kiểu `NUMERIC` cho giá/tiền (không dùng float) để phép tính chính xác. |
| Biểu đồ thống kê | Recharts | Đúng đề xuất. |
| Biểu đồ giá | TradingView Lightweight Charts v5 (Apache-2.0) | Đúng đề xuất. Giữ logo TradingView theo điều khoản giấy phép. |
| Lưu ảnh | S3-compatible qua boto3 (AWS S3, Cloudflare R2, Backblaze B2, MinIO) | Không khóa nhà cung cấp; dev dùng thư mục local. |
| Xác thực | Phiên phía máy chủ (token ngẫu nhiên 256-bit trong cookie httpOnly; DB chỉ lưu SHA-256) + Argon2id | Đơn giản và an toàn hơn JWT cho web cùng origin: thu hồi được ngay (đăng xuất, đổi mật khẩu đăng xuất thiết bị khác). Không gửi dữ liệu tới bên thứ ba. |
| Sao lưu | `pg_dump` + `age` (mã hóa khóa công khai) + `rclone` | Chạy với mọi nhà cung cấp; máy production không giải mã được bản sao lưu. |

Chi phí vận hành và nhà cung cấp gợi ý: xem [DEPLOYMENT.md](DEPLOYMENT.md).

## Mô hình dữ liệu

| Bảng | Vai trò | Ghi chú |
|---|---|---|
| `users` | Người dùng | email duy nhất, `password_hash` Argon2id, `timezone` (IANA) để hiển thị |
| `user_sessions` | Phiên đăng nhập | chỉ lưu hash token, có hạn |
| `accounts` | Tài khoản giao dịch | đơn vị tiền, số dư ban đầu (để tính drawdown %) |
| `strategies` | Nhóm chiến lược | |
| `strategy_versions` | Phiên bản | `status` draft/confirmed; confirmed → khóa quy tắc; `parent_version_id` khi sao chép |
| `backtest_sessions` | Phiên kiểm thử | khoảng dữ liệu, múi giờ dữ liệu, mục tiêu, quy ước vốn/equity |
| `trades` | Giao dịch Live + Backtest | `trade_type` + CHECK: backtest phải có phiên, live không được có phiên; `row_version` (khóa lạc quan); `idempotency_key`, `import_hash` duy nhất theo người dùng |
| `trade_images` | Metadata ảnh | gắn với giao dịch HOẶC phiên; `sha256`; xóa 2 pha (`deleted_at` → `storage_purged_at`) |
| `tags`, `trade_tags` | Nhãn | |
| `import_jobs` | Lịch sử nhập CSV | preview → commit, lỗi theo dòng |
| `audit_logs` | Thao tác quan trọng | đăng nhập, tạo/sửa/xóa, xác nhận phiên bản, nhập/xuất |
| `price_series`, `price_bars` | Dữ liệu OHLC do người dùng nhập | ghi rõ nguồn |

Quy tắc chung: UUID cho mọi khóa chính; `created_at`/`updated_at` (timestamptz, UTC); khóa ngoại `RESTRICT` cho dữ liệu lịch sử (không thể xóa chiến lược/phiên đang có giao dịch); index theo `(user_id, trade_type, exit_time/entry_time)`; mọi danh sách có phân trang (tối đa 100 dòng/trang).

Migration: `alembic upgrade head` / `alembic downgrade -1`. CI kiểm tra upgrade → downgrade → upgrade và `alembic check` (model khớp migration).

## Nguyên tắc thiết kế (SRS 2.3) và cách đáp ứng

| Nguyên tắc | Cách làm |
|---|---|
| Backend xác thực & tính toán chính thức | `trade_calc.derive()` chạy mỗi lần lưu; client gửi `net_pnl`/`r_multiple` bị bỏ qua. Form chỉ hiển thị “ước tính”. |
| Frontend không quyết định quyền | Mọi truy vấn lọc `user_id` trước tiên (`queries.apply_filter`, `deps.owned`); dữ liệu người khác trả 404. |
| ID duy nhất | UUID + mã giao dịch duy nhất theo người dùng. |
| Lỗi mạng không tạo bản ghi trùng | Header `Idempotency-Key` cho tạo mới; `row_version` cho cập nhật; CSV có `import_hash`. |
| Một bộ quy tắc thống kê | `stats.compute_stats()` được Dashboard, phiên backtest, so sánh phiên bản và báo cáo xuất dùng chung. |
| Sẵn sàng backtest tự động | Giao dịch backtest là bản ghi `trades` thông thường gắn `backtest_session_id`; một engine tự động sau này chỉ cần ghi vào cùng bảng (và `price_bars` đã tách riêng). |

## Dữ liệu giá cho biểu đồ (SRS 3.4B)

Thư viện biểu đồ không đi kèm dữ liệu giá. MVP **không tích hợp nhà cung cấp** mà cho người dùng nhập CSV OHLC từ nguồn họ có quyền sử dụng (ví dụ xuất lịch sử từ MT5 của chính họ), luôn ghi rõ nguồn. Không bao giờ sinh dữ liệu nến giả. Các phương án nhà cung cấp cần chốt ở giai đoạn 1 được liệt kê trong [LIMITATIONS.md](LIMITATIONS.md#nguon-du-lieu-gia).
