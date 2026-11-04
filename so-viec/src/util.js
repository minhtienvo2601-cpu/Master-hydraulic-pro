// Tiện ích dùng chung
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const pad = n => String(n).padStart(2, '0');
export const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd();
export const addDays = (s, k) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + k); return ymd(d); };
export const hm = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const dmy = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '';
export const WD = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
export function dayLabel(s) {
  const t = today();
  if (s === t) return 'Hôm nay';
  if (s === addDays(t, -1)) return 'Hôm qua';
  if (s === addDays(t, 1)) return 'Ngày mai';
  const d = new Date(s + 'T00:00:00');
  return `${WD[d.getDay()]}, ${dmy(s)}`;
}
// "14:05" nếu hôm nay, "Hôm qua", "03/11" … cho thời điểm ISO
export function whenLabel(iso) {
  const d = new Date(iso); const s = ymd(d);
  if (s === today()) return hm(d);
  if (s === addDays(today(), -1)) return 'Hôm qua ' + hm(d);
  return s.slice(0, 4) === today().slice(0, 4) ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : dmy(s);
}
export const fullTime = iso => { const d = new Date(iso); return `${hm(d)} ${dmy(ymd(d))}`; };

// Bỏ dấu tiếng Việt để tìm kiếm: "Bơm dầu" ≈ "bom dau"
const fold1 = c => c.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
export const fold = s => fold1(String(s || ''));
// giữ nguyên độ dài chuỗi (từng ký tự) để tô sáng đúng vị trí
function foldKeep(s) { return [...s].map(c => { const f = fold1(c); return f.length === 1 ? f : c.toLowerCase(); }).join(''); }
export const words = q => fold(q).split(/\s+/).filter(Boolean);
export function highlight(text, q) {
  const s = String(text || '').normalize('NFC'); const ws = words(q);
  if (!ws.length) return esc(s);
  const f = foldKeep(s); const marks = new Array(s.length).fill(false);
  for (const w of ws) { let i = f.indexOf(w); while (i >= 0) { for (let k = i; k < i + w.length; k++) marks[k] = true; i = f.indexOf(w, i + w.length); } }
  let out = '', on = false;
  for (let i = 0; i < s.length; i++) {
    if (marks[i] && !on) { out += '<mark>'; on = true; } else if (!marks[i] && on) { out += '</mark>'; on = false; }
    out += esc(s[i]);
  }
  return on ? out + '</mark>' : out;
}

// #thẻ trong văn bản: chữ (có dấu), số, gạch nối, gạch dưới, chấm, gạch chéo
export const TAG_RE = /(^|[\s(,;])#([\p{L}\p{N}][\p{L}\p{N}_\-./]*)/gu;
export const normTag = t => String(t || '').trim().replace(/^#+/, '').replace(/[.\-/]+$/, '').replace(/\s+/g, '-').toLowerCase().normalize('NFC');
export function parseTags(text) {
  const out = []; let m; TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(text || ''))) { const t = normTag(m[2]); if (t && !out.includes(t)) out.push(t); }
  return out;
}

// dòng checklist: "☐ việc", "☑ việc", "[ ] việc", "[x] việc", "- [ ] việc"
export const CHK_RE = /^(\s*)(?:[-*]\s+)?(☐|☑|\[ \]|\[x\]|\[X\])\s?/;
export const isChecked = mark => mark === '☑' || mark === '[x]' || mark === '[X]';

export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
