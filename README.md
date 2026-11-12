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
- Nhập cả **thư mục BOM** (mỗi thư mục con dạng `001 80056657-01#A HYDRAULIC EQUIPMENT`): dựng cây BOM theo Pos / Mã / Rev / Mô tả, đọc SL từ PDF `…ASSEMBLED ITEM REPORT` trong thư mục cha, nhân SL theo cụm, báo vị trí bị thiếu, mở bản vẽ ngay trong app
- Chỉnh lại dòng tiêu đề / cột, sửa, thêm, bỏ dòng
- Bảng tổng hợp cộng dồn theo mã + ĐVT (hoặc tên + quy cách), xuất Excel 2 sheet "Tổng hợp" và "Chi tiết"

## Phần mềm Bóc Tách Vật Tư cho Windows (.exe)
Bản cài trên máy tính của `tools/QuanLyBocVatTu.html` (thư mục `desktop/`, dùng Electron).
- Đọc thư mục hồ sơ bằng Windows: **không giới hạn 260 ký tự**, thấy cả thư mục rỗng, không cần quyền trình duyệt
- Chạy không cần Internet (thư viện đọc PDF / Excel / ZIP đóng gói sẵn)
- Tự mở lại hồ sơ lần trước; nhớ kết quả đọc BOM nên mở lại rất nhanh; đọc 4 file BOM song song
- Mở bản vẽ / BOM bằng phần mềm xem PDF của máy; khung xem bản vẽ song song có thu phóng
- Xuất Excel + bản vẽ lắp + BOM thẳng ra thư mục, bấm liên kết trong Excel mở PDF

Phiên bản 2.0 (cả bản web và bản Windows):
- **Tìm Pos trên bản vẽ**: bấm một dòng BOM (hoặc dùng phím ↑ ↓) thì số vị trí đó được khoanh trên bản vẽ song song; có ô tìm chữ trên bản vẽ
- Tiến độ chỉ tính cụm có BOM; thư mục chi tiết (bulông, long đen…) hiển thị mờ, có nút ẩn/hiện và có trang riêng (dòng BOM + bản vẽ chi tiết)
- Bấm tiêu đề cột để sắp xếp; phím tắt (Space chọn, Enter đã xem, 1/2/3 tô màu, → ← vào/ra cụm, `?` xem danh sách)
- Bảng lớn vẽ từng đợt nên vẫn mượt với hàng nghìn dòng
- Excel xuất ra có định dạng: tiêu đề đậm, cố định dòng đầu, bộ lọc, liên kết xanh, dòng đã chọn tô nền
- Màn hình chào, hồ sơ gần đây, thanh trạng thái

Mỗi lần thay đổi `desktop/` hoặc `tools/QuanLyBocVatTu.html`, mục **Actions** tự build trên Windows và đưa 2 file lên **Releases**:
`BocTachVatTu-CaiDat-*.exe` (bản cài đặt) và `BocTachVatTu-ChayLuon-*.exe` (chạy luôn, không cần cài).

Chạy thử khi phát triển: `cd desktop && npm install && npm start`. Kiểm tra bộ quét thư mục: `npm test`.

## Gộp PDF
File `tools/GopPDF.html` — mở bằng Edge/Chrome (cần mạng lần đầu để tải thư viện). File không được gửi đi đâu.
- Thêm nhiều file PDF, JPG, PNG (kéo thả hoặc chọn); kéo thả để đổi thứ tự file và thứ tự trang
- Ảnh thu nhỏ từng trang; xoay, bỏ / lấy lại từng trang; xem lớn
- Lấy khoảng trang theo từng file (vd. `1-3, 7, 10-`); xoay / đảo thứ tự cả file
- Tùy chọn đánh số trang `1 / N`, đặt ảnh vừa khổ A4
- **Vẽ & ghi chú** trên từng trang (nút bút chì hoặc nhấp đúp vào trang): bút vẽ, tô sáng, thêm chữ tiếng Việt (đậm, nền trắng), khung, mũi tên, tẩy, chọn để di chuyển / sửa; bảng màu, cỡ nét / cỡ chữ, hoàn tác Ctrl+Z; nét vẽ được in vào file khi gộp (đúng cả với trang đã xoay)
