// Sổ Việc – khởi động, thanh tiêu đề, điều hướng
import { S, load, flush, alive, saveKV } from './store.js';
import { nav, cur, push, pop } from './nav.js';
import { F, setF, countActive } from './filter.js';
import { viewHome } from './list.js';
import { viewNote, leaveNote, noteMenu } from './editor.js';
import { viewTags, viewTemplates, viewTemplate, viewTrash, viewSettings } from './pages.js';
import { templatePicker } from './actions.js';
import { closeTopSheet, closePhoto, menu, toast } from './ui.js';
import { onBack, onPause, setBars, native } from './platform.js';
import { $, esc, dayLabel, today } from './util.js';
import { ic } from './icons.js';

const TITLES = { home: 'Ghi chú', note: 'Ghi chú', tags: 'Thẻ', templates: 'Mẫu ghi chú', tpl: 'Sửa mẫu', trash: 'Thùng rác', settings: 'Cài đặt' };

function render() {
  const r = cur(); const v = $('#view'); const isHome = r.v === 'home';
  document.body.classList.toggle('editing', r.v === 'note');
  $('#btnBack').hidden = isHome;
  $('#fab').hidden = !isHome;
  $('#tbEyebrow').textContent = isHome ? dayLabel(today()).toUpperCase() : 'SỔ VIỆC';
  $('#tbTitle').textContent = TITLES[r.v] || 'Ghi chú';
  const right = $('#tbRight');
  if (isHome) right.innerHTML = `<button class="icon-btn" id="btnView" aria-label="Đổi kiểu xem" title="Danh sách / Dòng thời gian">${ic(S.settings.view === 'timeline' ? 'list' : 'timeline')}</button><button class="icon-btn" id="btnMenu" aria-label="Menu">${ic('menu')}</button>`;
  else if (r.v === 'note') right.innerHTML = `<button class="icon-btn" id="btnNoteMenu" aria-label="Tùy chọn ghi chú">${ic('dots')}</button>`;
  else right.innerHTML = '';
  const bv = $('#btnView'); if (bv) bv.onclick = () => { S.settings.view = S.settings.view === 'timeline' ? 'list' : 'timeline'; saveKV('settings'); toast(S.settings.view === 'timeline' ? 'Xem theo dòng thời gian' : 'Xem dạng danh sách'); render(); };
  const bm = $('#btnMenu'); if (bm) bm.onclick = mainMenu;
  const bn = $('#btnNoteMenu'); if (bn) bn.onclick = () => noteMenu(r.id);
  if (r.v === 'home') viewHome(v);
  else if (r.v === 'note') viewNote(v, r);
  else if (r.v === 'tags') viewTags(v);
  else if (r.v === 'templates') viewTemplates(v);
  else if (r.v === 'tpl') viewTemplate(v, r.id);
  else if (r.v === 'trash') viewTrash(v);
  else if (r.v === 'settings') viewSettings(v);
}
nav.render = render;
nav.onLeave = r => { if (r.v === 'note') { leaveNote(r.id); flush(); } };

function mainMenu() {
  const nTrash = S.notes.filter(n => n.deleted).length;
  menu('Sổ Việc', [
    { icon: 'hash', label: 'Thẻ', hint: String(new Set(alive().flatMap(n => n.tags)).size || ''), run: () => push({ v: 'tags' }) },
    { icon: 'layers', label: 'Mẫu ghi chú', hint: String(S.templates.length), run: () => push({ v: 'templates' }) },
    { icon: 'trash', label: 'Thùng rác', hint: nTrash ? String(nTrash) : '', run: () => push({ v: 'trash' }) },
    { icon: 'gear', label: 'Cài đặt & sao lưu', run: () => push({ v: 'settings' }) },
  ]);
}

// giao diện sáng / tối
const mq = window.matchMedia('(prefers-color-scheme: light)');
nav.applyTheme = () => {
  const t = S.settings.theme === 'auto' ? (mq.matches ? 'light' : 'dark') : S.settings.theme;
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name=theme-color]').content = t === 'light' ? '#F4F6FA' : '#0E1116';
  setBars(t);
};
mq.addEventListener && mq.addEventListener('change', () => nav.applyTheme());

function back() {
  if (closePhoto()) return true;
  if (closeTopSheet()) return true;
  if (pop()) return true;
  if (F.q || countActive()) { const s = F.sort; setF({}); F.sort = s; render(); return true; } // bỏ lọc trước khi thoát
  return false;
}

async function init() {
  $('#btnBack').innerHTML = ic('back');
  $('#fab').innerHTML = ic('plus', 2.4);
  $('#btnBack').onclick = () => pop();
  $('#fab').onclick = () => templatePicker({ tags: F.tags });
  try { await load(); }
  catch (e) { $('#view').innerHTML = `<div class="empty">Không mở được bộ nhớ của app.<br><small>${esc(e.message || e)}</small></div>`; return; }
  nav.applyTheme();
  onBack(back);
  onPause(() => flush());
  window.addEventListener('beforeunload', () => flush());
  // phím tắt trên máy tính
  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n' && cur().v === 'home') { e.preventDefault(); templatePicker({ tags: F.tags }); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && cur().v === 'home') { e.preventDefault(); $('#sIn') && $('#sIn').focus(); }
  });
  render();
  if (!native && 'serviceWorker' in navigator && location.protocol.startsWith('http') && !/localhost|127\.0\.0\.1/.test(location.hostname)) navigator.serviceWorker.register('sw.js').catch(() => {});
}
init();
