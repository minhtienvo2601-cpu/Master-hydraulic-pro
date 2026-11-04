// Bộ lọc ghi chú: từ khóa, thẻ, trạng thái, khoảng ngày, ảnh, việc chưa xong
import { alive, tagsOf, progress, folded } from './store.js';
import { today, addDays, words, dmy, ymd } from './util.js';
import { STATUS } from './templates.js';

export const emptyF = () => ({ q: '', tags: [], tagMode: 'all', status: [], range: '', from: '', to: '', photo: false, open: false, pinned: false, sort: 'updated' });
export const F = emptyF();
export function setF(f) { Object.assign(F, emptyF(), JSON.parse(JSON.stringify(f || {}))); }
export const sameF = (a, b) => { const k = x => JSON.stringify({ ...emptyF(), ...x, q: '', sort: '' }); return k(a) === k(b); };

export const RANGES = {
  today: 'Hôm nay', yesterday: 'Hôm qua', '7d': '7 ngày qua', '30d': '30 ngày qua', month: 'Tháng này', lastmonth: 'Tháng trước', custom: 'Tùy chọn…',
};
export const SORTS = { updated: 'Mới sửa gần đây', created: 'Mới tạo gần đây', date: 'Theo ngày công việc', old: 'Cũ nhất trước', title: 'Theo tên A→Z' };

export function rangeOf(f) {
  const t = today();
  switch (f.range) {
    case 'today': return [t, t];
    case 'yesterday': { const y = addDays(t, -1); return [y, y]; }
    case '7d': return [addDays(t, -6), t];
    case '30d': return [addDays(t, -29), t];
    case 'month': return [t.slice(0, 8) + '01', t];
    case 'lastmonth': { const d = new Date(t.slice(0, 8) + '01T00:00:00'); d.setDate(0); const e = ymd(d); return [e.slice(0, 8) + '01', e]; }
    case 'custom': return [f.from || '0000-00-00', f.to || '9999-99-99'];
    default: return null;
  }
}
export const isOpen = n => n.status === 'todo' || n.status === 'doing' || (n.status !== 'done' && (() => { const p = progress(n); return p.total > p.done; })());

export function applyF(f = F) {
  const ws = words(f.q); const r = rangeOf(f);
  const list = alive().filter(n => {
    if (f.pinned && !n.pinned) return false;
    if (f.status.length && !f.status.includes(n.status || 'none')) return false;
    if (f.photo && !(n.photos || []).length) return false;
    if (f.open && !isOpen(n)) return false;
    if (r && (n.date < r[0] || n.date > r[1])) return false;
    if (f.tags.length) { const ts = tagsOf(n); if (f.tagMode === 'any' ? !f.tags.some(t => ts.includes(t)) : !f.tags.every(t => ts.includes(t))) return false; }
    if (ws.length) { const s = folded(n); if (!ws.every(w => s.includes(w))) return false; }
    return true;
  });
  const by = {
    updated: (a, b) => b.updated.localeCompare(a.updated),
    created: (a, b) => b.created.localeCompare(a.created),
    date: (a, b) => b.date.localeCompare(a.date) || b.updated.localeCompare(a.updated),
    old: (a, b) => a.created.localeCompare(b.created),
    title: (a, b) => (a.title || a.body).localeCompare(b.title || b.body, 'vi'),
  }[f.sort] || ((a, b) => b.updated.localeCompare(a.updated));
  return list.sort((a, b) => (b.pinned - a.pinned) || by(a, b));
}

// mô tả ngắn các điều kiện đang bật (hiện thành chip có nút ✕)
export function activeParts(f = F) {
  const out = [];
  for (const t of f.tags) out.push({ k: 'tag', v: t, label: '#' + t });
  if (f.tags.length > 1) out.push({ k: 'tagMode', label: f.tagMode === 'any' ? 'Có 1 trong các thẻ' : 'Có đủ các thẻ' });
  for (const s of f.status) out.push({ k: 'status', v: s, label: s === 'none' ? 'Không trạng thái' : STATUS[s].label });
  if (f.range) out.push({ k: 'range', label: f.range === 'custom' ? `${f.from ? dmy(f.from) : '…'} → ${f.to ? dmy(f.to) : '…'}` : RANGES[f.range] });
  if (f.pinned) out.push({ k: 'pinned', label: 'Đã ghim' });
  if (f.open) out.push({ k: 'open', label: 'Còn việc chưa xong' });
  if (f.photo) out.push({ k: 'photo', label: 'Có ảnh' });
  return out;
}
export function dropPart(p) {
  if (p.k === 'tag') F.tags = F.tags.filter(t => t !== p.v);
  else if (p.k === 'status') F.status = F.status.filter(s => s !== p.v);
  else if (p.k === 'range') { F.range = ''; F.from = ''; F.to = ''; }
  else if (p.k === 'tagMode') F.tagMode = 'all';
  else F[p.k] = false;
}
export const countActive = (f = F) => activeParts(f).filter(p => p.k !== 'tagMode').length;
