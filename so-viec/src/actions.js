// Thao tác trên ghi chú dùng chung cho danh sách và trình soạn
import { S, newNote, touch, saveKV, tagsOf, flush } from './store.js';
import { nav, push } from './nav.js';
import { STATUS, fillVars } from './templates.js';
import { menu, toast, promptBox, openSheet } from './ui.js';
import { shareText } from './platform.js';
import { esc, uid, dmy, CHK_RE, isChecked } from './util.js';
import { ic } from './icons.js';

export function statusMenu(n, after) {
  menu('Trạng thái', [
    { emoji: '⚪', label: 'Không đặt trạng thái', on: !n.status, run: () => { n.status = ''; touch(n); after(); } },
    ...Object.entries(STATUS).map(([k, s]) => ({ emoji: { todo: '🔴', doing: '🟠', done: '🟢' }[k], label: s.label, on: n.status === k, run: () => { n.status = k; touch(n); after(); } })),
  ]);
}

export function trashNote(n, after) {
  n.deleted = new Date().toISOString(); touch(n, true); after();
  toast('Đã chuyển vào thùng rác', { label: 'Hoàn tác', run: () => { n.deleted = null; touch(n, true); nav.render(); } });
}

export function duplicate(n) {
  const c = newNote({ title: n.title ? n.title + ' (bản sao)' : '', body: n.body, tags: [...n.tags], status: n.status, photos: [] });
  touch(c); toast('Đã nhân bản (không gồm ảnh)'); return c;
}

// văn bản gọn để gửi qua Zalo / tin nhắn
export function noteText(n) {
  const lines = [];
  if (n.title) lines.push(n.title.toUpperCase());
  const meta = [dmy(n.date), n.status ? STATUS[n.status].label : ''].filter(Boolean).join(' · ');
  if (meta) lines.push(meta);
  lines.push('');
  for (const l of n.body.split('\n')) {
    const m = l.match(CHK_RE);
    if (m) lines.push(m[1] + (isChecked(m[2]) ? '✅ ' : '⬜ ') + l.slice(m[0].length));
    else lines.push(l.replace(/^##\s*/, '▸ '));
  }
  const tags = tagsOf(n).filter(t => !n.body.includes('#' + t) && !n.title.includes('#' + t));
  if (tags.length) lines.push('', tags.map(t => '#' + t).join(' '));
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
export async function shareNote(n) {
  try { const r = await shareText(n.title || 'Ghi chú', noteText(n)); if (r === 'copied') toast('Đã chép nội dung – dán vào nơi cần gửi'); }
  catch (e) { toast('Không chia sẻ được: ' + (e.message || e)); }
}

export async function saveAsTemplate(n) {
  const name = await promptBox('Lưu làm mẫu', 'Tên mẫu', n.title || 'Mẫu mới', { help: 'Có thể dùng biến <b>{ngày} {giờ} {người} {ca} {thứ}</b> trong tiêu đề và nội dung mẫu – khi tạo ghi chú, app tự điền.' });
  if (!name) return;
  const body = n.body.replace(/☑/g, '☐').replace(/\[[xX]\]/g, '[ ]');
  S.templates.push({ id: uid(), icon: '📝', name, title: n.title, body, tags: [...n.tags], status: n.status === 'done' ? 'todo' : n.status });
  await saveKV('templates'); toast('Đã lưu mẫu “' + name + '”');
}

// "Thiết bị:" → "Thiết bị: ", "☐" → "☐ " để gõ tiếp ngay sau ô trống
const padBlanks = b => b.split('\n').map(l => /(:|^\s*(☐|-|•|\[ \]))$/.test(l) ? l + ' ' : l).join('\n');
// tạo ghi chú từ mẫu (hoặc trống) rồi mở luôn
export function createFrom(t, extra = {}) {
  const st = S.settings;
  const n = t ? newNote({ title: fillVars(t.title, st), body: padBlanks(fillVars(t.body, st)), tags: [...(t.tags || [])], status: t.status || '', tpl: t.id })
    : newNote({});
  if (extra.tags) for (const x of extra.tags) if (!n.tags.includes(x)) n.tags.push(x);
  touch(n);
  if (t && !st.name && /\{(người|nguoi)\}/i.test(t.title + t.body)) setTimeout(() => toast('Mẹo: nhập tên ở Cài đặt để mẫu tự điền {người}', { label: 'Mở', run: () => push({ v: 'settings' }) }), 600);
  if (t) { st.recentTpl = [t.id, ...(st.recentTpl || []).filter(x => x !== t.id)].slice(0, 10); saveKV('settings'); }
  push({ v: 'note', id: n.id, edit: true, fresh: true });
}

export function sortedTemplates() {
  const rec = S.settings.recentTpl || [];
  const r = id => { const i = rec.indexOf(id); return i < 0 ? 99 : i; };
  return [...S.templates].sort((a, b) => r(a.id) - r(b.id));
}
export function templatePicker(extra) {
  const tpls = sortedTemplates();
  openSheet('Tạo ghi chú', `<button class="tpl-row blank" data-t="">${ic('note')}<span class="grow"><b>Ghi chú trống</b><small>Viết tự do</small></span></button>
    <div class="sh-label">Từ mẫu <button class="link" data-manage>Quản lý mẫu</button></div>
    ${tpls.map(t => `<button class="tpl-row" data-t="${t.id}"><span class="emo">${esc(t.icon || '📝')}</span><span class="grow"><b>${esc(t.name)}</b><small>${esc((t.body || '').split('\n').filter(Boolean).slice(0, 2).join(' · ').slice(0, 70))}</small></span>${ic('chev')}</button>`).join('')}`, (b, close) => {
    b.querySelectorAll('[data-t]').forEach(x => x.onclick = () => { close(); createFrom(S.templates.find(t => t.id === x.dataset.t), extra); });
    b.querySelector('[data-manage]').onclick = () => { close(); push({ v: 'templates' }); };
  });
}
export { flush };
