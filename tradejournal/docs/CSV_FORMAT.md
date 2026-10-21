# Định dạng nhập / xuất CSV

- Mã hóa **UTF-8** (có hoặc không BOM). Phân cách `,` `;` hoặc tab (tự nhận diện). Dòng đầu là tiêu đề, không phân biệt hoa thường.
- Nhập gồm 2 bước: **kiểm tra** (`POST /api/v1/import/trades/preview`) → báo lỗi từng dòng, đánh dấu trùng, chưa ghi gì; **nhập** (`POST /api/v1/import/jobs/{id}/commit`) → ghi mọi dòng hợp lệ trong một transaction. Gọi commit nhiều lần không nhập lặp.
- Giới hạn mặc định: 5 MB, 20.000 dòng mỗi lần (`TJ_MAX_CSV_MB`, `TJ_MAX_CSV_ROWS`).
- Tệp xuất từ TradeJournal (`/export/trades.csv`) dùng đúng định dạng này và **nhập lại được nguyên vẹn** (kiểm thử `test_csv_export_roundtrip`).

## Cột

| Cột | Bắt buộc | Ghi chú |
|---|---|---|
| `market` | ✔ | Viết hoa tự động |
| `direction` | ✔ | `buy`/`sell` (chấp nhận `long`/`short`, `mua`/`bán`) |
| `entry_time` | ✔ | ISO 8601: `2024-03-01 14:30`, `2024-03-01T14:30:00+07:00`, `2024.03.01 14:30` (MT). Không có múi giờ → dùng múi giờ chọn khi nhập (mặc định múi giờ người dùng) |
| `entry_price` | ✔ | Số; dấu thập phân `.` (hoặc `,` nếu không có `.`) |
| `trade_type` | | `live`/`backtest`; nếu thiếu dùng tùy chọn khi nhập |
| `code` | | Mã giao dịch; trống → tự sinh. Trùng mã đã có → bỏ qua |
| `status` | | `open`/`closed`/`cancelled`, mặc định `closed` |
| `exit_time`, `exit_price` | | Bắt buộc với lệnh Live đã đóng |
| `stop_loss`, `take_profit`, `volume` | | |
| `risk_amount` | | Số tiền rủi ro ban đầu (> 0); cần để tính R theo tiền |
| `gross_pnl` | | Kết quả trước chi phí; bắt buộc với lệnh Live đã đóng |
| `commission`, `other_fees` | | Chi phí, **số không âm** (số âm → lỗi dòng) |
| `swap` | | Có dấu: dương = được cộng |
| `r_manual` | | R nhập tay |
| `account` | | **Tên** tài khoản đã có (Live). Thiếu → dùng tài khoản chọn khi nhập |
| `backtest_session` | | **Tên** phiên backtest đã có (Backtest). Thiếu → dùng phiên chọn khi nhập |
| `strategy`, `strategy_version` | | Tên chiến lược + số phiên bản (`2` hoặc `V2`) hoặc tên phiên bản |
| `timeframe`, `trading_session`, `setup`, `trend`, `key_levels`, `confirmation`, `market_condition`, `entry_reason`, `exit_reason`, `mistakes`, `emotion`, `lessons`, `notes`, `chart_link` | | Văn bản |
| `plan_compliance` | | `followed` / `partial` / `violated` |
| `tags` | | Phân cách bằng `;` |
| `is_draft` | | `true`/`false` |
| `net_pnl`, `r_multiple`, `r_source`, `outcome`, `id` | | **Chỉ xuất** — khi nhập bị bỏ qua, backend tự tính lại |

Hệ thống **không tự tạo** tài khoản/phiên/chiến lược từ CSV (tránh dữ liệu rác do gõ sai tên): tên không tồn tại → lỗi dòng.

## Chống trùng

Khóa trùng (`import_hash`) = SHA-256 của: loại giao dịch, tài khoản, phiên backtest, thị trường, hướng, thời gian vào (UTC), giá vào, khối lượng, thời gian thoát, giá thoát. Trùng với dữ liệu đã có **hoặc** trùng trong cùng tệp → dòng được đánh dấu “trùng” và bỏ qua. Mã giao dịch (`code`) trùng cũng bị bỏ qua.

## An toàn khi mở bằng Excel

Ô văn bản bắt đầu bằng `= + - @` được thêm dấu `'` khi xuất (chống CSV/formula injection); khi nhập lại, dấu này được bỏ đi.

## Tệp ZIP xuất toàn bộ

`GET /api/v1/export/archive.zip` (hoặc `python -m app.cli export-user --email ... --out x.zip` cho quản trị viên khi tài khoản không còn đăng nhập được):

```
trades.csv  strategies.csv  backtest_sessions.csv  accounts.csv
stats_report.json          ← thống kê Live và Backtest
images/<image_id>.<ext>
manifest.json              ← {image_id, file, trade_id, trade_code, backtest_session_id, kind, caption, sha256, ...}
```

## Dữ liệu giá OHLC

`POST /api/v1/prices/series/import` (form: `symbol`, `timeframe`, `source` bắt buộc, `timezone`). Cột: `time, open, high, low, close[, volume]` (chấp nhận tiêu đề dạng `<OPEN>` của MT5). Kiểm tra `high ≥ max(open, close)`, `low ≤ min(open, close)`; có lỗi → không nhập dòng nào. Nến trùng thời điểm được ghi đè.
