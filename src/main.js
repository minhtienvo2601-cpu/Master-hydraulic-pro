import JSZip from 'jszip';
import { S, load, save, saveNow, reschedule, task, device, node } from './store.js';
import { nav, go, push, pop, cur } from './nav.js';
import { ic } from './icons.js';
import { $, $$, esc, today, matcher, highlight, snippet, fileKind, dueLabel } from './util.js';
import { toast, busy, confirmBox, sheetOpen, closeTopSheet, closePhoto, openSheet } from './ui.js';
import { viewHome, viewTasks, taskForm } from './tasks.js';
import { viewDevices, viewDevice, deviceForm } from './devices.js';
import { viewParts, openF } from './parts.js';
import { viewRef, viewRefSec, refTitle, clearRefQ } from './ref.js';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { native, notifInit, onBack, readB64, saveB64, shareFile, pickFiles, testNotif, exactAlarmStatus, openExactAlarmSetting } from './platform.js';

const TABS = { home: ['home', 'Tổng quan'], tasks: ['tasks', 'Công việc'], devices: ['device', 'Thiết bị'], parts: ['parts', 'Vật tư'], ref: ['ref', 'Tra cứu'] };

function render() {
  const r = cur(); const v = $('#view');
  $$('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === nav.tab));
  const sub = nav.stack.length > 0 || (nav.tab === 'parts' && nav.partsNode !== 'root');
  $('#btnBack').hidden = !sub;
  $('#fab').hidden = ['search', 'settings', 'ref', 'refsec'].includes(r.v);
  let title = TABS[nav.tab]?.[1] || '', eyebrow = 'BẢO TRÌ THỦY LỰC';
  if (r.v === 'home') viewHome(v);
  else if (r.v === 'tasks') viewTasks(v);
  else if (r.v === 'devices') viewDevices(v);
  else if (r.v === 'parts') { viewParts(v); eyebrow = 'SƠ ĐỒ VẬT TƯ'; }
  else if (r.v === 'device') { const d = device(r.id); title = 'Hồ sơ thiết bị'; eyebrow = 'THIẾT BỊ'; viewDevice(v, r.id); }
  else if (r.v === 'search') { title = 'Tìm kiếm'; eyebrow = 'TÌM NHANH'; viewSearch(v); }
  else if (r.v === 'settings') { title = 'Cài đặt'; eyebrow = 'ỨNG DỤNG'; viewSettings(v); }
  else if (r.v === 'ref') { eyebrow = 'KỸ THUẬT THỦY LỰC'; viewRef(v); }
  else if (r.v === 'refsec') { title = refTitle(r.k); eyebrow = 'TRA CỨU'; viewRefSec(v, r.k); }
  $('#tbTitle').textContent = title; $('#tbEyebrow').textContent = eyebrow;
}
nav.render = render;

function fabAction() {
  const r = cur();
  if (r.v === 'devices') deviceForm(null);
  else if (r.v === 'parts') $('[data-a=branch]')?.click();
  else if (r.v === 'device') taskForm(null, { deviceId: r.id });
  else taskForm(null);
}

// ---------- tìm kiếm ----------
let lastQ = '';
function viewSearch(v) {
  v.innerHTML = `<div class="searchbox">${ic('search')}<input id="q" placeholder="Mã vật tư, tên file, công việc, thiết bị…" value="${esc(lastQ)}" autocomplete="off"></div>
    <div class="muted" style="font-size:12.5px;margin:8px 4px 0">Tìm không cần gõ dấu. Mã có thể gõ liền hoặc có gạch: 425251745 = 425-251-745</div><div id="res" style="margin-top:14px"></div>`;
  const inp = $('#q', v); setTimeout(() => inp.focus(), 50);
  let t = null; inp.oninput = () => { clearTimeout(t); t = setTimeout(() => { lastQ = inp.value; doSearch($('#res', v), lastQ); }, 160); };
  doSearch($('#res', v), lastQ);
}
function doSearch(box, q) {
  q = q.trim(); if (q.length < 2) { box.innerHTML = `<div class="empty">${ic('search')}Gõ ít nhất 2 ký tự để tìm</div>`; return; }
  const m = matcher(q); const hits = [];
  for (const t of S.state.tasks) if (m(t.title) || m(t.note)) hits.push({ k: 'Công việc', t: t.title, s: t.done ? 'Đã xong' : dueLabel(t.due).t, go: () => taskForm(t) });
  for (const d of S.state.devices) if (m(d.name) || m(d.code) || m(d.location) || m(d.note)) hits.push({ k: 'Thiết bị', t: d.name, s: [d.code, d.location].filter(Boolean).join(' · '), go: () => { nav.tab = 'devices'; nav.stack = [{ v: 'device', id: d.id }]; render(); } });
  const toNode = n => () => { nav.partsNode = n.id; nav.tab = 'parts'; nav.stack = []; render(); };
  for (const n of S.state.nodes) {
    if (m(n.name)) hits.push({ k: 'Nhánh vật tư', t: n.name, s: `${n.files.length} file`, go: toNode(n) });
    if (n.codes) n.codes.split('\n').filter(l => m(l)).slice(0, 5).forEach(l => hits.push({ k: 'Mã vật tư · ' + n.name, t: l, raw: true, go: toNode(n) }));
    for (const f of n.files) {
      if (m(f.name)) hits.push({ k: 'File · ' + n.name, t: f.name, s: fileKind(f.name)[1], go: () => openF(f) });
      const idx = S.index[f.id];
      if (idx) { let c = 0; for (const line of idx) { if (m(line)) { hits.push({ k: `Trong file · ${f.name}`, t: snippet(line, q), raw: true, go: () => { toast(line.split(':')[0]); openF(f); } }); if (++c >= 8) break; } } }
    }
    for (const l of n.links) if (m(l.title) || m(l.url)) hits.push({ k: 'Liên kết · ' + n.name, t: l.title, s: 'OneDrive', go: toNode(n) });
  }
  if (!hits.length) { box.innerHTML = `<div class="empty">${ic('search')}Không tìm thấy “${esc(q)}”<br><span style="font-size:12.5px">Mẹo: nhập mã vật tư vào mục “Mã vật tư & ghi chú” của nhánh để tìm được.</span></div>`; return; }
  box.innerHTML = `<div class="muted" style="font-size:12.5px;margin:0 4px 8px">${hits.length} kết quả</div>` + hits.slice(0, 120).map((h, i) =>
    `<div class="hit" data-h="${i}"><div class="k">${esc(h.k)}</div><div class="${h.raw ? 's' : 't'}">${highlight(h.t, q)}</div>${h.s ? `<div class="muted" style="font-size:12.5px;margin-top:3px">${esc(h.s)}</div>` : ''}</div>`).join('');
  $$('[data-h]', box).forEach(el => el.onclick = () => hits[+el.dataset.h].go());
}

// ---------- cài đặt ----------
async function viewSettings(v) {
  const st = S.state.settings;
  const nFiles = S.state.nodes.reduce((s, n) => s + n.files.length, 0);
  const th = st.theme || 'dark';
  v.innerHTML = `<div class="fade-in">
    <div class="sec-h" style="margin-top:6px"><h2>Giao diện</h2></div>
    <div class="set-group"><div class="themeseg">
      <button data-theme-opt="dark" class="${th === 'dark' ? 'on' : ''}">${ic('moon')}Tối</button>
      <button data-theme-opt="light" class="${th === 'light' ? 'on' : ''}">${ic('sun')}Sáng</button>
      <button data-theme-opt="auto" class="${th === 'auto' ? 'on' : ''}">${ic('auto')}Theo máy</button></div></div>
    <div class="sec-h"><h2>Cá nhân</h2></div>
    <div class="set-group"><div class="set-row"><div class="ic">${ic('user')}</div><div class="grow"><div class="tt">Tên hiển thị</div><div class="ds">Hiện ở lời chào trang Tổng quan</div></div>
      <input id="sName" value="${esc(st.name)}" placeholder="Tên của bạn" style="width:130px"></div></div>
    <div class="sec-h"><h2>Nhắc việc</h2></div>
    <div class="set-group">
      <div class="set-row"><div class="ic">${ic('bell')}</div><div class="grow"><div class="tt">Nhắc trước hạn</div><div class="ds">Thông báo trước ngày đến hạn</div></div>
        <select id="sDays">${[1, 2, 3, 5, 7].map(d => `<option value="${d}" ${+st.remindDays === d ? 'selected' : ''}>${d} ngày</option>`).join('')}</select></div>
      <div class="set-row"><div class="ic">${ic('clock')}</div><div class="grow"><div class="tt">Giờ nhắc</div><div class="ds">Giờ trong ngày sẽ hiện thông báo</div></div>
        <input type="time" id="sTime" value="${st.remindTime}" style="color-scheme:dark"></div>
      <div class="set-row"><div class="ic">${ic('cal')}</div><div class="grow"><div class="tt">Nhắc thêm vào ngày đến hạn</div><div class="ds">Thêm một thông báo sáng ngày đến hạn</div></div>
        <input type="checkbox" id="sDue" ${st.dueDay ? 'checked' : ''} style="width:22px;height:22px;accent-color:#D4B06A"></div>
      <button class="set-row" id="sTest" style="width:100%;text-align:left"><div class="ic">${ic('bell')}</div><div class="grow"><div class="tt">Gửi thông báo thử</div><div class="ds">Kiểm tra điện thoại có hiện thông báo không</div></div>${ic('chev')}</button>
      <button class="set-row" id="sExact" style="width:100%;text-align:left"><div class="ic">${ic('alert')}</div><div class="grow"><div class="tt">Cho phép nhắc đúng giờ</div><div class="ds" id="sExactDs">Đang kiểm tra…</div></div>${ic('chev')}</button>
    </div>
    <div class="sec-h"><h2>Dữ liệu</h2></div>
    <div class="set-group">
      <button class="set-row" id="sBackup" style="width:100%;text-align:left"><div class="ic">${ic('backup')}</div><div class="grow"><div class="tt">Sao lưu toàn bộ dữ liệu</div><div class="ds">${S.state.tasks.length} việc · ${S.state.devices.length} thiết bị · ${nFiles} file → 1 file .zip, gửi lên OneDrive/Zalo</div></div>${ic('chev')}</button>
      <button class="set-row" id="sRestore" style="width:100%;text-align:left"><div class="ic">${ic('restore')}</div><div class="grow"><div class="tt">Khôi phục từ file sao lưu</div><div class="ds">Dùng khi đổi điện thoại hoặc cài lại app</div></div>${ic('chev')}</button>
    </div>
    <div class="muted" style="text-align:center;font-size:12px;margin-top:18px">Bảo Trì Thủy Lực · phiên bản 1.0<br>Dữ liệu lưu trên điện thoại, không cần mạng</div></div>`;
  const q = s => v.querySelector(s);
  $$('[data-theme-opt]', v).forEach(b => b.onclick = () => { st.theme = b.dataset.themeOpt; save(); applyTheme(); render(); });
  q('#sName').onchange = e => { st.name = e.target.value.trim(); save(); };
  q('#sDays').onchange = e => { st.remindDays = +e.target.value; save(); toast('Đã cập nhật lịch nhắc'); };
  q('#sTime').onchange = e => { st.remindTime = e.target.value || '07:00'; save(); toast('Đã cập nhật giờ nhắc'); };
  q('#sDue').onchange = e => { st.dueDay = e.target.checked; save(); };
  q('#sTest').onclick = async () => { if (await testNotif()) toast('Thông báo sẽ hiện sau 3 giây'); else toast('Chỉ hoạt động trên điện thoại'); };
  const ex = await exactAlarmStatus();
  q('#sExactDs').textContent = ex === 'granted' ? '✔ Đã bật – thông báo hiện đúng giờ' : 'Chưa bật – thông báo có thể trễ vài phút. Chạm để bật';
  q('#sExact').onclick = async () => { await openExactAlarmSetting(); };
  q('#sBackup').onclick = backup;
  q('#sRestore').onclick = restore;
}

async function backup() {
  const b = busy('Đang tạo file sao lưu…');
  try {
    const zip = new JSZip();
    zip.file('data.json', JSON.stringify({ app: 'baotri', v: 1, at: new Date().toISOString(), state: S.state, index: S.index }));
    const paths = [...S.state.nodes.flatMap(n => n.files.map(f => f.path)), ...S.state.tasks.flatMap(t => t.photos || [])];
    for (let i = 0; i < paths.length; i++) {
      b.set(`Đang đóng gói ${i + 1}/${paths.length}…`);
      try { const d = await readB64(paths[i]); if (d != null) zip.file(paths[i], d, { base64: true }); } catch (e) { console.warn('skip', paths[i]); }
    }
    b.set('Đang nén…');
    const out = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE', compressionOptions: { level: 5 } });
    b.done();
    await shareFile(`BaoTri_saoluu_${today()}.zip`, out, 'application/zip');
  } catch (e) { b.done(); if (!String(e).match(/cancel/i)) toast('Lỗi sao lưu: ' + (e.message || e)); }
}
async function restore() {
  const [f] = await pickFiles('application/zip,.zip', false); if (!f) return;
  let zip; try { zip = await JSZip.loadAsync(f); } catch (e) { toast('File không phải bản sao lưu hợp lệ'); return; }
  const dj = zip.file('data.json'); if (!dj) { toast('Không tìm thấy dữ liệu trong file'); return; }
  const data = JSON.parse(await dj.async('string'));
  if (!data.state?.nodes) { toast('File sao lưu không hợp lệ'); return; }
  if (!await confirmBox('Khôi phục dữ liệu?', `Bản sao lưu ngày ${esc((data.at || '').slice(0, 10))}: ${data.state.tasks.length} việc, ${data.state.devices.length} thiết bị. Dữ liệu hiện tại trên máy sẽ bị thay thế.`, 'Khôi phục', true)) return;
  const b = busy('Đang khôi phục…');
  try {
    const entries = Object.values(zip.files).filter(e => !e.dir && e.name !== 'data.json');
    for (let i = 0; i < entries.length; i++) { b.set(`Đang giải nén ${i + 1}/${entries.length}…`); await saveB64(entries[i].name, await entries[i].async('base64')); }
    S.state = data.state; S.index = data.index || {}; await saveNow();
    b.done(); nav.partsNode = 'root'; go('home'); toast('✔ Đã khôi phục dữ liệu');
  } catch (e) { b.done(); toast('Lỗi khôi phục: ' + (e.message || e)); }
}

// ---------- giao diện sáng / tối ----------
const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
function applyTheme() {
  const pref = S.state.settings.theme || 'dark';
  const t = pref === 'auto' ? (mq && mq.matches ? 'light' : 'dark') : pref;
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'light' ? '#F3F0E8' : '#0B111A');
  if (native) SystemBars.setStyle({ style: t === 'light' ? SystemBarsStyle.Light : SystemBarsStyle.Dark }).catch(() => {});
}
mq && mq.addEventListener && mq.addEventListener('change', () => { if ((S.state.settings.theme || 'dark') === 'auto') applyTheme(); });

// ---------- khởi động ----------
async function init() {
  $('#btnBack').innerHTML = ic('back'); $('#btnSearch').innerHTML = ic('search'); $('#btnSettings').innerHTML = ic('settings'); $('#fab').innerHTML = ic('plus', 2.4);
  $$('#tabbar button').forEach(b => { const [i, l] = TABS[b.dataset.tab]; b.innerHTML = ic(i) + `<span>${l}</span>`; b.onclick = () => { if (b.dataset.tab === 'ref') clearRefQ(); if (b.dataset.tab === 'parts' && nav.tab === 'parts' && !nav.stack.length) nav.partsNode = 'root'; go(b.dataset.tab); }; });
  $('#btnBack').onclick = () => { if (pop()) return; if (nav.tab === 'parts' && nav.partsNode !== 'root') { nav.partsNode = node(nav.partsNode)?.parentId || 'root'; render(); } };
  $('#btnSearch').onclick = () => { if (cur().v !== 'search') push({ v: 'search' }); };
  $('#btnSettings').onclick = () => { if (cur().v !== 'settings') push({ v: 'settings' }); };
  $('#fab').onclick = fabAction;
  await load();
  applyTheme();
  render();
  onBack(() => {
    if (closePhoto()) return true;
    if (sheetOpen()) { closeTopSheet(); return true; }
    if (pop()) return true;
    if (nav.tab === 'parts' && nav.partsNode !== 'root') { nav.partsNode = node(nav.partsNode)?.parentId || 'root'; render(); return true; }
    if (nav.tab !== 'home') { go('home'); return true; }
    return false;
  });
  await notifInit(extra => { const t = extra.taskId && task(extra.taskId); if (t) { go('tasks'); taskForm(t); } });
  reschedule();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
}
init();
