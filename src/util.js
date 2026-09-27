export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ----- ngày tháng (theo giờ máy, dạng YYYY-MM-DD) -----
const pad = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return ymd(d); };
export const addMonths = (s, n) => {
  const d = parseD(s); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(day, last)); return ymd(d);
};
export const daysTo = s => Math.round((parseD(s) - parseD(today())) / 86400000);
const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
export const fmtD = s => { if (!s) return ''; const d = parseD(s); return `${WD[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
export const fmtShort = s => { if (!s) return ''; const d = parseD(s); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };
export function dueLabel(s) {
  if (!s) return { t: 'Chưa đặt hạn', c: '' };
  const n = daysTo(s);
  if (n < 0) return { t: `Quá hạn ${-n} ngày`, c: 'due-over' };
  if (n === 0) return { t: 'Hôm nay', c: 'due-soon' };
  if (n === 1) return { t: 'Ngày mai', c: 'due-soon' };
  if (n <= 3) return { t: `Còn ${n} ngày · ${fmtShort(s)}`, c: 'due-soon' };
  return { t: fmtD(s), c: '' };
}
export function repeatLabel(r) {
  if (!r) return '';
  const u = { day: 'ngày', week: 'tuần', month: 'tháng' }[r.unit];
  return r.n === 1 ? `Hàng ${u}` : `Mỗi ${r.n} ${u}`;
}
export function nextDue(from, r) {
  if (r.unit === 'day') return addDays(from, r.n);
  if (r.unit === 'week') return addDays(from, r.n * 7);
  return addMonths(from, r.n);
}

// ----- tìm kiếm không dấu -----
export const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
export const compact = s => norm(s).replace(/[\s\-._/\\,:;]+/g, '');
export function matcher(q) {
  const nq = norm(q).trim(); const cq = compact(q);
  const useCompact = /\d/.test(q) && cq.length >= 3;
  return text => { if (!text) return false; if (norm(text).includes(nq)) return true; return useCompact && compact(text).includes(cq); };
}
export function highlight(text, q) {
  const t = String(text); const nt = norm(t); const nq = norm(q).trim();
  const i = nq ? nt.indexOf(nq) : -1;
  if (i < 0) return esc(t);
  return esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + nq.length)) + '</mark>' + esc(t.slice(i + nq.length));
}
export function snippet(line, q, max = 140) {
  const nl = norm(line); const i = nl.indexOf(norm(q).trim());
  if (line.length <= max || i < 0) return line.slice(0, max);
  const s = Math.max(0, i - 40); return (s > 0 ? '…' : '') + line.slice(s, s + max);
}
export const fmtSize = b => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
export function extOf(name) { const m = /\.([a-z0-9]+)$/i.exec(name || ''); return m ? m[1].toLowerCase() : ''; }
export function fileKind(name) {
  const e = extOf(name);
  if (e === 'pdf') return ['pdf', 'PDF'];
  if (['xls', 'xlsx', 'xlsm', 'csv'].includes(e)) return ['xls', e === 'csv' ? 'CSV' : 'XLS'];
  if (['doc', 'docx', 'txt', 'rtf'].includes(e)) return ['doc', e === 'txt' ? 'TXT' : 'DOC'];
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'bmp'].includes(e)) return ['img', 'IMG'];
  if (['dwg', 'dxf'].includes(e)) return ['oth', 'CAD'];
  return ['oth', (e || 'FILE').slice(0, 4).toUpperCase()];
}
export const MIME = { pdf: 'application/pdf', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12', csv: 'text/csv', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', txt: 'text/plain', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', dwg: 'application/acad', zip: 'application/zip', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
