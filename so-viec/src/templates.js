// Mẫu ghi chú dựng sẵn + điền biến tự động
import { today, hm, dmy, WD } from './util.js';

export const STATUS = {
  todo: { label: 'Cần làm', cls: 'st-todo' },
  doing: { label: 'Đang xử lý', cls: 'st-doing' },
  done: { label: 'Đã xong', cls: 'st-done' },
};

export const DEFAULT_SHIFTS = [{ name: 'Ca 1', from: '06:00' }, { name: 'Ca 2', from: '14:00' }, { name: 'Ca 3', from: '22:00' }];

export const DEFAULT_TEMPLATES = [
  { id: 't-bgc', icon: '🔄', name: 'Bàn giao ca', status: 'todo', tags: ['bàn-giao-ca'], title: 'Bàn giao {ca} – {ngày}',
    body: `Người giao: {người}
Người nhận:
Thời điểm: {giờ} {ngày}

## Tình trạng thiết bị
-

## Việc đang dở – ca sau làm tiếp
☐

## Lưu ý an toàn
- ` },
  { id: 't-sc', icon: '⚠️', name: 'Báo cáo sự cố', status: 'doing', tags: ['sự-cố'], title: 'Sự cố – {ngày}',
    body: `Thiết bị:
Vị trí:
Phát hiện lúc: {giờ} {ngày}
Người phát hiện: {người}

## Hiện tượng
-

## Nguyên nhân (sơ bộ)
-

## Đã xử lý
☐

## Vật tư đã dùng / cần đặt
-

Thời gian dừng máy:
Tình trạng sau xử lý: ` },
  { id: 't-kt', icon: '✅', name: 'Kiểm tra hằng ngày', status: 'todo', tags: ['kiểm-tra'], title: 'Kiểm tra hằng ngày – {ngày}',
    body: `Người kiểm tra: {người} · {ca}
Khu vực / thiết bị:

☐ Mức dầu thùng chứa
☐ Nhiệt độ dầu (°C):
☐ Áp suất hệ thống (bar):
☐ Rò rỉ ở ống, khớp nối, xi lanh
☐ Tiếng ồn, rung bất thường của bơm
☐ Chỉ báo tắc lọc dầu
☐ Quạt / két làm mát
☐ Vệ sinh khu vực

## Ghi chú thêm
- ` },
  { id: 't-bd', icon: '🔧', name: 'Bảo dưỡng / thay vật tư', status: 'doing', tags: ['bảo-dưỡng'], title: 'Bảo dưỡng – {ngày}',
    body: `Thiết bị:
Hạng mục:
Người thực hiện: {người}
Bắt đầu: {giờ}    Kết thúc:

## Các bước
☐ Cô lập năng lượng, treo biển cảnh báo
☐
☐ Chạy thử, kiểm tra rò rỉ

## Vật tư thay thế (mã – số lượng)
-

Kết quả: ` },
  { id: 't-hop', icon: '📋', name: 'Họp / giao việc', status: '', tags: ['họp'], title: 'Họp – {ngày}',
    body: `Thành phần:
Nội dung chính:
-

## Việc cần làm (ai – hạn)
☐ ` },
  { id: 't-nk', icon: '📒', name: 'Nhật ký trong ngày', status: '', tags: ['nhật-ký'], title: 'Nhật ký {thứ} {ngày}',
    body: `[{giờ}] ` },
];

export function currentShift(shifts) {
  const list = (shifts && shifts.length ? shifts : DEFAULT_SHIFTS).slice().sort((a, b) => a.from.localeCompare(b.from));
  const now = hm(); let cur = list[list.length - 1];
  for (const s of list) if (s.from <= now) cur = s;
  return cur.name;
}

// {ngày} {giờ} {người} {ca} {thứ} – viết có dấu hay không dấu đều được
export function fillVars(str, settings) {
  const map = {
    'ngày': dmy(today()), ngay: dmy(today()),
    'giờ': hm(), gio: hm(),
    'người': settings.name || '', nguoi: settings.name || '',
    ca: currentShift(settings.shifts),
    'thứ': WD[new Date().getDay()], thu: WD[new Date().getDay()],
  };
  return String(str || '').replace(/\{(ngày|ngay|giờ|gio|người|nguoi|ca|thứ|thu)\}/giu, (m, k) => map[k.toLowerCase()] ?? m);
}
