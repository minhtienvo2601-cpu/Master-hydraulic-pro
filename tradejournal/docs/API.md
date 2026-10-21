# Tài liệu API

- Base path: `/api/v1`. Đặc tả đầy đủ: [`openapi.json`](openapi.json); Swagger UI khi chạy backend: `/api/v1/docs`.
- Định dạng JSON. Thời gian gửi lên **phải có múi giờ** (ISO 8601); trả về UTC. Số tiền/giá trả về dạng số.
- Lỗi: `{"detail": "..."}` hoặc danh sách lỗi kiểm tra (422) theo FastAPI.

## Quy ước bắt buộc

| Quy ước | Chi tiết |
|---|---|
| Xác thực | Cookie `tj_session` (httpOnly, Secure, SameSite=Lax) nhận sau `POST /auth/register` hoặc `/auth/login`. |
| Chống CSRF | Mọi yêu cầu POST/PUT/PATCH/DELETE phải có header `X-Requested-With: tradejournal`, thiếu → 403. |
| Cách ly dữ liệu | Truy cập bản ghi của người khác → **404** (không tiết lộ sự tồn tại). |
| Idempotency | `POST /trades` nhận header `Idempotency-Key`. Gửi lại cùng key → 200 kèm bản ghi đã tạo, không tạo mới. |
| Khóa lạc quan | `PUT /trades/{id}` phải gửi `row_version` hiện tại; lệch → 409 (đã sửa ở thiết bị khác). |
| Phân trang | `page`, `page_size` (≤ 100). Trả về `{items, total, page, page_size}`. |
| Giới hạn tốc độ | Đăng ký/đăng nhập/đổi mật khẩu: 10 lần/60 giây/IP; upload: 60 lần/60 giây/người dùng → 429. |

## Endpoint

| Nhóm | Phương thức & đường dẫn | Mô tả |
|---|---|---|
| Auth | `POST /auth/register` · `POST /auth/login` · `POST /auth/logout` | |
| | `GET /auth/me` · `PATCH /auth/me` · `POST /auth/password` | Hồ sơ, múi giờ, đổi mật khẩu (đăng xuất thiết bị khác) |
| Tài khoản | `GET/POST /accounts` · `PUT/DELETE /accounts/{id}` | Không xóa được tài khoản đã có giao dịch (dùng archive) |
| Chiến lược | `GET/POST /strategies` · `GET/PUT/DELETE /strategies/{id}` | Tạo chiến lược kèm V1 |
| | `POST /strategies/{id}/versions?from_version_id=` | Phiên bản mới (sao chép quy tắc nếu có nguồn) |
| | `PATCH /strategies/versions/{id}` · `POST /strategies/versions/{id}/confirm` | Đã xác nhận → sửa quy tắc trả 409 |
| | `GET /strategies/{id}/compare?trade_type=` | Thống kê từng phiên bản + cỡ mẫu |
| Backtest | `GET/POST /backtest-sessions` · `GET/PUT/DELETE /backtest-sessions/{id}` | Kèm `progress` |
| | `GET /backtest-sessions/{id}/stats` | Thống kê theo quy ước vốn của phiên, nhận bộ lọc |
| Giao dịch | `GET /trades` | Lọc: `trade_type, date_from, date_to, account_id, market, strategy_id, strategy_version_id, backtest_session_id, timeframe, direction, status, setup, trading_session, market_condition, plan_compliance, outcome, r_min, r_max, q (mã), tag`; sắp xếp `sort=entry_time|exit_time|net_pnl|r_multiple|code`, `order=asc|desc` |
| | `POST /trades` · `GET/PUT/DELETE /trades/{id}` | Xóa giao dịch xóa luôn ảnh của nó (object xóa sau khi DB commit) |
| | `GET /trades/meta/options` | Giá trị gợi ý cho form/bộ lọc |
| Ảnh | `POST/GET /trades/{id}/images` · `POST/GET /backtest-sessions/{id}/images` | multipart: `file`, `kind` (before/after/other), `caption` |
| | `GET /images/{id}/file` · `PATCH /images/{id}` · `PUT /images/{id}/file` · `DELETE /images/{id}` | Tải ảnh luôn qua API có kiểm tra quyền |
| Dashboard | `GET /dashboard?trade_type=live|backtest&period=day|week|month&…bộ lọc` | `stats`, `by_period`, `conventions`; Backtest có thể truyền `equity_method`, `initial_capital`, `risk_per_trade_pct` |
| Nhập | `POST /import/trades/preview` · `POST /import/jobs/{id}/commit` · `GET /import/jobs` | Xem [CSV_FORMAT.md](CSV_FORMAT.md) |
| Xuất | `GET /export/trades.csv` (nhận bộ lọc) · `/export/strategies.csv` · `/export/backtest-sessions.csv` · `/export/stats.json` · `/export/archive.zip` | |
| Giá | `GET /prices/series` · `POST /prices/series/import` · `GET /prices/series/{id}/bars` · `DELETE /prices/series/{id}` | Dữ liệu OHLC do người dùng nhập |
| Vận hành | `GET /health` | Kiểm tra kết nối DB |

## Ví dụ

```bash
H='-H X-Requested-With:tradejournal -H Content-Type:application/json'
curl -c jar -b jar $H -X POST localhost:8000/api/v1/auth/login -d '{"email":"a@b.vn","password":"..."}'
curl -c jar -b jar $H -H 'Idempotency-Key: 6f1c...' -X POST localhost:8000/api/v1/trades -d '{
  "trade_type":"live","account_id":"<uuid>","market":"XAUUSD","direction":"buy","status":"closed",
  "entry_time":"2024-02-01T09:00:00+07:00","exit_time":"2024-02-01T15:00:00+07:00",
  "entry_price":2000,"stop_loss":1990,"exit_price":2020,"gross_pnl":200,"commission":4,"risk_amount":100}'
# → net_pnl 196, r_multiple 1.96, outcome "win"
curl -b jar 'localhost:8000/api/v1/dashboard?trade_type=live&date_from=2024-01-01'
```
