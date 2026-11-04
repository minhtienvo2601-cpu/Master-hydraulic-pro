# Sổ Việc – ghi chú công việc

App Android ghi chú công việc nhanh, chạy offline hoàn toàn. Tách riêng với app Bảo Trì Thủy Lực.

## Chức năng
- **Ghi nhanh 1 chạm**: gõ vào ô trên cùng rồi Enter là lưu. Gõ `#thẻ` để gắn thẻ ngay.
- **Mẫu ghi chú** có sẵn: bàn giao ca, báo cáo sự cố, kiểm tra hằng ngày, bảo dưỡng, họp / giao việc, nhật ký.
  Biến `{ngày} {giờ} {người} {ca} {thứ}` tự điền. Tự tạo mẫu mới hoặc lưu một ghi chú làm mẫu.
- **Checklist**: dòng `☐` bấm để tick ở chế độ Xem, có thanh tiến độ. Xuống dòng tự thêm `☐`, `-`, số thứ tự, `[giờ]`.
- **Thẻ**: gắn bằng `#thẻ` trong nội dung hoặc nút “+ Thẻ”, có gợi ý khi gõ. Đổi tên / gộp / xóa thẻ trên mọi ghi chú.
- **Bộ lọc nâng cao**: theo thẻ (có đủ / có 1 trong), trạng thái, khoảng ngày, có ảnh, còn việc chưa xong, đã ghim.
  Lưu bộ lọc thành nút nhanh trên màn hình chính.
- **Tìm kiếm không cần dấu** (“ro dau” tìm ra “rò dầu”), tô sáng từ khóa.
- **Xem dạng danh sách hoặc dòng thời gian** theo ngày công việc.
- Trạng thái (Cần làm / Đang xử lý / Đã xong), ghim, ảnh hiện trường, gửi nội dung qua Zalo / tin nhắn.
- Thùng rác giữ 30 ngày; sao lưu / khôi phục ra 1 file `.json` (gồm cả ảnh).
- Giao diện sáng / tối.

## Thao tác nhanh
- Bấm giữ một ghi chú: ghim, đổi trạng thái, đánh dấu xong, gửi, nhân bản, xóa.
- Bấm giữ nút bộ lọc đã lưu: đổi tên, cập nhật, xóa.
- Nút Quay lại của Android: đóng bảng → quay lại → bỏ lọc → thoát.

## Build
Mỗi lần thay đổi trong thư mục `so-viec/` được đưa lên nhánh `main`, mục **Actions** (“Build APK Sổ Việc”) tự build.
File `SoViec.apk` nằm ở mục **Releases** (tag `soviec-v1.0.N`). Có thể bấm chạy tay bằng *Run workflow*.

Chạy thử trên máy tính:
```
cd so-viec
npm install
npm run build
npx serve www      # hoặc: python3 -m http.server -d www
```
