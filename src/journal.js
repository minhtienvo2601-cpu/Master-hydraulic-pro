import * as XLSX from 'xlsx';
import { S, save, task, newTask, completeTask, uncompleteTask, device, bl, newBacklog, openBacklog, pathInUse, weekStart, weekNo, inWeek, REASONS, SEVER, STATUS } from './store.js';
import { nav, push } from './nav.js';
import { ic } from './icons.js';
import { esc, uid, today, addDays, parseD, daysTo, fmtD, fmtShort, $$ } from './util.js';
import { openSheet, confirmBox, menu, toast, busy, viewPhoto, addPhotos } from './ui.js';
import { deletePath, fileSrc, shareFile } from './platform.js';
import { taskForm } from './tasks.js';
import { exportPdf, exportDocx, exportXlsx } from './exporter.js';

const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const wdOf = s => WD[parseD(s).getDay()];
const areaOf = t => device(t.deviceId)?.location || 'Chung';
const ST_NEXT = { todo: 'doing', doing: 'done', done: 'todo', hold: 'todo' };
export const curWeek = () => nav.week || (nav.week = weekStart(today()));
const openDays = b => Math.max(0, Math.round(((b.resolved ? parseD(b.resolvedAt) : parseD(today())) - parseD(b.found)) / 86400000));

export function weekData(ws) {
  const we = addDays(ws, 6); const isCur = ws === weekStart(today());
  const plan = S.state.tasks.filter(t => inWeek(t.due, ws));
  const carried = isCur ? S.state.tasks.filter(t => !t.done && t.status !== 'hold' && t.due && t.due < ws) : [];
  const backs = S.state.backlog.filter(b => b.found <= we && (!b.resolved || b.resolvedAt >= ws));
  const done = plan.filter(t => t.done).length;
  return { ws, we, isCur, plan, carried, backs, done, total: plan.length,
    newB: backs.filter(b => b.found >= ws).length, fixedB: backs.filter(b => b.resolved && b.resolvedAt >= ws && b.resolvedAt <= we).length,
    openB: backs.filter(b => !b.resolved || b.resolvedAt > we).length };
}

// ---------------- màn hình Nhật ký ----------------
export function viewJournal(v) {
  const ws = curWeek(); const W = weekData(ws);
  const pct = W.total ? Math.round(W.done / W.total * 100) : 0;
  const groups = {}; for (const t of W.plan) (groups[areaOf(t)] = groups[areaOf(t)] || []).push(t);
  const gkeys = Object.keys(groups).sort((a, b) => a === 'Chung' ? 1 : b === 'Chung' ? -1 : a.localeCompare(b, 'vi'));
  const sortT = (a, b) => (a.due || '').localeCompare(b.due || '') || a.priority - b.priority;
  const backs = [...W.backs].sort((a, b) => (a.resolved - b.resolved) || a.severity - b.severity || a.found.localeCompare(b.found));
  v.innerHTML = `<div class="fade-in">
    <div class="wk-head">
      <button class="icon-btn" data-wk="-1">${ic('back')}</button>
      <div class="grow" style="text-align:center"><div class="wk-no">Tuần ${weekNo(ws)}${W.isCur ? ' <span class="wk-now">tuần này</span>' : ''}</div><div class="wk-d">${fmtShort(ws)} – ${fmtShort(W.we)}/${W.we.slice(0, 4)}</div></div>
      <button class="icon-btn" data-wk="1" style="transform:scaleX(-1)">${ic('back')}</button></div>
    ${!W.isCur ? `<button class="link" data-wk="0" style="display:block;margin:-4px auto 8px">↩ Về tuần này</button>` : ''}
    <div class="wk-sum">
      <div class="ring" style="--p:${pct}"><div><b>${pct}%</b><span>${W.done}/${W.total} việc</span></div></div>
      <div class="grow wk-stats">
        <div><span>Tồn đọng còn lại</span><b class="${W.openB ? 'red' : ''}">${W.openB}</b></div>
        <div><span>Tồn đọng mới</span><b>${W.newB}</b></div>
        <div><span>Đã xử lý trong tuần</span><b class="green">${W.fixedB}</b></div></div></div>
    <div class="actions a4">
      <button class="act" data-a="task">${ic('plus')}Thêm việc</button>
      <button class="act" data-a="bl">${ic('alert')}Tồn đọng</button>
      <button class="act" data-a="copy">${ic('repeat')}Chép tuần trước</button>
      <button class="act" data-a="exp">${ic('upload')}Xuất báo cáo</button></div>

    <div class="sec-h"><h2>Kế hoạch công việc</h2><span class="muted" style="font-size:12.5px">${W.total} việc</span></div>
    ${W.carried.length ? `<div class="grp-h red">Chưa xong từ tuần trước · ${W.carried.length}</div>${W.carried.sort(sortT).map(planRow).join('')}` : ''}
    ${gkeys.length ? gkeys.map(g => `<div class="grp-h">${ic('pin')} ${esc(g)} · ${groups[g].length}</div>${groups[g].sort(sortT).map(planRow).join('')}`).join('')
      : `<div class="card empty" style="padding:18px">Chưa có kế hoạch cho tuần này.<br>Bấm <b>Thêm việc</b> hoặc <b>Chép tuần trước</b>.</div>`}

    <div class="sec-h"><h2>Tồn đọng thiết bị</h2><span class="muted" style="font-size:12.5px">${W.openB} đang tồn</span></div>
    ${backs.length ? backs.map(blCard).join('') : `<div class="card empty" style="padding:18px">Không có tồn đọng 👍</div>`}
    ${openBacklog().some(b => b.reason === 'vattu') ? `<button class="btn sec" data-a="buy" style="margin-top:6px">${ic('tag')} Danh sách vật tư cần mua (${openBacklog().filter(b => b.reason === 'vattu').length})</button>` : ''}
  </div>`;
  $$('[data-wk]', v).forEach(b => b.onclick = () => { const d = +b.dataset.wk; nav.week = d === 0 ? weekStart(today()) : addDays(ws, d * 7); nav.render(); });
  $$('[data-st]', v).forEach(b => b.onclick = e => { e.stopPropagation(); cycleStatus(b.dataset.st); });
  $$('[data-pt]', v).forEach(el => el.onclick = () => taskForm(task(el.dataset.pt)));
  $$('[data-bl]', v).forEach(el => el.onclick = e => { if (e.target.closest('[data-fix]')) return; backlogForm(bl(el.dataset.bl)); });
  $$('[data-fix]', v).forEach(b => b.onclick = e => { e.stopPropagation(); resolveBacklog(bl(b.dataset.fix)); });
  $$('img[data-src]', v).forEach(async im => { im.src = await fileSrc(im.dataset.src); });
  const act = { task: () => taskForm(null, { due: W.isCur ? today() : ws }), bl: () => backlogForm(null), copy: () => copyLastWeek(ws), exp: () => exportWeekMenu(ws), buy: () => push({ v: 'buy' }) };
  $$('[data-a]', v).forEach(b => b.onclick = () => act[b.dataset.a]());
}
function planRow(t) {
  const dev = device(t.deviceId); const st = t.done ? 'done' : t.status || 'todo';
  return `<div class="prow p${t.priority}" data-pt="${t.id}">
    <button class="stb st-${st}" data-st="${t.id}">${st === 'done' ? ic('check', 3) : st === 'doing' ? '<i></i>' : st === 'hold' ? '❚❚' : ''}</button>
    <div class="grow" style="min-width:0"><div class="pr-t ${t.done ? 'strike' : ''}">${esc(t.title)}</div>
      <div class="t-meta"><span>${t.due ? wdOf(t.due) + ' ' + fmtShort(t.due) : 'Chưa đặt ngày'}</span>${dev ? `<span>${ic('device')} ${esc(dev.name)}</span>` : ''}${t.assignee ? `<span>${ic('user')} ${esc(t.assignee)}</span>` : ''}
      <span class="st st-${st}">${STATUS[st]}</span></div>
      ${t.result ? `<div class="pr-r">${esc(t.result)}</div>` : ''}</div></div>`;
}
function blCard(b) {
  const dev = device(b.deviceId); const d = openDays(b);
  return `<div class="blc sv${b.severity} ${b.resolved ? 'fixed' : ''}" data-bl="${b.id}">
    <div class="row" style="align-items:flex-start;gap:10px"><div class="grow" style="min-width:0">
      <div class="bl-t">${esc(b.desc || 'Tồn đọng')}</div>
      <div class="t-meta">${dev ? `<span>${ic('device')} ${esc(dev.name)}</span>` : ''}<span>Phát hiện ${fmtShort(b.found)}</span>
        <span class="bl-days ${!b.resolved && d >= 14 ? 'red' : ''}">${b.resolved ? `✔ Xử lý ${fmtShort(b.resolvedAt)}` : `tồn ${d} ngày`}</span></div>
      <div class="bl-tags"><span class="sevp sv${b.severity}">${SEVER[b.severity]}</span><span class="rsn">${esc(b.reason === 'khac' && b.reasonText ? b.reasonText : REASONS[b.reason])}</span>${b.ordered ? '<span class="rsn">Đã đặt hàng</span>' : ''}</div>
      ${b.action ? `<div class="pr-r">→ ${esc(b.action)}</div>` : ''}</div>
      ${b.photos?.length ? `<img class="nthumb" data-src="${esc(b.photos[0])}">` : ''}</div>
    ${!b.resolved ? `<button class="fixbtn" data-fix="${b.id}">${ic('check', 2.4)} Đã xử lý xong</button>` : ''}</div>`;
}
function cycleStatus(id) {
  const t = task(id); if (!t) return; const cur = t.done ? 'done' : t.status || 'todo'; const nx = ST_NEXT[cur];
  if (nx === 'done') { const n = completeTask(t); toast(n ? `✔ Hoàn thành · lần kế tiếp ${fmtShort(n.due)}` : '✔ Hoàn thành'); }
  else if (cur === 'done') { uncompleteTask(t); t.status = 'todo'; }
  else { t.status = nx; toast(STATUS[nx]); }
  save(); nav.render();
}
async function copyLastWeek(ws) {
  const prev = addDays(ws, -7);
  // việc chưa xong đã tự hiện ở “Chưa xong từ tuần trước” nên không chép lại để tránh trùng
  const src = S.state.tasks.filter(t => inWeek(t.due, prev) && !t.repeat && (t.done || t.status === 'hold'));
  const exist = new Set(S.state.tasks.filter(t => inWeek(t.due, ws)).map(t => t.title.trim().toLowerCase()));
  const todo = src.filter(t => !exist.has(t.title.trim().toLowerCase()));
  if (!todo.length) { toast(src.length ? 'Các việc tuần trước đã có trong tuần này' : 'Tuần trước không có việc nào để chép'); return; }
  if (!await confirmBox('Chép kế hoạch tuần trước?', `Tạo ${todo.length} việc cho tuần ${weekNo(ws)} (cùng thứ trong tuần, trạng thái “Chưa làm”). Việc chưa xong và việc định kỳ không chép vì đã tự chuyển sang.`, 'Chép')) return;
  for (const t of todo) newTask({ title: t.title, note: t.note, priority: t.priority, deviceId: t.deviceId, assignee: t.assignee, due: addDays(t.due, 7) });
  save(); nav.render(); toast(`Đã chép ${todo.length} việc`);
}
async function resolveBacklog(b) {
  openSheet('Xử lý xong tồn đọng', `<div class="card" style="margin-bottom:14px;font-weight:600">${esc(b.desc)}</div>
    <div class="field"><label class="lb">Ngày xử lý</label><input type="date" class="inp" id="rD" value="${today()}"></div>
    <div class="field"><label class="lb">Đã xử lý thế nào</label><textarea class="inp" id="rN" placeholder="VD: Thay gioăng mặt bích, siết lại bu lông, chạy thử không rò">${esc(b.resolveNote || '')}</textarea></div>
    <button class="btn pri" id="rS">${ic('check')} Xác nhận đã xử lý</button>`, (x, close) => {
    x.querySelector('#rS').onclick = () => { b.resolved = true; b.resolvedAt = x.querySelector('#rD').value || today(); b.resolveNote = x.querySelector('#rN').value.trim(); save(); close(); nav.render(); toast('✔ Đã đóng tồn đọng'); };
  });
}

// ---------------- form tồn đọng ----------------
export function backlogForm(b0, preset = {}) {
  const isNew = !b0; const d = b0 ? JSON.parse(JSON.stringify(b0)) : Object.assign({ deviceId: '', desc: '', found: today(), severity: 2, reason: 'vattu', reasonText: '', action: '', parts: '', photos: [], ordered: false }, preset);
  const devOpts = `<option value="">— Chọn thiết bị —</option>` + S.state.devices.map(x => `<option value="${x.id}" ${x.id === d.deviceId ? 'selected' : ''}>${esc(x.name)}${x.location ? ' · ' + esc(x.location) : ''}</option>`).join('');
  openSheet(isNew ? 'Tồn đọng mới' : 'Tồn đọng thiết bị', `
    <div class="field"><label class="lb">Thiết bị</label><select class="inp" id="bD">${devOpts}</select></div>
    <div class="field"><label class="lb">Mô tả hư hỏng / tồn tại</label><textarea class="inp" id="bT" placeholder="VD: Rò dầu nhẹ tại mặt bích cổng P bơm P2">${esc(d.desc)}</textarea></div>
    <div class="field"><label class="lb">Mức độ</label><div class="seg" id="bS">${[1, 2, 3].map(k => `<button class="p${k} ${d.severity === k ? 'on' : ''}" data-s="${k}"><b>${SEVER[k]}</b></button>`).join('')}</div></div>
    <div class="field"><label class="lb">Ngày phát hiện</label><input type="date" class="inp" id="bF" value="${d.found}"></div>
    <div class="field"><label class="lb">Lý do chưa xử lý</label><div class="qchips" id="bR">${Object.entries(REASONS).map(([k, l]) => `<button data-r="${k}" class="${d.reason === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <input class="inp" id="bRT" style="margin-top:8px;${d.reason === 'khac' ? '' : 'display:none'}" placeholder="Ghi rõ lý do" value="${esc(d.reasonText)}"></div>
    <div class="field" id="bPw" style="${d.reason === 'vattu' ? '' : 'display:none'}"><label class="lb">Vật tư cần (mã, số lượng)</label><input class="inp" id="bP" value="${esc(d.parts)}" placeholder="VD: 300001-665-0 x1, gioăng NBR 2 cái">
      <label class="tgl" style="padding-top:10px"><input type="checkbox" id="bO" ${d.ordered ? 'checked' : ''}><span>Đã đặt hàng</span></label></div>
    <div class="field"><label class="lb">Hướng xử lý</label><textarea class="inp" id="bA" placeholder="VD: Thay gioăng khi dừng máy tuần 41">${esc(d.action)}</textarea></div>
    <div class="field"><label class="lb">Ảnh</label><div class="photos" id="bPh"></div></div>
    <button class="btn pri" id="bSave">${ic('check')} ${isNew ? 'Thêm tồn đọng' : 'Lưu'}</button>
    ${!isNew ? `<div class="btn-row" style="margin-top:10px">${d.resolved ? `<button class="btn sec" id="bReopen">${ic('restore')} Mở lại</button>` : `<button class="btn sec" id="bFix">${ic('done')} Đã xử lý</button>`}<button class="btn dan" id="bDel">${ic('trash')} Xóa</button></div>
      ${d.resolved ? `<div class="card" style="margin-top:10px;font-size:13.5px"><b>Đã xử lý ${fmtD(d.resolvedAt)}</b><br>${esc(d.resolveNote || '')}</div>` : ''}` : ''}`, (x, close) => {
    const q = s => x.querySelector(s);
    if (isNew) setTimeout(() => q('#bT').focus(), 320);
    q('#bS').onclick = e => { const bt = e.target.closest('[data-s]'); if (!bt) return; d.severity = +bt.dataset.s; $$('#bS [data-s]', x).forEach(y => y.classList.toggle('on', y === bt)); };
    q('#bR').onclick = e => { const bt = e.target.closest('[data-r]'); if (!bt) return; d.reason = bt.dataset.r; $$('#bR [data-r]', x).forEach(y => y.classList.toggle('on', y === bt)); q('#bRT').style.display = d.reason === 'khac' ? '' : 'none'; q('#bPw').style.display = d.reason === 'vattu' ? '' : 'none'; };
    const drawPh = async () => {
      const box = q('#bPh'); const srcs = await Promise.all(d.photos.map(p => fileSrc(p)));
      box.innerHTML = d.photos.map((p, i) => `<div class="ph"><img src="${srcs[i]}" data-view="${i}"><button data-rm="${i}">${ic('x', 2.4)}</button></div>`).join('') + `<button class="add" data-add>${ic('camera')}</button>`;
      box.querySelector('[data-add]').onclick = async () => { await addPhotos(p => { d.photos.push(p); drawPh(); }); };
      $$('[data-rm]', box).forEach(y => y.onclick = () => { d.photos.splice(+y.dataset.rm, 1); drawPh(); });
      $$('[data-view]', box).forEach(y => y.onclick = () => viewPhoto(y.src));
    };
    drawPh();
    const collect = () => { d.deviceId = q('#bD').value; d.desc = q('#bT').value.trim(); d.found = q('#bF').value || today(); d.reasonText = q('#bRT').value.trim(); d.parts = q('#bP').value.trim(); d.ordered = q('#bO').checked; d.action = q('#bA').value.trim(); };
    q('#bSave').onclick = () => {
      collect(); if (!d.desc) { toast('Nhập mô tả tồn đọng'); return; }
      if (isNew) newBacklog(d); else { const rm = b0.photos.filter(p => !d.photos.includes(p)); Object.assign(b0, d); rm.forEach(p => { if (!pathInUse(p)) deletePath(p); }); }
      save(); close(); nav.render(); toast(isNew ? 'Đã thêm tồn đọng' : 'Đã lưu');
    };
    if (!isNew) {
      if (q('#bFix')) q('#bFix').onclick = () => { collect(); Object.assign(b0, d); close(); setTimeout(() => resolveBacklog(b0), 280); };
      if (q('#bReopen')) q('#bReopen').onclick = () => { collect(); Object.assign(b0, d, { resolved: false, resolvedAt: '' }); save(); close(); nav.render(); toast('Đã mở lại tồn đọng'); };
      q('#bDel').onclick = async () => {
        if (!await confirmBox('Xóa tồn đọng?', 'Mục này sẽ bị xóa khỏi mọi tuần. Nếu đã xử lý xong, nên dùng “Đã xử lý” để còn lưu lịch sử.', 'Xóa', true)) return;
        S.state.backlog = S.state.backlog.filter(y => y !== b0); b0.photos.forEach(p => { if (!pathInUse(p)) deletePath(p); }); save(); close(); nav.render(); toast('Đã xóa');
      };
    }
  });
}

// ---------------- xuất báo cáo tuần ----------------
function exportWeekMenu(ws) {
  menu(`Báo cáo tuần ${weekNo(ws)}`, [{ icon: 'file', label: 'Xuất PDF', run: () => exportWeek(ws, 'pdf') }, { icon: 'file', label: 'Xuất Word (.docx)', run: () => exportWeek(ws, 'docx') }, { icon: 'file', label: 'Xuất Excel (.xlsx)', run: () => exportWeek(ws, 'xlsx') }]);
}
const dmy = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '';
const SEVRES = { 1: 'ng', 2: 'chk', 3: 'doing' };
async function exportWeek(ws, kind) {
  const W = weekData(ws); const st = S.state.settings; const name = st.name; const yr = ws.slice(0, 4); const no = weekNo(ws);
  const org = st.org || 'CÔNG TY CỔ PHẦN THÉP HÒA PHÁT DUNG QUẤT';
  const plan = [...W.carried, ...W.plan].sort((a, b) => areaOf(a).localeCompare(areaOf(b), 'vi') || (a.due || '').localeCompare(b.due || ''));
  const prow = plan.map((t, i) => { const dev = device(t.deviceId); const s2 = t.done ? 'done' : t.status || 'todo';
    return [String(i + 1), areaOf(t), dev?.name || '', t.title + (t.note ? '\n' + t.note : ''), t.due ? `${wdOf(t.due)} ${fmtShort(t.due)}` : '', t.assignee || '',
      { t: STATUS[s2] + (t.done && t.doneAt ? ' ' + fmtShort(t.doneAt) : '') + (W.carried.includes(t) ? '\n(tuần trước)' : ''), result: s2 }, t.result || '']; });
  const brow = W.backs.map((b, i) => { const dev = device(b.deviceId);
    return [String(i + 1), dev?.name || '', b.desc, b.parts || '', dmy(b.found), String(openDays(b)), { t: SEVER[b.severity], result: SEVRES[b.severity] },
      b.reason === 'khac' && b.reasonText ? b.reasonText : REASONS[b.reason], b.action || '', b.resolved ? { t: `Đã xử lý ${fmtShort(b.resolvedAt)}${b.resolveNote ? '\n' + b.resolveNote : ''}`, result: 'fixed' } : { t: 'Đang tồn', result: 'open' }]; });
  const pct = W.total ? Math.round(W.done / W.total * 100) : 0;
  const info = [['Tuần', `Tuần ${no}/${yr} · ${dmy(ws)} – ${dmy(W.we)}`], ['Người lập', name || '—'],
    ['Kế hoạch', `${W.total} việc · hoàn thành ${W.done} (${pct}%)`], ['Chưa xong từ tuần trước', `${W.carried.length} việc`],
    ['Tồn đọng', `Còn ${W.openB} · mới ${W.newB} · đã xử lý ${W.fixedB}`], ['Vật tư đang chờ', `${openBacklog().filter(b => b.reason === 'vattu').length} mục`]];
  const doc = { landscape: true, org, dept: st.dept || '', label: 'BÁO CÁO BẢO TRÌ HÀNG TUẦN', title: `NHẬT KÝ BẢO TRÌ TUẦN ${no}/${yr}`, subtitle: `Từ ${fmtD(ws)} đến ${fmtD(W.we)}`,
    docNo: `NK-${yr}-T${String(no).padStart(2, '0')}`, dateText: 'Ngày lập ' + dmy(today()), fileBase: `NhatKy_Tuan${no}_${yr}`, info,
    sections: [
      { heading: 'I. KẾ HOẠCH CÔNG VIỆC', items: [prow.length ? { table: { cols: ['STT', 'Khu vực', 'Thiết bị', 'Công việc', 'Ngày', 'Người thực hiện', 'Trạng thái', 'Kết quả / ghi chú'], widths: [4, 11, 14, 27, 7, 11, 10, 18], rows: prow } } : { p: 'Không có kế hoạch trong tuần.' }] },
      { heading: 'II. TỒN ĐỌNG THIẾT BỊ', items: [brow.length ? { table: { cols: ['STT', 'Thiết bị', 'Mô tả tồn đọng', 'Vật tư cần', 'Phát hiện', 'Số ngày', 'Mức độ', 'Lý do', 'Hướng xử lý', 'Trạng thái'], widths: [4, 12, 21, 12, 9, 6, 8, 10, 12, 10], rows: brow } } : { p: 'Không có tồn đọng.' }] },
    ],
    signers: [{ title: 'Người lập', name }, { title: 'Trưởng bộ phận' }] };
  const sheets = [
    { name: 'Tong hop', title: doc.title, info, cols: [{ h: 'Chỉ tiêu', w: 34 }, { h: 'Giá trị', w: 22, center: true }, { h: 'Ghi chú', w: 40 }],
      rows: [['Tổng việc kế hoạch', String(W.total), ''], ['Hoàn thành', String(W.done), `${pct}%`], ['Đang làm', String(W.plan.filter(t => !t.done && t.status === 'doing').length), ''],
        ['Hoãn', String(W.plan.filter(t => !t.done && t.status === 'hold').length), ''], ['Chưa xong từ tuần trước', String(W.carried.length), ''],
        ['Tồn đọng còn lại', String(W.openB), ''], ['Tồn đọng mới trong tuần', String(W.newB), ''], ['Tồn đọng đã xử lý', String(W.fixedB), '']], landscape: false },
    { name: 'Ke hoach', title: 'KẾ HOẠCH CÔNG VIỆC – TUẦN ' + no, info: [['Tuần', info[0][1]], ['Người lập', name || '—']],
      cols: [{ h: 'STT', w: 6, center: true, num: true }, { h: 'Khu vực', w: 18 }, { h: 'Thiết bị', w: 24 }, { h: 'Công việc', w: 42 }, { h: 'Ngày', w: 11, center: true }, { h: 'Người thực hiện', w: 18 }, { h: 'Trạng thái', w: 16, center: true }, { h: 'Kết quả / ghi chú', w: 34 }], rows: prow, landscape: true },
    { name: 'Ton dong', title: 'TỒN ĐỌNG THIẾT BỊ – TUẦN ' + no, info: [['Tuần', info[0][1]], ['Tồn đọng', info[4][1]]],
      cols: [{ h: 'STT', w: 6, center: true, num: true }, { h: 'Thiết bị', w: 22 }, { h: 'Mô tả tồn đọng', w: 40 }, { h: 'Vật tư cần', w: 22 }, { h: 'Phát hiện', w: 12, center: true }, { h: 'Số ngày', w: 9, center: true, num: true }, { h: 'Mức độ', w: 12, center: true }, { h: 'Lý do', w: 16 }, { h: 'Hướng xử lý', w: 28 }, { h: 'Trạng thái', w: 18, center: true }], rows: brow, landscape: true },
  ];
  const bz = busy('Đang tạo báo cáo…');
  try { if (kind === 'pdf') await exportPdf(doc); else if (kind === 'docx') await exportDocx(doc); else await exportXlsx(doc, sheets); }
  catch (e) { if (!String(e).match(/cancel/i)) toast('Lỗi xuất file: ' + (e.message || e)); console.error(e); } finally { bz.done(); }
}

// ---------------- danh sách vật tư cần mua ----------------
export function viewBuy(v) {
  const list = openBacklog().filter(b => b.reason === 'vattu').sort((a, b) => a.ordered - b.ordered || a.severity - b.severity || a.found.localeCompare(b.found));
  v.innerHTML = `<div class="fade-in"><div class="card" style="font-size:13.5px;color:var(--tx2)">Tự tổng hợp từ các tồn đọng có lý do <b>“Chờ vật tư”</b> chưa xử lý. Chạm vào một dòng để sửa mã, số lượng hoặc đánh dấu đã đặt hàng.</div>
    <div class="sec-h"><h2>Cần mua</h2><span class="muted" style="font-size:12.5px">${list.filter(b => !b.ordered).length} chưa đặt · ${list.filter(b => b.ordered).length} đã đặt</span></div>
    ${list.length ? list.map(b => { const dev = device(b.deviceId); return `<div class="item" data-bl="${b.id}" style="align-items:flex-start"><div class="fi ${b.ordered ? 'xls' : 'pdf'}">${b.ordered ? ic('check', 2.4) : ic('tag')}</div>
      <div class="grow"><div class="nm">${esc(b.parts || '(chưa ghi mã vật tư)')}</div><div class="sz">${esc(b.desc)}</div><div class="sz">${dev ? esc(dev.name) + ' · ' : ''}tồn ${openDays(b)} ngày${b.ordered ? ' · đã đặt hàng' : ''}</div></div></div>`; }).join('')
      : `<div class="empty">${ic('tag')}Không có vật tư nào đang chờ</div>`}
    ${list.length ? `<button class="btn pri" id="bx" style="margin-top:8px">${ic('upload')} Xuất Excel gửi phòng vật tư</button>` : ''}</div>`;
  $$('[data-bl]', v).forEach(el => el.onclick = () => backlogForm(bl(el.dataset.bl)));
  const bx = v.querySelector('#bx'); if (bx) bx.onclick = async () => {
    const aoa = [['STT', 'Mã / vật tư cần', 'Thiết bị', 'Khu vực', 'Mô tả tồn đọng', 'Mức độ', 'Ngày phát hiện', 'Số ngày tồn', 'Đã đặt hàng']];
    list.forEach((b, i) => { const dev = device(b.deviceId); aoa.push([i + 1, b.parts, dev?.name || '', dev?.location || '', b.desc, SEVER[b.severity], b.found, openDays(b), b.ordered ? 'Có' : '']); });
    const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = [{ wch: 5 }, { wch: 34 }, { wch: 26 }, { wch: 18 }, { wch: 44 }, { wch: 11 }, { wch: 13 }, { wch: 11 }, { wch: 12 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Vat tu can mua');
    const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    try { await shareFile(`VatTuCanMua_${today()}.xlsx`, b64, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); } catch (e) { if (!String(e).match(/cancel/i)) toast('Lỗi xuất file'); }
  };
}

// ---------------- dữ liệu cho Tổng quan ----------------
export function last8Weeks() {
  const cur = weekStart(today()); const out = [];
  for (let i = 7; i >= 0; i--) { const ws = addDays(cur, -7 * i); const plan = S.state.tasks.filter(t => inWeek(t.due, ws)); out.push({ ws, no: weekNo(ws), total: plan.length, done: plan.filter(t => t.done).length }); }
  return out;
}
export { openDays };
