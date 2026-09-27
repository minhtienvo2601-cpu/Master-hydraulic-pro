// Số liệu tham khảo phụ kiện thủy lực. Mỗi bảng ghi nguồn tiêu chuẩn.

// ---------- Ren ----------
export const THREADS = {
  bsp: {
    name: 'BSPP / BSPT (ren ống Anh)', std: 'ISO 228-1 (G – ren trụ), ISO 7-1 / EN 10226 (R, Rc – ren côn)',
    note: 'Góc ren 55°. Ren trụ G làm kín bằng vòng đệm/gioăng ở mặt tựa; ren côn R tự làm kín trên ren (dùng băng tan/keo).',
    cols: ['Cỡ', 'Đ.kính ngoài ren (mm)', 'Số ren/inch', 'Bước (mm)'],
    rows: [['1/8"', '9,73', '28', '0,907'], ['1/4"', '13,16', '19', '1,337'], ['3/8"', '16,66', '19', '1,337'], ['1/2"', '20,96', '14', '1,814'],
      ['5/8"', '22,91', '14', '1,814'], ['3/4"', '26,44', '14', '1,814'], ['7/8"', '30,20', '14', '1,814'], ['1"', '33,25', '11', '2,309'],
      ['1 1/4"', '41,91', '11', '2,309'], ['1 1/2"', '47,80', '11', '2,309'], ['2"', '59,61', '11', '2,309']],
  },
  npt: {
    name: 'NPT (ren ống côn Mỹ)', std: 'ASME B1.20.1',
    note: 'Góc ren 60°, côn 1:16. Tự làm kín trên ren nhờ biến dạng đỉnh ren – luôn dùng băng tan/keo. Không lắp lẫn với BSPT dù cỡ gần giống.',
    cols: ['Cỡ', 'Đ.kính ngoài ống (mm)', 'Số ren/inch'],
    rows: [['1/8"', '10,29', '27'], ['1/4"', '13,72', '18'], ['3/8"', '17,15', '18'], ['1/2"', '21,34', '14'], ['3/4"', '26,67', '14'],
      ['1"', '33,40', '11,5'], ['1 1/4"', '42,16', '11,5'], ['1 1/2"', '48,26', '11,5'], ['2"', '60,33', '11,5']],
  },
  jic: {
    name: 'JIC 37° (ren UNF/UN)', std: 'SAE J514, ISO 8434-2',
    note: 'Mặt côn 37° kim loại–kim loại. Cỡ “-dash” = đường kính ngoài ống tính theo 1/16 inch (-8 = 8/16 = 1/2"). Ren UNF giống ren cổng SAE O-ring boss (J1926) cùng cỡ.',
    cols: ['Dash', 'Ống OD', 'Ren', 'Đ.kính ren (mm)'],
    rows: [['-2', '1/8"', '5/16-24', '7,9'], ['-3', '3/16"', '3/8-24', '9,5'], ['-4', '1/4"', '7/16-20', '11,1'], ['-5', '5/16"', '1/2-20', '12,7'],
      ['-6', '3/8"', '9/16-18', '14,3'], ['-8', '1/2"', '3/4-16', '19,1'], ['-10', '5/8"', '7/8-14', '22,2'], ['-12', '3/4"', '1 1/16-12', '27,0'],
      ['-14', '7/8"', '1 3/16-12', '30,2'], ['-16', '1"', '1 5/16-12', '33,3'], ['-20', '1 1/4"', '1 5/8-12', '41,3'], ['-24', '1 1/2"', '1 7/8-12', '47,6'],
      ['-32', '2"', '2 1/2-12', '63,5']],
  },
  orfs: {
    name: 'ORFS (mặt phẳng có O-ring)', std: 'SAE J1453, ISO 8434-3',
    note: 'Làm kín bằng O-ring nằm trong rãnh mặt đầu – kín tốt nhất, chịu rung tốt, dùng cho áp cao. Không tái sử dụng O-ring khi tháo lắp.',
    cols: ['Dash', 'Ống OD', 'Ren', 'Đ.kính ren (mm)'],
    rows: [['-4', '1/4"', '9/16-18', '14,3'], ['-6', '3/8"', '11/16-16', '17,5'], ['-8', '1/2"', '13/16-16', '20,6'], ['-10', '5/8"', '1-14', '25,4'],
      ['-12', '3/4"', '1 3/16-12', '30,2'], ['-16', '1"', '1 7/16-12', '36,5'], ['-20', '1 1/4"', '1 11/16-12', '42,9'], ['-24', '1 1/2"', '2-12', '50,8']],
  },
};

// ---------- Đầu nối côn 24° (vòng cắt) ----------
export const DIN24 = {
  name: 'Đầu nối côn 24° – vòng cắt (DIN 2353 / ISO 8434-1)',
  note: 'Áp suất làm việc tối đa theo ISO 8434-1 (bảng 1). Một số hãng (Parker EO2, Stauff, Voss…) công bố định mức cao hơn – luôn ưu tiên catalogue của hãng.',
  series: [
    { k: 'LL', d: 'Siêu nhẹ', rows: [[4, 'M8×1', 100], [5, 'M10×1', 100], [6, 'M10×1', 100], [8, 'M12×1', 100]] },
    { k: 'L', d: 'Nhẹ', rows: [[6, 'M12×1,5', 250], [8, 'M14×1,5', 250], [10, 'M16×1,5', 250], [12, 'M18×1,5', 250], [15, 'M22×1,5', 250], [18, 'M26×1,5', 160], [22, 'M30×2', 160], [28, 'M36×2', 100], [35, 'M45×2', 100], [42, 'M52×2', 100]] },
    { k: 'S', d: 'Nặng', rows: [[6, 'M14×1,5', 630], [8, 'M16×1,5', 630], [10, 'M18×1,5', 630], [12, 'M20×1,5', 630], [16, 'M24×1,5', 400], [20, 'M30×2', 400], [25, 'M36×2', 400], [30, 'M42×2', 250], [38, 'M52×2', 250]] },
  ],
};

// ---------- Ống mềm ----------
export const HOSES = {
  note: 'Áp làm việc tối đa (bar) và bán kính uốn tối thiểu (mm). Nguồn: catalogue ống thủy lực theo EN 853 / EN 856 (Tubes International); SAE 100R12/R13 theo SAE J517. Hệ số an toàn nổ 4:1.',
  types: [
    { k: '1SN', d: 'EN 853 1SN / SAE 100R1AT – 1 lớp bố thép bện', rows: [['-3', 4.8, 250, 90], ['-4', 6.4, 225, 100], ['-5', 8, 215, 115], ['-6', 9.5, 180, 130], ['-8', 12.7, 160, 180], ['-10', 16, 130, 200], ['-12', 19, 105, 240], ['-16', 25.4, 88, 300], ['-20', 31.8, 63, 420], ['-24', 38.1, 50, 500], ['-32', 50.8, 40, 630]] },
    { k: '2SN', d: 'EN 853 2SN / SAE 100R2AT – 2 lớp bố thép bện', rows: [['-3', 4.8, 415, 90], ['-4', 6.4, 400, 100], ['-5', 8, 350, 115], ['-6', 9.5, 330, 130], ['-8', 12.7, 275, 180], ['-10', 16, 250, 200], ['-12', 19, 215, 240], ['-16', 25.4, 165, 300], ['-20', 31.8, 125, 420], ['-24', 38.1, 90, 500], ['-32', 50.8, 80, 630]] },
    { k: '4SP', d: 'EN 856 4SP – 4 lớp bố thép xoắn', rows: [['-4', 6.4, 450, 150], ['-6', 9.5, 445, 180], ['-8', 12.7, 415, 230], ['-10', 16, 350, 250], ['-12', 19, 350, 300], ['-16', 25.4, 280, 340], ['-20', 31.8, 210, 460], ['-24', 38.1, 185, 560], ['-32', 50.8, 165, 660]] },
    { k: '4SH', d: 'EN 856 4SH – 4 lớp xoắn, áp cao cỡ lớn', rows: [['-12', 19, 420, 280], ['-16', 25.4, 380, 340], ['-20', 31.8, 325, 460], ['-24', 38.1, 290, 560], ['-32', 50.8, 250, 700]] },
    { k: 'R12', d: 'SAE 100R12 – 4 lớp xoắn', rows: [['-6', 9.5, 275, '—'], ['-8', 12.7, 275, '—'], ['-10', 16, 275, '—'], ['-12', 19, 275, '—'], ['-16', 25.4, 275, '—'], ['-20', 31.8, 210, '—'], ['-24', 38.1, 175, '—'], ['-32', 50.8, 175, '—']] },
    { k: 'R13', d: 'SAE 100R13 – 4–6 lớp xoắn, 5000 psi', rows: [['-12', 19, 345, '—'], ['-16', 25.4, 345, '—'], ['-20', 31.8, 345, '—'], ['-24', 38.1, 345, '—'], ['-32', 50.8, 345, '—']] },
  ],
};

// ---------- Mặt bích SAE ----------
export const FLANGES = {
  name: 'Mặt bích 4 bu lông SAE J518 / ISO 6162',
  note: 'Code 61 = áp tiêu chuẩn, Code 62 = áp cao (bích dày hơn, bu lông lớn hơn). Áp suất tham khảo theo catalogue phổ biến – kiểm tra lại theo hãng.',
  cols: ['Cỡ', 'Code 61 (bar)', 'Code 62 (bar)'],
  rows: [['1/2"', '345', '414'], ['3/4"', '345', '414'], ['1"', '345', '414'], ['1 1/4"', '276', '414'], ['1 1/2"', '207', '414'], ['2"', '207', '414'], ['2 1/2"', '172', '—'], ['3"', '138', '—'], ['4"', '34', '—']],
};

// ---------- Vật liệu gioăng ----------
export const SEALS = {
  cols: ['Vật liệu', 'Nhiệt độ (°C)', 'Dầu khoáng', 'Nước-glycol (HFC)', 'Este phốt phát (HFD)', 'Ghi chú'],
  rows: [
    ['NBR (Nitrile)', '-30 … +100', '✔ Tốt', '✔ Được', '✘ Không', 'Phổ biến, rẻ; lão hóa nhanh khi >100°C'],
    ['HNBR', '-30 … +150', '✔ Tốt', '✔ Được', '✘ Không', 'NBR cải tiến, chịu nhiệt & mài mòn tốt hơn'],
    ['FKM (Viton®)', '-20 … +200', '✔ Tốt', '△ Hạn chế', '✔ Tốt', 'Dùng khi nóng hoặc dầu chống cháy HFD; kém ở nhiệt độ thấp'],
    ['EPDM', '-40 … +130', '✘ Không', '✔ Tốt', '✔ Tốt', 'TUYỆT ĐỐI không dùng với dầu khoáng (trương nở)'],
    ['PU / AU (Polyurethane)', '-30 … +100', '✔ Tốt', '✘ Không (thủy phân)', '✘ Không', 'Chống mài mòn rất tốt – phớt ty ben, gạt bụi'],
    ['PTFE (Teflon)', '-200 … +260', '✔ Tốt', '✔ Tốt', '✔ Tốt', 'Ma sát thấp, trơ hóa chất; cần vòng đàn hồi đi kèm'],
  ],
};

// ---------- Từ điển phụ kiện Việt – Anh ----------
export const GLOSSARY = [
  ['Co 90°', 'Elbow 90°', 'Đổi hướng dòng 90°. Loại bán kính dài (LR) ít tổn thất hơn bán kính ngắn (SR).'],
  ['Co 45°', 'Elbow 45°', 'Đổi hướng 45°.'],
  ['Tê (T)', 'Tee', 'Chia/nhập 3 nhánh. Tê đều (equal) hoặc tê thu (reducing).'],
  ['Thập', 'Cross', 'Nối 4 nhánh.'],
  ['Măng sông', 'Coupling / Socket', 'Nối 2 đầu ren ngoài, hai đầu ren trong.'],
  ['Kép (kép ren)', 'Nipple / Hex nipple', 'Hai đầu ren ngoài, nối hai chi tiết ren trong.'],
  ['Kép thu', 'Reducing nipple', 'Kép hai đầu khác cỡ.'],
  ['Lơ thu (cà rá)', 'Bushing / Reducer', 'Ren ngoài cỡ lớn – ren trong cỡ nhỏ, để giảm cỡ cổng.'],
  ['Rắc co', 'Union', 'Tháo lắp được mà không phải xoay ống.'],
  ['Nút bịt ren ngoài', 'Plug', 'Bịt cổng ren trong.'],
  ['Nắp bịt ren trong', 'Cap', 'Bịt đầu ren ngoài.'],
  ['Đầu nối thẳng', 'Straight connector / Male stud', 'Nối ống vào cổng thiết bị.'],
  ['Đầu nối xoay', 'Swivel', 'Có đai ốc xoay, định hướng được khi lắp.'],
  ['Đầu nối xuyên vách', 'Bulkhead connector', 'Đi ống xuyên qua vách/tấm tôn, có đai ốc hãm.'],
  ['Khớp nối nhanh', 'Quick coupling / QRC', 'Tháo lắp nhanh không cần dụng cụ, có van tự đóng.'],
  ['Điểm đo áp (Minimess)', 'Test point / Test coupling', 'Gắn đồng hồ đo áp khi hệ đang chạy. Loại phổ biến ren M16×2 (Minimess 1620).'],
  ['Vòng cắt', 'Cutting ring / Bite ring', 'Chi tiết ăn vào ống trong đầu nối côn 24° (DIN 2353).'],
  ['Vòng đệm làm kín (long đền cao su)', 'Bonded seal / Dowty seal', 'Vòng thép có lõi cao su, làm kín ren trụ BSP/mét.'],
  ['Mặt bích 4 bu lông', 'SAE flange (Code 61/62)', 'Nối ống lớn/áp cao vào bơm, van, khối van.'],
  ['Ống thép chính xác', 'Precision steel tube (EN 10305-4)', 'Ống liền mạch kéo nguội dùng cho đầu nối 24°, mác E235/E355.'],
];

// ---------- Bài viết kiến thức ----------
export const ARTICLES = [
  {
    t: 'Cách nhận biết loại ren đầu nối', tags: 'ren nhận biết bsp npt jic orfs metric dưỡng thước',
    b: `<ol>
<li><b>Đo đường kính đỉnh ren</b> bằng thước cặp (ren ngoài đo đỉnh, ren trong đo chân ren).</li>
<li><b>Đo bước ren</b> bằng dưỡng ren (pitch gauge): hệ inch đếm số ren/inch, hệ mét đọc bước mm.</li>
<li><b>Xem ren trụ hay côn</b>: ren côn (NPT, BSPT) đường kính nhỏ dần về phía đầu; ren trụ (BSPP, UNF, mét) đều nhau.</li>
<li><b>Xem mặt làm kín</b>: côn 37° (JIC), côn 24° (DIN), côn 60° (BSP), mặt phẳng có rãnh O-ring (ORFS), O-ring ở chân ren (SAE ORB, ISO 6149).</li>
<li><b>Tra bảng</b> ở mục Ren để khớp đường kính + bước ren.</li></ol>
<p><b>Dễ nhầm:</b> BSP 1/2" (20,96 mm, 14 ren) và NPT 1/2" (21,3 mm, 14 ren) – cùng số ren nhưng góc ren khác (55° / 60°). JIC -8 (3/4-16) và ORFS -8 (13/16-16) – khác mặt làm kín. Ren mét M22×1,5 và JIC -10 (7/8-14 ≈ 22,2 mm) – khác bước ren.</p>`,
  },
  {
    t: 'Đầu nối côn 24° (vòng cắt) – lắp đúng cách', tags: 'din 2353 vòng cắt 24 độ lắp ráp cắt ống ermeto',
    b: `<ol>
<li>Cắt ống <b>vuông góc</b> (dùng dụng cụ cắt chuyên dụng, không dùng máy cắt đĩa), vát nhẹ và làm sạch bavia trong/ngoài.</li>
<li>Lắp đai ốc rồi vòng cắt vào ống <b>đúng chiều</b> (mép cắt hướng về đầu ống).</li>
<li>Đẩy ống chạm hết vào đáy thân đầu nối. Vặn đai ốc bằng tay đến khi chạm.</li>
<li>Siết thêm khoảng <b>1,5 vòng</b> (theo hướng dẫn phổ biến; kiểm tra catalogue hãng) trong khi giữ ống không xoay.</li>
<li>Tháo ra kiểm tra: vòng cắt phải tạo gờ đều quanh ống, không xoay tự do trên ống nhưng có thể xoay nhẹ.</li>
<li>Khi lắp lại: vặn tay đến chạm rồi siết thêm khoảng 1/4 vòng.</li></ol>
<p><b>Chọn series:</b> L (nhẹ) cho đường hồi và áp trung bình; S (nặng) cho đường áp cao – xem bảng áp suất trong mục Đầu nối 24°.</p>`,
  },
  {
    t: 'Lắp ống mềm thủy lực – lỗi thường gặp', tags: 'ống mềm hose lắp đặt xoắn uốn bán kính',
    b: `<ul>
<li><b>Xoắn ống khi lắp</b>: vạch in trên ống phải thẳng. Ống bị xoắn 7° có thể giảm tuổi thọ tới 90%.</li>
<li><b>Uốn gắt sát đầu nối</b>: giữ đoạn thẳng tối thiểu ~1,5 lần đường kính ngoài ống sau đầu bấm; dùng cút 45°/90° thay vì uốn ống.</li>
<li><b>Nhỏ hơn bán kính uốn tối thiểu</b> (xem bảng ống mềm).</li>
<li><b>Ống căng không có độ dư</b>: ống co ngắn 2–4% khi chịu áp – luôn để dư chiều dài.</li>
<li><b>Cọ xát vào kết cấu</b>: dùng áo bảo vệ, kẹp ống; tránh xa nguồn nhiệt.</li>
<li><b>Chọn áp</b>: áp làm việc của ống ≥ áp tối đa của hệ, kể cả xung áp.</li></ul>`,
  },
  {
    t: 'Chọn ống thép cho đường thủy lực', tags: 'ống thép sch ống chính xác e235 e355 tốc độ dầu',
    b: `<p><b>Ống chính xác (EN 10305-4, mác E235 / E355)</b> ghi theo <i>đường kính ngoài × độ dày</i> (ví dụ 25×3) – dùng với đầu nối côn 24°, phổ biến trên máy châu Âu.</p>
<p><b>Ống theo SCH (ASME B36.10M)</b> ghi theo DN/NPS + SCH – dùng cho đường ống lớn, hàn mặt bích, đường hồi, trạm bơm.</p>
<p><b>Vận tốc dầu khuyến nghị</b> (tham khảo thường dùng): đường hút 0,5–1,2 m/s · đường hồi 2–4 m/s · đường áp 3–6 m/s (áp càng cao cho phép càng nhanh). Tốc độ quá cao gây ồn, nóng dầu, tổn thất áp.</p>
<p>Kiểm tra áp suất cho phép của ống bằng công cụ <b>Tính áp suất ống</b> trong tab này.</p>`,
  },
  {
    t: 'SCH là gì? STD, XS, XXS khác gì?', tags: 'schedule sch std xs xxs độ dày thành ống',
    b: `<p><b>SCH (Schedule)</b> là cấp độ dày thành ống theo ASME B36.10M. Cùng một cỡ DN, <b>đường kính ngoài không đổi</b>; SCH càng lớn thì thành càng dày, lòng ống càng nhỏ, chịu áp càng cao.</p>
<ul><li><b>STD</b> (Standard) ≈ SCH 40 với cỡ ≤ 10".</li><li><b>XS</b> (Extra Strong) ≈ SCH 80 với cỡ ≤ 8".</li><li><b>XXS</b> (Double Extra Strong) – rất dày, dùng áp rất cao; không tương ứng số SCH cố định.</li>
<li>Hậu tố <b>S</b> (5S, 10S, 40S, 80S) là ống inox theo ASME B36.19M.</li></ul>
<p><b>DN</b> (mm, hệ mét) và <b>NPS</b> (inch) chỉ là cỡ danh nghĩa – không bằng đường kính thật. Ví dụ DN50 = 2" có OD thực 60,3 mm.</p>`,
  },
  {
    t: 'Các kiểu làm kín đầu nối thủy lực', tags: 'làm kín jic orfs bsp o-ring bonded seal 37 24 độ',
    b: `<ul>
<li><b>Côn 37° (JIC)</b> – kim loại–kim loại, dễ tìm (hệ Mỹ). Nhạy với siết quá lực.</li>
<li><b>Côn 24° (DIN/ISO 8434-1)</b> – vòng cắt hoặc côn có O-ring (DKO). Chuẩn máy châu Âu.</li>
<li><b>ORFS</b> – O-ring mặt đầu, kín nhất, chịu rung – dùng áp cao.</li>
<li><b>BSP côn 60°</b> – đầu ống mềm hệ Anh; hoặc ren trụ BSPP với vòng đệm bonded seal ở cổng.</li>
<li><b>Cổng O-ring (SAE J1926 / ISO 6149)</b> – O-ring ở chân ren, không cần băng tan.</li>
<li><b>Ren côn (NPT/BSPT)</b> – làm kín trên ren, dễ rò khi rung – hạn chế dùng cho áp cao.</li></ul>`,
  },
];

// ---------- Vật liệu ống cho tính áp suất ----------
// S = ứng suất cho phép (MPa) ở nhiệt độ thường; Rm = giới hạn bền kéo tối thiểu (MPa)
export const MATERIALS = [
  { k: 'a106', n: 'Thép carbon A106 Gr.B / A53 Gr.B / API 5L B', S: 138, Rm: 415, src: 'ASME B31.3' },
  { k: 'ss', n: 'Inox A312 TP304 / TP316', S: 138, Rm: 515, src: 'ASME B31.3' },
  { k: 'e235', n: 'Ống chính xác E235 (EN 10305-4)', S: 142, Rm: 340, src: 'min(Re/1,5; Rm/2,4)' },
  { k: 'e355', n: 'Ống chính xác E355 (EN 10305-4)', S: 204, Rm: 490, src: 'min(Re/1,5; Rm/2,4)' },
  { k: 'st37', n: 'St37 / S235', S: 150, Rm: 360, src: 'min(Re/1,5; Rm/2,4)' },
];

// ---------- Đổi đơn vị ----------
export const UNITS = {
  'Chiều dài': { base: 'mm', u: { mm: 1, cm: 10, m: 1000, inch: 25.4, ft: 304.8 } },
  'Áp suất': { base: 'bar', u: { bar: 1, psi: 1 / 14.5037738, MPa: 10, kPa: 0.01, 'kgf/cm²': 0.980665, atm: 1.01325 } },
  'Lưu lượng': { base: 'L/phút', u: { 'L/phút': 1, 'gpm (US)': 3.785411784, 'm³/h': 1000 / 60, 'L/s': 60 } },
  'Công suất': { base: 'kW', u: { kW: 1, HP: 0.7457, 'mã lực (PS)': 0.73549875, W: 0.001 } },
  'Mô-men': { base: 'N·m', u: { 'N·m': 1, 'lbf·ft': 1.3558179, 'lbf·in': 0.1129848, 'kgf·m': 9.80665 } },
  'Lực': { base: 'N', u: { N: 1, kN: 1000, kgf: 9.80665, 'tấn lực': 9806.65, lbf: 4.4482216 } },
  'Thể tích': { base: 'L', u: { L: 1, mL: 0.001, 'm³': 1000, 'gal (US)': 3.785411784, 'in³': 0.016387064 } },
  'Nhiệt độ': { temp: true, u: { '°C': 1, '°F': 1, K: 1 } },
};
