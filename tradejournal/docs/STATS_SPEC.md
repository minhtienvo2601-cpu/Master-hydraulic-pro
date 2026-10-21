# Đặc tả công thức thống kê

Nguồn sự thật: `backend/app/stats.py` và `backend/app/trade_calc.py`. Mọi màn hình gọi cùng hàm `compute_stats()`.

## 1. Trường dẫn xuất của một giao dịch (tính lại mỗi lần lưu)

| Trường | Công thức / quy tắc |
|---|---|
| Kết quả ròng (`net_pnl`) | `gross_pnl − commission − other_fees + swap`. `commission`, `other_fees` ≥ 0 (là chi phí); `swap` có dấu. Không có `gross_pnl` → `net_pnl` rỗng. Chi phí để trống = 0 (đã ghi nhận là không có), hệ thống không tự suy diễn phí. |
| R (`r_multiple`) | Chỉ khi `status = closed` và không phải nháp. Ưu tiên: (1) `net_pnl / risk_amount` khi có rủi ro > 0 → `r_source = computed`; (2) R nhập tay → `manual`; (3) **chỉ Backtest**: `(exit − entry)/|entry − SL|` (Sell đổi dấu) → `price`; còn lại → không có R (`none`). Làm tròn 4 chữ số. |
| Kết quả (`outcome`) | Theo dấu `net_pnl`; nếu không có thì theo dấu R. Bằng 0 → hòa. |

## 2. Tập giao dịch được thống kê

- Chỉ `status = closed` và `is_draft = false`.
- Loại trừ và **đếm riêng**: đang mở, đã hủy, nháp, và giao dịch đóng nhưng thiếu cả tiền lẫn R (`excluded.incomplete`, có cảnh báo).
- Live và Backtest không bao giờ cộng chung (`trade_type` bắt buộc, mặc định `live`).
- Bộ lọc ngày của thống kê áp vào **thời điểm đóng lệnh**, theo múi giờ người dùng.
- Thứ tự thời gian: `exit_time`, rồi `entry_time`, rồi `id` (ổn định, xác định).

## 3. Chỉ số

| Chỉ số | Định nghĩa |
|---|---|
| Win rate | `thắng / (thắng + thua + hòa) × 100`. Hòa trong mẫu số, không là thắng. Không có lệnh → N/A. |
| Net Profit | Tổng `net_pnl` của các lệnh có kết quả tiền (`money_sample`). |
| Gross Profit / Gross Loss | Tổng `net_pnl` dương / tổng `net_pnl` âm (Gross Loss là số âm). |
| Profit Factor | `Gross Profit / |Gross Loss|`. Gross Loss = 0 → **N/A** (không hiển thị số hữu hạn gây hiểu nhầm). |
| Average Win / Loss | Trung bình `net_pnl` của lệnh thắng / thua (theo tiền). Không có lệnh tương ứng → N/A. |
| Expectancy (R) | `Tổng R / số lệnh có R hợp lệ` (`r_sample`). |
| Expectancy (tiền) | `Net Profit / money_sample` — hiển thị tách biệt đơn vị. |
| Chuỗi thắng/thua dài nhất | Theo thứ tự thời gian; lệnh hòa cắt đứt cả hai chuỗi. |
| Equity Curve | Điểm đầu = vốn ban đầu; mỗi lệnh đã đóng cộng thêm (xem phương pháp). |
| Max Drawdown (tiền) | `max(đỉnh trước đó − equity hiện tại)`, đỉnh khởi đầu = vốn ban đầu. |
| Max Drawdown (%) | `max((đỉnh − hiện tại) / đỉnh × 100)`; tính độc lập với MDD tiền. Vốn ban đầu không có hoặc ≤ 0 → **N/A**. |
| Max Drawdown (R) | Như trên trên đường R tích lũy bắt đầu từ 0R — so sánh chiến lược không phụ thuộc vốn. |

**Vốn ban đầu**: Live = tổng số dư ban đầu của các tài khoản trong phạm vi lọc (thiếu một tài khoản → N/A). Backtest = cấu hình của phiên. Nhiều đơn vị tiền trong cùng bộ lọc → có cảnh báo.

**Phương pháp equity (Backtest)**:

| Mã | Ý nghĩa | Công thức mỗi lệnh |
|---|---|---|
| `cash` | Theo tiền | `E += net_pnl` |
| `r_fixed` | Rủi ro cố định % vốn **ban đầu** | `E += R × vốn_ban_đầu × rủi_ro%` |
| `r_compound` | Rủi ro % vốn **hiện tại** (lãi kép) | `E ×= 1 + R × rủi_ro%` |

Drawdown là **drawdown theo vốn tích lũy** (balance của lệnh đã đóng). Drawdown trên equity có tính biến động thả nổi của lệnh đang mở **không** được tính vì không có dữ liệu giá theo thời gian thực — giao diện ghi rõ điều này.

## 4. Bộ dữ liệu chuẩn (SRS 10.2)

Tệp: `backend/tests/fixtures/golden_live.json`. Vốn ban đầu 10.000. Kết quả kỳ vọng được tính tay **trước** khi viết code và được kiểm tra hai lần: trực tiếp trên `compute_stats()` (`test_golden_summary`) và đi qua toàn bộ API (`test_golden_dataset_through_api`).

| Mã | Trường hợp | Net | R | Thứ tự đóng (UTC) |
|---|---|---|---|---|
| T01 | Thắng, Buy, commission 5, swap −2 | 300−5−2 = **293** | 293/100 = **2.93** | 1 |
| T02 | Thua, Sell, commission 5 | −100−5 = **−105** | **−1.05** | 2 |
| T03 | Hòa | **0** | **0** | 3 |
| T04 | Thắng, Sell, **thiếu rủi ro** | **150** | **không có** | 4 |
| T05 | **Open** | — | — | loại |
| T06 | **Cancelled** | — | — | loại |
| T07 | Thua, phí khác 3 | −200−3 = **−203** | **−2.03** | 5 |
| T09 | Thắng, giờ **+07:00** (01:00Z ngày 8), swap +4 | **504** | 504/200 = **2.52** | 6 |
| T08 | Thua, giờ **−05:00** (03:00Z ngày 8 → sau T09) | **−100** | **−1** | 7 |
| T10 | Thua | **−50** | **−0.5** | 8 |
| T11–T13 | Thắng ×3 | **80, 70, 20** | **0.8, 0.7, 0.2** | 9–11 |

Kết quả kỳ vọng:

| Chỉ số | Giá trị | Cách tính |
|---|---|---|
| Đã đóng / thắng / thua / hòa | 11 / 6 / 4 / 1 | |
| Win rate | **54.55%** | 6/11 |
| Net Profit | **659** | |
| Gross Profit / Loss | **1117 / −458** | |
| Profit Factor | **2.44** | 1117/458 = 2.4389 |
| Avg Win / Loss | **186.17 / −114.50** | 1117/6, −458/4 |
| Expectancy tiền | **59.91** | 659/11 |
| Tổng R / mẫu R | **2.57 / 10** | T04 không có R |
| Expectancy R | **0.257** | |
| Chuỗi thắng / thua | **3 / 2** | W L BE W L W L L W W W |
| Max DD tiền | **203** | đỉnh 10338 (sau T04) → 10135 (sau T07) |
| Max DD % | **1.96%** | 203/10338 |
| Max DD R | **3.08** | đỉnh 2.93R → −0.15R |
| Equity cuối | **10659** | |

Các ca bổ sung trong `tests/test_stats.py`: không có lệnh thua (PF = N/A), không có dữ liệu, lệnh thiếu kết quả, nháp, không có vốn ban đầu (DD% = N/A), nhiều đơn vị tiền, equity `r_fixed` (10000 → 10300, MDD 200 = 1.96%) và `r_compound` (MDD 202.98 = 1.99%), ưu tiên nguồn R, R theo giá cho Buy/Sell, gom theo tháng theo múi giờ người dùng.
