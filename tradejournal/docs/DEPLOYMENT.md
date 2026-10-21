# Triển khai, dịch vụ cloud & chi phí

## Môi trường

| Môi trường | Mục đích | Ghi chú |
|---|---|---|
| Local | Phát triển | `docker compose up` hoặc chạy backend/frontend trực tiếp |
| Staging | Nghiệm thu, đo hiệu năng, diễn tập phục hồi | Cấu hình giống production, DB/bucket riêng |
| Production | Người dùng thật | |

## Phương án A — 1 VPS + dịch vụ được quản lý (gợi ý cho MVP)

1. VPS 2 vCPU / 4 GB RAM chạy `docker compose` gồm `backend` + `web` + Caddy (HTTPS tự động).
2. Postgres được quản lý (Neon / Supabase / DigitalOcean Managed / RDS) — có snapshot + PITR.
3. Ảnh trên Cloudflare R2 hoặc Backblaze B2 (S3-compatible, rẻ, không phí egress hoặc thấp).
4. Bản sao lưu ở **tài khoản khác** (vd tài khoản B2 riêng) với Object Lock.
5. Uptime monitor gọi `/api/v1/health`; Sentry cho lỗi.

Caddyfile mẫu:

```
journal.example.com {
  encode gzip
  reverse_proxy web:3000
}
```

Biến môi trường backend: xem `backend/.env.example`. Frontend chỉ cần `BACKEND_URL` lúc build.

Quy trình phát hành: CI xanh → build image → `alembic upgrade head` (tự chạy khi backend khởi động) → khởi động lại. Rollback: triển khai lại image trước; nếu migration mới có thay đổi phá vỡ, `alembic downgrade -1` **sau khi** đã có bản sao lưu mới.

## Dịch vụ cloud & phí định kỳ (ước tính, cần xác minh lại giá tại thời điểm ký hợp đồng)

| Hạng mục | Lựa chọn ví dụ | Ước tính/tháng (USD) |
|---|---|---|
| VPS ứng dụng (staging + production) | Hetzner / DigitalOcean / Vultr, 2 vCPU 4 GB × 2 | 10 – 50 |
| Postgres được quản lý (production) | Neon / Supabase / DO Managed | 0 – 30 |
| Object storage ảnh | Cloudflare R2 / Backblaze B2 (vài chục GB) | 0 – 5 |
| Kho sao lưu độc lập | Backblaze B2 tài khoản riêng | 1 – 5 |
| Tên miền | | ~1 |
| Theo dõi lỗi / uptime | Sentry Developer, UptimeRobot | 0 |
| **Tổng** | | **~15 – 90** |

Chi phí tăng chủ yếu theo dung lượng ảnh: 10.000 ảnh × ~0,5 MB ≈ 5 GB. Kiểm soát bằng `TJ_MAX_UPLOAD_MB`, `TJ_MAX_IMAGES_PER_USER`, lifecycle của bucket sao lưu, và cảnh báo ngân sách (budget alert) của từng nhà cung cấp.

## Hiệu năng

- Dashboard chỉ đọc các cột cần cho thống kê (`queries.load_stat_trades`) và tính trong 1 lần; có index `(user_id, trade_type, exit_time)`.
- Danh sách luôn phân trang (≤ 100 dòng); trình duyệt không tải toàn bộ lịch sử.
- Mục tiêu < 2 giây phải đo trên staging với bộ dữ liệu chuẩn đã thống nhất (gợi ý: 1 người dùng × 10.000 giao dịch). Khi vượt ~100.000 giao dịch/người dùng, chuyển tổng hợp sang SQL (window function) — giao diện `compute_stats` giữ nguyên.
