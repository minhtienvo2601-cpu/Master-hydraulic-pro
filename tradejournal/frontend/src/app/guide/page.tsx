import Link from "next/link";

export default function GuidePage() {
  return (
    <article className="guide">
      <h1>Hướng dẫn sử dụng</h1>
      <p className="muted">TradeJournal giúp bạn ghi nhật ký giao dịch thực tế và backtest thủ công, rồi đánh giá chiến lược bằng số liệu nhất quán. Ứng dụng không đặt lệnh, không quản lý tiền tại broker và không cam kết lợi nhuận.</p>

      <h2>1. Bắt đầu nhanh</h2>
      <ol>
        <li>Vào <Link href="/accounts">Tài khoản</Link> tạo tài khoản giao dịch (nhập số dư ban đầu để có drawdown %).</li>
        <li>Vào <Link href="/strategies">Chiến lược</Link> tạo chiến lược — hệ thống tạo sẵn phiên bản V1 (nháp). Ghi quy tắc rồi bấm <b>Xác nhận</b>.</li>
        <li>Ghi giao dịch Live tại <Link href="/trades/new">Live → Giao dịch mới</Link>, hoặc tạo <Link href="/backtest/new">phiên backtest</Link>.</li>
        <li>Xem kết quả tại <Link href="/">Dashboard</Link>. Live và Backtest luôn tách biệt.</li>
      </ol>

      <h2>2. Ghi giao dịch Live</h2>
      <ul>
        <li>Trường có dấu * là bắt buộc. Lệnh đã đóng (Closed) cần thời gian thoát, giá thoát và <b>kết quả trước chi phí</b>.</li>
        <li><b>Commission</b> và <b>phí khác</b> nhập số dương (là chi phí). <b>Swap</b> có dấu: dương là được cộng, âm là bị trừ.</li>
        <li>Kết quả ròng = Kết quả trước chi phí − Commission − Phí khác + Swap.</li>
        <li>Nhập <b>Rủi ro dự kiến</b> (số tiền mất nếu chạm SL ban đầu) để có R. Không có rủi ro → hệ thống không tự tạo R.</li>
        <li>Thời gian nhập theo múi giờ trong <Link href="/settings">Cài đặt</Link>; máy chủ lưu UTC.</li>
        <li>Ghi chưa xong? Tích <b>Lưu nháp</b> — nháp không tính vào thống kê.</li>
        <li>Sửa giao dịch không tạo bản ghi mới. Nếu bạn vừa sửa trên thiết bị khác, hệ thống sẽ yêu cầu tải lại thay vì ghi đè.</li>
      </ul>

      <h2>3. Backtest</h2>
      <ul>
        <li>Mỗi phiên gắn với một <b>phiên bản chiến lược</b>, có thị trường, khung, khoảng dữ liệu, múi giờ dữ liệu và mục tiêu số lệnh.</li>
        <li>Thời gian giao dịch backtest nhập theo <b>múi giờ dữ liệu</b> của phiên.</li>
        <li>Chỉ cần Entry, SL và giá thoát giả định: R tính theo giá = (Exit − Entry) / |Entry − SL| (đổi dấu với Sell). Có thể nhập R trực tiếp hoặc kết quả tiền.</li>
        <li>Thứ tự ưu tiên R: (1) kết quả ròng / rủi ro tiền, (2) R nhập tay, (3) R theo giá.</li>
        <li>Mỗi lần bấm Lưu, dữ liệu được ghi lên máy chủ ngay. Có thể đăng xuất và tiếp tục trên thiết bị khác.</li>
        <li>Quy ước equity: theo tiền, theo R với rủi ro cố định % vốn ban đầu, hoặc theo R lãi kép.</li>
      </ul>

      <h2>4. Phiên bản chiến lược</h2>
      <p>Phiên bản đã xác nhận bị khóa quy tắc. Muốn thay đổi, dùng <b>Sao chép → phiên bản mới</b> (V2, V3…). Kết quả của phiên bản cũ không thay đổi. Mục “So sánh các phiên bản” dùng cùng công thức và hiển thị cỡ mẫu của từng phiên bản.</p>

      <h2>5. Công thức thống kê</h2>
      <ul>
        <li><b>Win rate</b> = Thắng / (Thắng + Thua + Hòa) × 100%. Hòa nằm trong mẫu số nhưng không là thắng.</li>
        <li><b>Profit Factor</b> = Gross Profit / |Gross Loss| (theo kết quả ròng). Không có lệnh thua → N/A.</li>
        <li><b>R</b> = Kết quả ròng / Rủi ro ban đầu. <b>Expectancy (R)</b> = Tổng R / số lệnh có R hợp lệ.</li>
        <li><b>Max Drawdown</b> = mức giảm lớn nhất từ đỉnh vốn trước đó, theo tiền và %. Tính trên vốn tích lũy của lệnh đã đóng.</li>
        <li>Lệnh Open, Cancelled, nháp và lệnh thiếu cả kết quả tiền lẫn R không được tính.</li>
        <li>Lọc ngày trên Dashboard theo thời điểm đóng lệnh.</li>
      </ul>

      <h2>6. Ảnh và biểu đồ</h2>
      <ul>
        <li>Tải ảnh PNG/JPG/WebP (tối đa 10 MB, tùy cấu hình) cho giao dịch hoặc phiên backtest; chọn loại Trước/Sau, thêm chú thích, thay hoặc xóa ảnh.</li>
        <li>Biểu đồ nến chỉ hiển thị khi bạn đã <Link href="/data#prices">nhập dữ liệu giá</Link> cho thị trường đó. Ứng dụng không tạo nến giả.</li>
      </ul>

      <h2>7. Nhập / xuất CSV</h2>
      <p>Cột bắt buộc: <code>market, direction, entry_time, entry_price</code>. Cột thường dùng: <code>code, trade_type, account, backtest_session, strategy, strategy_version, status, exit_time, stop_loss, take_profit, exit_price, volume, risk_amount, gross_pnl, commission, swap, other_fees, r_manual, setup, market_condition, plan_compliance, notes, tags</code> (tags phân cách bằng “;”).</p>
      <ul>
        <li>Thời gian ISO 8601 (vd <code>2024-03-01 14:30</code> hoặc <code>2024-03-01T14:30:00+07:00</code>). Không có múi giờ → hiểu theo múi giờ bạn chọn khi nhập.</li>
        <li>Tham chiếu tài khoản/phiên/chiến lược theo <b>tên</b> đã có; không tự tạo mới.</li>
        <li>Nhập lại cùng tệp không tạo giao dịch trùng. Tệp xuất từ TradeJournal có thể nhập lại nguyên vẹn.</li>
      </ul>

      <h2>8. Sao lưu dữ liệu của bạn</h2>
      <p>Hệ thống sao lưu hằng ngày sang vùng lưu trữ độc lập. Bạn vẫn nên định kỳ tải <b>Toàn bộ + ảnh (ZIP)</b> tại <Link href="/data">Dữ liệu</Link>: gồm CSV giao dịch, chiến lược, phiên backtest, báo cáo thống kê, ảnh và tệp <code>manifest.json</code> liên kết ảnh với giao dịch.</p>
    </article>
  );
}
