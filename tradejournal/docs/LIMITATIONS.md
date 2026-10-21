# Giới hạn của MVP & vấn đề còn mở

## Giới hạn đã biết

| # | Giới hạn | Ảnh hưởng | Hướng xử lý |
|---|---|---|---|
| 1 | Chưa tích hợp nhà cung cấp dữ liệu giá; biểu đồ nến chỉ có khi người dùng tự nhập CSV OHLC | Phải tự xuất dữ liệu từ MT5/nguồn khác | Chốt nguồn dữ liệu (mục dưới) |
| 2 | Equity Live = số dư ban đầu + lãi/lỗ đã đóng; **chưa ghi nạp/rút tiền** | Drawdown % lệch nếu tài khoản có nạp/rút | Thêm bảng `account_transactions` |
| 3 | Drawdown chỉ theo vốn tích lũy của lệnh đã đóng, không gồm biến động thả nổi | Đúng theo SRS 4.5 nhưng cần dữ liệu tick để làm phần còn lại | Sau khi có nguồn giá |
| 4 | Nhiều đơn vị tiền trong cùng bộ lọc: chỉ số tiền cộng gộp, có cảnh báo; chưa quy đổi tỷ giá | | Lọc theo tài khoản; hoặc thêm tỷ giá |
| 5 | Rate limit lưu trong bộ nhớ tiến trình | Không chia sẻ khi chạy nhiều instance | Redis hoặc rate limit tại proxy |
| 6 | Chưa có quên mật khẩu qua email, xác minh email, 2FA | Cần quản trị viên hỗ trợ khi quên mật khẩu | Cần chọn dịch vụ gửi email |
| 7 | Chưa có xóa tài khoản người dùng tự phục vụ | | Thêm luồng xóa + xuất dữ liệu trước khi xóa |
| 8 | Ảnh lưu nguyên bản, chưa tạo thumbnail | Trang có nhiều ảnh tải chậm hơn trên di động | Sinh thumbnail khi upload |
| 9 | ZIP xuất toàn bộ tạo trong bộ nhớ | Người dùng có rất nhiều ảnh (nhiều GB) | Job nền + link tải tạm thời |
| 10 | Chưa có chế độ offline; lưu thất bại do mất mạng sẽ báo lỗi và giữ dữ liệu trên form để thử lại (an toàn nhờ Idempotency-Key) | | PWA + hàng đợi offline |
| 11 | So sánh phiên bản chưa có kiểm định thống kê (khoảng tin cậy) — chỉ hiển thị cỡ mẫu và cảnh báo < 30 | | Bootstrap CI cho expectancy |
| 12 | Mục tiêu hiệu năng (< 2 giây) mới kiểm trên máy phát triển, chưa đo trên staging | | Đo ở Giai đoạn 3 |
| 13 | Workflow `build.yml` (ứng dụng Android có sẵn trong repo) vẫn chạy khi push lên `main` kể cả khi chỉ đổi thư mục `tradejournal/` | Tốn phút CI | Thêm `paths-ignore: [tradejournal/**]` nếu muốn |

## Nguồn dữ liệu giá

Cần chốt ở Giai đoạn 1 (SRS 3.4B, 11). Các phương án — **giá và điều khoản phải xác minh trực tiếp với nhà cung cấp trước khi cam kết**:

| Phương án | Phạm vi | Quyền sử dụng / lưu trữ | Chi phí | Ghi chú |
|---|---|---|---|---|
| Người dùng tự nhập (MVP hiện tại) | Bất kỳ | Người dùng chịu trách nhiệm | 0 | Đã triển khai, ghi rõ nguồn |
| Dữ liệu lịch sử từ broker qua MT5 (người dùng xuất) | Theo broker | Theo điều khoản broker | 0 | Giá khác nhau giữa các broker |
| API dữ liệu thương mại (vd Polygon/Massive, Twelve Data, OANDA, Dukascopy…) | FX, kim loại, tùy gói | Thường hạn chế lưu trữ/phân phối lại | Từ miễn phí giới hạn đến hàng chục–hàng trăm USD/tháng | Cần đánh giá độ trễ, lịch sử, giấy phép hiển thị cho nhiều người dùng |

Dù chọn phương án nào, giao diện luôn ghi nguồn và **không bao giờ** hiển thị dữ liệu tổng hợp/giả lập như giá thị trường thật.

## Quyết định cần hai bên xác nhận

- Chính sách lưu giữ bản sao lưu (đề xuất trong BACKUP_RESTORE.md).
- Nhà cung cấp cloud cụ thể và ngân sách cảnh báo.
- Quy ước làm tròn hiển thị (hiện: tiền 2 chữ số, R 2–4 chữ số; tính toán nội bộ dùng `Decimal`).
- Quy ước “hòa” = kết quả ròng đúng bằng 0 (chưa có ngưỡng dung sai).
- Lọc ngày của thống kê theo thời điểm **đóng** lệnh; danh sách giao dịch lọc theo thời điểm **vào** lệnh.
