import JSZip from 'jszip';
import { S, load, save, saveNow, reschedule, task, device, node, tpl, TPL_DEFAULT } from './store.js';
import { nav, go, push, pop, cur } from './nav.js';
import { ic } from './icons.js';
import { $, $$, esc, today, matcher, highlight, snippet, fileKind, dueLabel } from './util.js';
import { toast, busy, confirmBox, sheetOpen, closeTopSheet, closePhoto, openSheet, promptBox } from './ui.js';
import { viewHome, viewTasks, taskForm } from './tasks.js';
import { viewDevices, viewDevice, deviceForm } from './devices.js';
import { viewParts, openF } from './parts.js';
import { viewRef, viewRefSec, refTitle, clearRefQ } from './ref.js';
import { viewNotes, viewNote, noteMenu, newNoteAndOpen, cleanupNote, note } from './notes.js';
import { viewJournal, viewBuy, backlogForm } from './journal.js';
import { closeViewer, deliver } from './viewer.js';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { persist } from './webstore.js';
import { native, notifInit, onBack, readB64, saveB64, pickFiles, clearExports, testNotif, exactAlarmStatus, openExactAlarmSetting, fileSrc, deletePath } from './platform.js';

const TABS = { home: ['home', 'Tổng quan'], journal: ['journal', 'Nhật ký'], notes: ['note', 'Ghi chú'], parts: ['folder', 'Tài liệu'], more: ['grid', 'Thêm'], tasks: ['tasks', 'Công việc'], devices: ['device', 'Thiết bị'], ref: ['ref', 'Tra cứu'] };
const TABHL = { tasks: 'more', devices: 'more', ref: 'more' };

function render() {
  const r = cur(); const v = $('#view');
  markTab();
  document.body.classList.toggle('editing', r.v === 'note');
  $('#btnMenu').hidden = r.v !== 'note'; $('#btnSearch').hidden = r.v === 'note'; $('#btnSettings').hidden = r.v === 'note';
  const sub = nav.stack.length > 0 || (nav.tab === 'parts' && nav.partsNode !== 'root');
  $('#btnBack').hidden = !sub;
  $('#fab').hidden = ['search', 'settings', 'tpl', 'ref', 'refsec', 'more', 'note', 'buy'].includes(r.v);
  let title = TABS[nav.tab]?.[1] || '', eyebrow = 'BẢO TRÌ THỦY LỰC';
  if (r.v === 'home') viewHome(v);
  else if (r.v === 'journal') { eyebrow = 'KẾ HOẠCH & TỒN ĐỌNG'; viewJournal(v); }
  else if (r.v === 'notes') { eyebrow = 'SỔ TAY KỸ THUẬT'; viewNotes(v); }
  else if (r.v === 'note') { title = 'Ghi chú'; eyebrow = (S.state.noteCats.find(c => c.id === note(r.id)?.cat)?.name || 'GHI CHÚ').toUpperCase(); viewNote(v, r.id, r.fresh); r.fresh = false; }
  else if (r.v === 'more') { title = 'Tiện ích'; viewMore(v); }
  else if (r.v === 'buy') { title = 'Vật tư cần mua'; eyebrow = 'TỪ TỒN ĐỌNG'; viewBuy(v); }
  else if (r.v === 'tasks') viewTasks(v);
  else if (r.v === 'devices') viewDevices(v);
  else if (r.v === 'parts') { viewParts(v); eyebrow = 'SƠ ĐỒ TÀI LIỆU'; }
  else if (r.v === 'device') { const d = device(r.id); title = 'Hồ sơ thiết bị'; eyebrow = 'THIẾT BỊ'; viewDevice(v, r.id); }
  else if (r.v === 'search') { title = 'Tìm kiếm'; eyebrow = 'TÌM NHANH'; viewSearch(v); }
  else if (r.v === 'settings') { title = 'Cài đặt'; eyebrow = 'ỨNG DỤNG'; viewSettings(v); }
  else if (r.v === 'tpl') { title = 'Mẫu biên bản'; eyebrow = 'CÀI ĐẶT'; viewTpl(v); }
  else if (r.v === 'ref') { eyebrow = 'KỸ THUẬT THỦY LỰC'; viewRef(v); }
  else if (r.v === 'refsec') { title = refTitle(r.k); eyebrow = 'TRA CỨU'; viewRefSec(v, r.k); }
  $('#tbTitle').textContent = title; $('#tbEyebrow').textContent = eyebrow;
}
nav.render = render;
function markTab() {
  const direct = document.querySelector(`#tabbar button[data-tab="${nav.tab}"]`);
  const t = direct && direct.offsetParent !== null ? nav.tab : (TABHL[nav.tab] || nav.tab);
  $$('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
}

function fabAction() {
  const r = cur();
  if (r.v === 'devices') deviceForm(null);
  else if (r.v === 'notes') newNoteAndOpen();
  else if (r.v === 'journal') taskForm(null, { due: today() });
  else if (r.v === 'parts') $('[data-a=branch]')?.click();
  else if (r.v === 'device') taskForm(null, { deviceId: r.id });
  else taskForm(null);
}

function leaving() { const r = cur(); if (r.v === 'note') cleanupNote(r.id); }

// ---------- mục Thêm ----------
function viewMore(v) {
  const ob = S.state.backlog.filter(b => !b.resolved && b.reason === 'vattu').length;
  const tiles = [
    ['tasks', 'tasks', 'Công việc', `${S.state.tasks.filter(t => !t.done).length} việc đang mở`],
    ['devices', 'device', 'Thiết bị', `${S.state.devices.length} thiết bị · hồ sơ & lịch sử`],
    ['ref', 'ref', 'Tra cứu kỹ thuật', 'Ống SCH, ren, ống mềm, đổi đơn vị…'],
    ['buy', 'cart', 'Vật tư cần mua', ob ? `${ob} mục đang chờ vật tư` : 'Gom từ tồn đọng “chờ vật tư”'],
    ['search', 'search', 'Tìm kiếm', 'Tìm mọi thứ theo mã, tên…'],
    ['settings', 'settings', 'Cài đặt & sao lưu', 'Giao diện, nhắc việc, sao lưu'],
  ];
  v.innerHTML = `<div class="fade-in"><div class="brand"><img src="logo.png" alt=""><div><b>Bảo Trì Thủy Lực</b><span>${esc(S.state.settings.name || 'Sổ tay bảo trì thiết bị thủy lực')}</span></div></div>
    <div class="refgrid">${tiles.map(([k, i, t, d]) => `<button class="refcard" data-go="${k}"><div class="ri">${ic(i)}</div><div class="rt">${t}</div><div class="rd">${d}</div></button>`).join('')}</div></div>`;
  $$('[data-go]', v).forEach(b => b.onclick = () => { const k = b.dataset.go; if (['tasks', 'devices', 'ref'].includes(k)) { if (k === 'ref') clearRefQ(); go(k); } else push({ v: k }); });
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
  for (const n of S.state.notes) {
    const blob = [n.title, n.qa?.po, n.qa?.supplier].join(' ');
    if (m(blob)) hits.push({ k: 'Ghi chú', t: n.title || 'Ghi chú không tên', s: n.updated.slice(0, 10), go: () => push({ v: 'note', id: n.id }) });
    for (const b of n.blocks) {
      if (b.t === 'img' && ((b.codes || []).some(c => m(c)) || m(b.caption) || m(b.name))) hits.push({ k: 'Ảnh vật tư · ' + (n.title || 'Ghi chú'), t: [(b.codes || []).join(', '), b.name, b.caption].filter(Boolean).join(' – '), raw: true, go: () => push({ v: 'note', id: n.id }) });
      else if (b.t !== 'img' && m(b.text)) hits.push({ k: 'Trong ghi chú · ' + (n.title || 'Ghi chú'), t: snippet(b.text, q), raw: true, go: () => push({ v: 'note', id: n.id }) });
    }
  }
  for (const b of S.state.backlog) if (m(b.desc) || m(b.parts) || m(b.action)) hits.push({ k: b.resolved ? 'Tồn đọng · đã xử lý' : 'Tồn đọng', t: b.desc, s: b.parts, go: () => backlogForm(b) });
  const toNode = n => () => { nav.partsNode = n.id; nav.tab = 'parts'; nav.stack = []; render(); };
  for (const n of S.state.nodes) {
    if (m(n.name)) hits.push({ k: 'Nhánh tài liệu', t: n.name, s: `${n.files.length} file`, go: toNode(n) });
    if (n.codes) n.codes.split('\n').filter(l => m(l)).slice(0, 5).forEach(l => hits.push({ k: 'Mã / từ khóa · ' + n.name, t: l, raw: true, go: toNode(n) }));
    for (const f of n.files) {
      if (m(f.name)) hits.push({ k: 'File · ' + n.name, t: f.name, s: fileKind(f.name)[1], go: () => openF(f) });
      const idx = S.index[f.id];
      if (idx) { let c = 0; for (const line of idx) { if (m(line)) { hits.push({ k: `Trong file · ${f.name}`, t: snippet(line, q), raw: true, go: () => { toast(line.split(':')[0]); openF(f); } }); if (++c >= 8) break; } } }
    }
    for (const l of n.links) if (m(l.title) || m(l.url)) hits.push({ k: 'Liên kết · ' + n.name, t: l.title, s: 'OneDrive', go: toNode(n) });
  }
  if (!hits.length) { box.innerHTML = `<div class="empty">${ic('search')}Không tìm thấy “${esc(q)}”<br><span style="font-size:12.5px">Mẹo: nhập mã vào mục “Mã / từ khóa & ghi chú” của nhánh tài liệu để tìm được.</span></div>`; return; }
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
      <input id="sName" value="${esc(st.name)}" placeholder="Tên của bạn" style="width:130px"></div>
      <div class="set-row" style="flex-wrap:wrap"><div class="ic">${ic('home')}</div><div class="grow"><div class="tt">Tên đơn vị</div><div class="ds">In ở đầu biên bản, báo cáo</div></div>
        <input id="sOrg" value="${esc(st.org || '')}" placeholder="VD: Công ty CP ABC" style="width:100%;margin-left:48px"></div>
      <div class="set-row" style="flex-wrap:wrap"><div class="ic">${ic('user')}</div><div class="grow"><div class="tt">Bộ phận</div><div class="ds">Dòng thứ hai dưới tên đơn vị (tùy chọn)</div></div>
        <input id="sDept" value="${esc(st.dept || '')}" placeholder="VD: Xưởng HSM – Tổ bảo trì thủy lực" style="width:100%;margin-left:48px"></div></div>
    <div class="sec-h"><h2>Biên bản & báo cáo</h2></div>
    <div class="set-group">
      <div class="set-row" style="flex-wrap:wrap"><div class="logo-prev"><img id="sLogoImg" alt=""></div>
        <div class="grow"><div class="tt">Logo in trên biên bản</div><div class="ds">${st.logoPath ? 'Đang dùng logo riêng của bạn' : 'Đang dùng logo mặc định của app'}</div></div>
        <div class="btn-row" style="width:100%;margin-top:10px"><button class="btn sec" id="sLogo" style="height:44px;font-size:14px">${ic('upload')} Chọn logo</button>
          <button class="btn sec" id="sLogoRst" style="height:44px;font-size:14px" ${st.logoPath ? '' : 'disabled'}>${ic('restore')} Logo mặc định</button></div></div>
      <button class="set-row" id="sTpl" style="width:100%;text-align:left"><div class="ic">${ic('edit')}</div><div class="grow"><div class="tt">Mẫu biên bản</div><div class="ds">Sửa tiêu đề, tên các phần, nhãn, chức danh ký tên…</div></div>${ic('chev')}</button>
      <div class="set-row" style="flex-wrap:wrap"><div class="ic">${ic('note')}</div><div class="grow"><div class="tt">Dòng chân trang</div><div class="ds">In cuối mỗi trang (để trống = không in)</div></div>
        <input id="sFoot" value="${esc(st.footer == null ? 'Lập bằng ứng dụng Bảo Trì Thủy Lực' : st.footer)}" placeholder="VD: Tổ bảo trì thủy lực – HSM" style="width:100%;margin-left:48px"></div>
    </div>
    ${native ? '' : `<div class="sec-h"><h2>Máy tính</h2></div>
    <div class="set-group">
      ${installEvt && !standalone() ? `<button class="set-row" id="sInstall" style="width:100%;text-align:left"><div class="ic">${ic('save')}</div><div class="grow"><div class="tt">Cài ứng dụng lên máy tính</div><div class="ds">Có biểu tượng trên màn hình, mở như phần mềm, dùng được khi mất mạng</div></div>${ic('chev')}</button>` : ''}
      <div class="set-row"><div class="ic">${ic('alert')}</div><div class="grow"><div class="tt">Dữ liệu lưu trong trình duyệt của máy này</div><div class="ds">Chuyển dữ liệu từ điện thoại: điện thoại <b>Sao lưu</b> → gửi file .zip sang máy tính → bấm <b>Khôi phục</b> bên dưới. Đừng xóa dữ liệu duyệt web của trang này.</div></div></div>
      <div class="set-row"><div class="ic">${ic('bell')}</div><div class="grow"><div class="tt">Nhắc việc</div><div class="ds">Thông báo nhắc việc chỉ có trên điện thoại</div></div></div>
    </div>`}
    <div class="sec-h" ${native ? '' : 'hidden'}><h2>Nhắc việc</h2></div>
    <div class="set-group" ${native ? '' : 'hidden'}>
      <div class="set-row"><div class="ic">${ic('bell')}</div><div class="grow"><div class="tt">Nhắc trước hạn</div><div class="ds">Thông báo trước ngày đến hạn</div></div>
        <select id="sDays">${[1, 2, 3, 5, 7].map(d => `<option value="${d}" ${+st.remindDays === d ? 'selected' : ''}>${d} ngày</option>`).join('')}</select></div>
      <div class="set-row"><div class="ic">${ic('clock')}</div><div class="grow"><div class="tt">Giờ nhắc</div><div class="ds">Giờ trong ngày sẽ hiện thông báo</div></div>
        <input type="time" id="sTime" value="${st.remindTime}" style="color-scheme:dark"></div>
      <div class="set-row"><div class="ic">${ic('cal')}</div><div class="grow"><div class="tt">Nhắc thêm vào ngày đến hạn</div><div class="ds">Thêm một thông báo sáng ngày đến hạn</div></div>
        <input type="checkbox" id="sDue" ${st.dueDay ? 'checked' : ''} style="width:22px;height:22px;accent-color:var(--gold)"></div>
      <button class="set-row" id="sTest" style="width:100%;text-align:left"><div class="ic">${ic('bell')}</div><div class="grow"><div class="tt">Gửi thông báo thử</div><div class="ds">Kiểm tra điện thoại có hiện thông báo không</div></div>${ic('chev')}</button>
      <button class="set-row" id="sExact" style="width:100%;text-align:left"><div class="ic">${ic('alert')}</div><div class="grow"><div class="tt">Cho phép nhắc đúng giờ</div><div class="ds" id="sExactDs">Đang kiểm tra…</div></div>${ic('chev')}</button>
    </div>
    <div class="sec-h"><h2>Dữ liệu</h2></div>
    <div class="set-group">
      <button class="set-row" id="sBackup" style="width:100%;text-align:left"><div class="ic">${ic('backup')}</div><div class="grow"><div class="tt">Sao lưu toàn bộ dữ liệu</div><div class="ds">${S.state.tasks.length} việc · ${S.state.notes.length} ghi chú · ${S.state.devices.length} thiết bị · ${nFiles} file → 1 file .zip</div></div>${ic('chev')}</button>
      <div class="set-row" ${native ? '' : 'hidden'}><div class="ic">${ic('bell')}</div><div class="grow"><div class="tt">Nhắc sao lưu hằng tuần</div><div class="ds">Thông báo 8:00 sáng thứ 2</div></div>
        <input type="checkbox" id="sBk" ${st.backupRemind !== false ? 'checked' : ''} style="width:22px;height:22px;accent-color:var(--gold)"></div>
      <button class="set-row" id="sRestore" style="width:100%;text-align:left"><div class="ic">${ic('restore')}</div><div class="grow"><div class="tt">Khôi phục từ file sao lưu</div><div class="ds">Dùng khi đổi điện thoại hoặc cài lại app</div></div>${ic('chev')}</button>
    </div>
    <div class="about"><img src="logo.png" alt=""><div><b>Bảo Trì Thủy Lực</b><br><span>Phiên bản 2.0 · ${native ? 'dữ liệu lưu trên điện thoại' : 'bản máy tính · dữ liệu lưu trên máy này'}, không cần mạng</span></div></div></div>`;
  const q = s => v.querySelector(s);
  $$('[data-theme-opt]', v).forEach(b => b.onclick = () => { st.theme = b.dataset.themeOpt; save(); applyTheme(); render(); });
  q('#sName').onchange = e => { st.name = e.target.value.trim(); save(); };
  (async () => { const im = q('#sLogoImg'); im.src = st.logoPath ? await fileSrc(st.logoPath) : 'logo.png'; })();
  q('#sTpl').onclick = () => push({ v: 'tpl' });
  q('#sFoot').onchange = e => { st.footer = e.target.value.trim(); save(); toast(st.footer ? 'Đã lưu chân trang' : 'Đã tắt dòng chân trang'); };
  q('#sLogo').onclick = async () => {
    const [f] = await pickFiles('image/*', false); if (!f) return;
    try {
      const url = URL.createObjectURL(f); const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const k = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight)); const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      const p = `brand/logo_${Date.now().toString(36)}.png`; await saveB64(p, c.toDataURL('image/png').split(',')[1]);
      if (st.logoPath) deletePath(st.logoPath); st.logoPath = p; save(); render(); toast('Đã đổi logo biên bản');
    } catch (e) { toast('Không đọc được ảnh logo'); }
  };
  q('#sLogoRst').onclick = () => { if (st.logoPath) deletePath(st.logoPath); st.logoPath = ''; save(); render(); toast('Đã dùng lại logo mặc định'); };
  q('#sOrg').onchange = e => { st.org = e.target.value.trim(); save(); toast('Đã lưu tên đơn vị'); };
  q('#sDept').onchange = e => { st.dept = e.target.value.trim(); save(); };
  q('#sDays').onchange = e => { st.remindDays = +e.target.value; save(); toast('Đã cập nhật lịch nhắc'); };
  q('#sTime').onchange = e => { st.remindTime = e.target.value || '07:00'; save(); toast('Đã cập nhật giờ nhắc'); };
  q('#sDue').onchange = e => { st.dueDay = e.target.checked; save(); };
  q('#sBk').onchange = e => { st.backupRemind = e.target.checked; save(); };
  q('#sTest').onclick = async () => { if (await testNotif()) toast('Thông báo sẽ hiện sau 3 giây'); else toast('Chỉ hoạt động trên điện thoại'); };
  const ex = await exactAlarmStatus();
  q('#sExactDs').textContent = ex === 'granted' ? '✔ Đã bật – thông báo hiện đúng giờ' : 'Chưa bật – thông báo có thể trễ vài phút. Chạm để bật';
  q('#sExact').onclick = async () => { await openExactAlarmSetting(); };
  q('#sBackup').onclick = backup;
  if (q('#sInstall')) q('#sInstall').onclick = async () => { const e = installEvt; if (!e) return; e.prompt(); try { await e.userChoice; } catch (x) {} installEvt = null; render(); };
  q('#sRestore').onclick = restore;
}

// ---------- mẫu biên bản ----------
const TPL_GROUPS = [
  ['Biên bản kiểm tra vật tư (QA)', [
    ['qaLabel', 'Dòng nhãn nhỏ phía trên'], ['qaTitle', 'Tiêu đề biên bản'], ['qaPrefix', 'Tiền tố số biên bản', 'VD: QA- → QA-2026-001'],
    ['qaSec1', 'Phần I (bảng tổng hợp)'], ['qaSec2', 'Phần II (hình ảnh)'], ['qaSec3', 'Phần III (ghi chú, kết luận)'],
    ['qaLblPo', 'Nhãn: số PO'], ['qaLblSup', 'Nhãn: nhà cung cấp'], ['qaLblDate', 'Nhãn: ngày kiểm tra'], ['qaLblIns', 'Nhãn: người kiểm tra'], ['qaLblDev', 'Nhãn: thiết bị'], ['qaLblRes', 'Nhãn: kết quả chung'],
    ['qaSigners', 'Chức danh ký tên', 'Mỗi dòng một chức danh, theo thứ tự trái → phải. Tên người kiểm tra tự điền dưới chức danh đầu tiên.', true]]],
  ['Báo cáo nhật ký tuần', [
    ['wkLabel', 'Dòng nhãn nhỏ phía trên'], ['wkTitle', 'Tiêu đề báo cáo', 'Dùng {tuan} và {nam} để app tự điền số tuần, năm'], ['wkPrefix', 'Tiền tố số báo cáo', 'VD: NK- → NK-2026-T39'],
    ['wkSec1', 'Phần I (kế hoạch)'], ['wkSec2', 'Phần II (tồn đọng)'], ['wkSigners', 'Chức danh ký tên', 'Mỗi dòng một chức danh. Tên bạn tự điền dưới chức danh đầu tiên.', true]]],
  ['Ghi chú thường', [['noteSigners', 'Chức danh ký tên', 'Mỗi dòng một chức danh (để trống = không có phần ký)', true]]],
];
function viewTpl(v) {
  const T = tpl(); const st = S.state.settings;
  v.innerHTML = `<div class="fade-in"><div class="card" style="font-size:13.5px;color:var(--tx2)">Chạm vào một dòng để sửa. Thay đổi áp dụng cho mọi file PDF, Word, Excel xuất ra sau đó. Muốn sửa riêng một biên bản thì xuất ra Word rồi sửa trong Word.</div>
    ${TPL_GROUPS.map(([g, rows]) => `<div class="sec-h"><h2>${g}</h2></div><div class="set-group">${rows.map(([k, l]) => `<button class="set-row" data-k="${k}" style="width:100%;text-align:left">
      <div class="grow" style="min-width:0"><div class="ds">${l}${T[k] !== TPL_DEFAULT[k] ? ' · <span style="color:var(--gold)">đã sửa</span>' : ''}</div><div class="tt" style="white-space:pre-line">${esc(T[k]).replace(/\n/g, ' · ') || '<span class="muted">(trống)</span>'}</div></div>${ic('edit')}</button>`).join('')}</div>`).join('')}
    <button class="btn dan" id="tRst" style="margin-top:6px">${ic('restore')} Khôi phục mẫu mặc định</button></div>`;
  $$('[data-k]', v).forEach(b => b.onclick = async () => {
    const k = b.dataset.k; const row = TPL_GROUPS.flatMap(g => g[1]).find(r => r[0] === k);
    const val = await promptBox('Sửa mẫu', row[1], T[k], { multi: !!row[3], hint: row[2] || `Mặc định: ${TPL_DEFAULT[k].replace(/\n/g, ' · ')}` });
    if (val === null) return;
    st.tpl = Object.assign({}, st.tpl || {}, { [k]: val === '' && !row[3] ? TPL_DEFAULT[k] : val }); save(); render(); toast('Đã lưu mẫu');
  });
  v.querySelector('#tRst').onclick = async () => { if (!await confirmBox('Khôi phục mẫu mặc định?', 'Mọi chữ đã sửa trong mẫu biên bản sẽ quay về như ban đầu.', 'Khôi phục', true)) return; st.tpl = {}; save(); render(); toast('Đã khôi phục mẫu mặc định'); };
}

async function backup() {
  const b = busy('Đang tạo file sao lưu…');
  try {
    const zip = new JSZip();
    zip.file('data.json', JSON.stringify({ app: 'baotri', v: 1, at: new Date().toISOString(), state: S.state, index: S.index }));
    const paths = [...new Set([...S.state.nodes.flatMap(n => n.files.map(f => f.path)), ...S.state.tasks.flatMap(t => t.photos || []), ...S.state.backlog.flatMap(b => b.photos || []), ...S.state.notes.flatMap(n => n.blocks.flatMap(b => b.photos || [])), ...(S.state.settings.logoPath ? [S.state.settings.logoPath] : [])])];
    for (let i = 0; i < paths.length; i++) {
      b.set(`Đang đóng gói ${i + 1}/${paths.length}…`);
      try { const d = await readB64(paths[i]); if (d != null) zip.file(paths[i], d, { base64: true }); } catch (e) { console.warn('skip', paths[i]); }
    }
    b.set('Đang nén…');
    const out = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE', compressionOptions: { level: 5 } });
    b.done();
    await deliver(`BaoTri_saoluu_${today()}.zip`, out, 'application/zip');
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
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'light' ? '#F2F6FC' : '#081225');
  if (native) SystemBars.setStyle({ style: t === 'light' ? SystemBarsStyle.Light : SystemBarsStyle.Dark }).catch(() => {});
}
mq && mq.addEventListener && mq.addEventListener('change', () => { if ((S.state.settings.theme || 'dark') === 'auto') applyTheme(); });

function handleBack() {
  if (closePhoto()) return true;
  if (sheetOpen()) { closeTopSheet(); return true; }
  if (closeViewer()) return true;
  leaving();
  if (pop()) return true;
  if (nav.tab === 'parts' && nav.partsNode !== 'root') { nav.partsNode = node(nav.partsNode)?.parentId || 'root'; render(); return true; }
  if (nav.tab !== 'home') { go('home'); return true; }
  return false;
}

// ---------- bản máy tính (Chrome / Edge) ----------
let installEvt = null;
function initDesktop() {
  document.body.classList.add('web');
  persist();
  // phím tắt
  document.addEventListener('keydown', e => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable;
    if (e.key === 'Escape') { if (typing && document.activeElement.blur && !sheetOpen() && !document.querySelector('.vw')) { document.activeElement.blur(); return; } e.preventDefault(); handleBack(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'k')) {
      e.preventDefault();
      const vf = document.querySelector('.vw [data-a=find]'); if (vf) { vf.click(); return; }
      if (cur().v !== 'search') push({ v: 'search' }); else document.getElementById('q')?.focus();
    }
  });
  // cài như ứng dụng + chạy không cần mạng
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (cur().v === 'settings') render(); });
  window.addEventListener('appinstalled', () => { installEvt = null; toast('✔ Đã cài ứng dụng lên máy tính'); });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
  let rt = null; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(markTab, 150); });
}
const standalone = () => window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;

// ---------- khởi động ----------
async function init() {
  $('#btnBack').innerHTML = ic('back'); $('#btnSearch').innerHTML = ic('search'); $('#btnSettings').innerHTML = ic('settings'); $('#fab').innerHTML = ic('plus', 2.4);
  $$('#tabbar button').forEach(b => { const [i, l] = TABS[b.dataset.tab]; b.innerHTML = ic(i) + `<span>${l}</span>`; b.onclick = () => { leaving(); if (b.dataset.tab === 'ref') clearRefQ(); if (b.dataset.tab === 'parts' && nav.tab === 'parts' && !nav.stack.length) nav.partsNode = 'root'; go(b.dataset.tab); }; });
  $('#btnBack').onclick = () => { leaving(); if (pop()) return; if (nav.tab === 'parts' && nav.partsNode !== 'root') { nav.partsNode = node(nav.partsNode)?.parentId || 'root'; render(); } };
  $('#btnSearch').onclick = () => { if (cur().v !== 'search') push({ v: 'search' }); };
  $('#btnSettings').onclick = () => { if (cur().v !== 'settings') push({ v: 'settings' }); };
  $('#btnMenu').innerHTML = ic('dots'); $('#btnMenu').onclick = () => { const r = cur(); if (r.v === 'note') noteMenu(r.id); };
  $('#fab').onclick = fabAction;
  await load();
  clearExports();
  applyTheme();
  render();
  onBack(handleBack);
  if (!native) initDesktop();
  await notifInit(extra => { if (extra.go === 'backup') { go('home'); push({ v: 'settings' }); return; } const t = extra.taskId && task(extra.taskId); if (t) { go('tasks'); taskForm(t); } });
  reschedule();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
}
init();
