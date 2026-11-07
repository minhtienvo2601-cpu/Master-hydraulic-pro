# Bảo Trì Thủy Lực

App Android quản lý công việc bảo trì thiết bị thủy lực và sơ đồ vật tư.

## Chức năng
- Công việc: ưu tiên 1/2/3, hạn hoàn thành, bảo trì định kỳ tự lặp, ảnh hiện trường
- Thông báo nhắc trước hạn (mặc định 2 ngày, 7:00 sáng) và sáng ngày đến hạn
- Tổng quan: quá hạn, 7 ngày tới, ưu tiên 1, hoàn thành trong tháng
- Hồ sơ thiết bị và lịch sử bảo trì
- Sơ đồ tư duy vật tư: nhánh con, file lưu offline (chọn được từ OneDrive), link OneDrive
- Tìm theo mã vật tư, kể cả nội dung trong file Excel
- Sao lưu / khôi phục toàn bộ dữ liệu ra 1 file .zip

## Build
Mỗi lần có thay đổi được đưa lên GitHub, mục **Actions** tự build.
File APK nằm ở mục **Releases** (bên phải trang repo).

## Công cụ bóc tách vật tư (web)
File `tools/boc-tach-vat-tu.html` — mở trực tiếp bằng trình duyệt (cần mạng lần đầu để tải thư viện đọc Excel/PDF).
- Quản lý tệp theo dự án (Excel, CSV, PDF, TXT; loại khác chỉ lưu trữ), dữ liệu lưu ngay trong trình duyệt
- Tự nhận diện dòng tiêu đề (Mã, Tên vật tư, Quy cách, ĐVT, Số lượng, Ghi chú) và bóc các dòng vật tư
- Chỉnh lại dòng tiêu đề / cột, sửa, thêm, bỏ dòng
- Bảng tổng hợp cộng dồn theo mã + ĐVT (hoặc tên + quy cách), xuất Excel 2 sheet "Tổng hợp" và "Chi tiết"
