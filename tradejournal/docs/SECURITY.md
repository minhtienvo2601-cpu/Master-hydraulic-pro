# Cấu hình bảo mật

| Yêu cầu SRS 8 | Triển khai |
|---|---|
| HTTPS | Reverse proxy kết thúc TLS (Caddy tự cấp chứng chỉ, hoặc LB của cloud). Cookie `Secure` (`TJ_COOKIE_SECURE=true`), HSTS khi `TJ_ENV=production`. |
| Băm mật khẩu | Argon2id (`argon2-cffi`, tham số mặc định khuyến nghị), tự băm lại khi tham số thay đổi. Mật khẩu ≥ 10 ký tự. Đăng nhập sai không tiết lộ email có tồn tại (thông báo chung + băm giả để cân bằng thời gian). |
| Phiên đăng nhập | Token ngẫu nhiên 256-bit trong cookie `httpOnly; SameSite=Lax`; DB chỉ lưu SHA-256. Hết hạn sau 14 ngày (cấu hình được). Đăng xuất xóa phiên; đổi mật khẩu đăng xuất mọi thiết bị khác. |
| CSRF | Yêu cầu thay đổi dữ liệu bắt buộc header `X-Requested-With: tradejournal`; CORS mặc định tắt (cùng origin). |
| Kiểm soát quyền tại backend | Mọi truy vấn ràng buộc `user_id` (`queries.apply_filter`, `deps.owned`); khóa ngoại tham chiếu (tài khoản, phiên, phiên bản) được kiểm tra thuộc cùng người dùng. Truy cập chéo trả 404. Kiểm thử: `test_cross_user_isolation`. |
| Kiểm tra tệp upload | Xác định loại bằng **magic bytes** (PNG/JPEG/WebP), không tin phần mở rộng/Content-Type; giới hạn dung lượng (`TJ_MAX_UPLOAD_MB`, mặc định 10); hạn mức số ảnh/người dùng; tên object do server sinh (UUID); trả ảnh với `X-Content-Type-Options: nosniff`. Bucket **không public**. |
| Chống lạm dụng | Rate limit đăng ký/đăng nhập/đổi mật khẩu theo IP, upload theo người dùng; giới hạn kích thước CSV, số dòng, page_size. Bộ đếm trong bộ nhớ đủ cho 1 instance; khi chạy nhiều instance cần chuyển sang Redis hoặc rate limit ở reverse proxy/WAF. |
| CSV injection | Ô bắt đầu bằng `= + - @` được thêm `'` khi xuất. |
| Secrets | Chỉ qua biến môi trường (`TJ_*`) hoặc secret manager của nền tảng; `.env` bị `.gitignore`; `.env.example` không chứa giá trị thật. |
| Log | Handler lỗi chỉ log phương thức + đường dẫn + stack trace; không log body, cookie, mật khẩu. `audit_logs.meta` chỉ chứa ID và tên trường đã đổi, không chứa giá trị. |
| Header bảo mật | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Cache-Control: no-store` cho API. |
| Theo dõi lỗi & cảnh báo | `GET /api/v1/health` cho uptime monitor; khuyến nghị gắn Sentry (hoặc tương đương) qua `sentry-sdk` với `send_default_pii=False`; cảnh báo khi backup/restore-drill thất bại (mã thoát ≠ 0). |
| Phục hồi sự cố | [BACKUP_RESTORE.md](BACKUP_RESTORE.md). |
| Phụ thuộc | CI chạy `npm audit --audit-level=high`. |

## Dữ liệu gửi tới bên thứ ba

MVP **không** dùng dịch vụ xác thực bên thứ ba. Bên thứ ba duy nhất là nhà cung cấp hạ tầng đã chọn:

| Nhà cung cấp | Dữ liệu |
|---|---|
| Hosting ứng dụng | Toàn bộ lưu lượng (đã giải mã TLS tại proxy) |
| Postgres được quản lý | Toàn bộ dữ liệu DB (email, hash mật khẩu, giao dịch, ghi chú) |
| Object storage | Ảnh biểu đồ |
| Kho sao lưu | Bản dump DB **đã mã hóa age** (nhà cung cấp không đọc được) và ảnh |
| Sentry (nếu bật) | Stack trace, đường dẫn URL; không gửi PII |

## Danh sách kiểm tra trước khi lên production

- [ ] `TJ_ENV=production`, `TJ_COOKIE_SECURE=true`, HTTPS bắt buộc (redirect HTTP → HTTPS).
- [ ] DB user của ứng dụng không phải superuser; user sao lưu chỉ đọc.
- [ ] Bucket ảnh chặn truy cập public; khóa S3 chỉ có quyền trên đúng bucket.
- [ ] Khóa bí mật `age` không nằm trên bất kỳ máy production nào.
- [ ] Thử truy cập chéo bằng 2 tài khoản trên staging.
- [ ] Bật cảnh báo cho health check và job sao lưu.
