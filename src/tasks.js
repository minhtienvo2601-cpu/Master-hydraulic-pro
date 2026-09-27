import { S, save, task, newTask, completeTask, uncompleteTask, openTasks, sortTasks, device, newBacklog, pathInUse, STATUS, openBacklog, weekStart, weekNo, inWeek } from './store.js';
import { nav, push } from './nav.js';
import { ic } from './icons.js';
import { esc, uid, today, addDays, addMonths, daysTo, dueLabel, fmtD, fmtShort, repeatLabel, $$ } from './util.js';
import { openSheet, confirmBox, toast, viewPhoto, addPhotos } from './ui.js';
import { deletePath, fileSrc } from './platform.js';

const PR = { 1: 'Khẩn', 2: 'Quan trọng', 3: 'Bình thường' };

// ---------- thẻ công việc ----------
export function taskCard(t, opts = {}) {
  const dl = dueLabel(t.due); const dev = device(t.deviceId);
  return `<div class="task p${t.priority} ${t.done ? 'done' : ''}" data-task="${t.id}">
    <button class="check" data-chk="${t.id}" aria-label="Hoàn thành">${ic('check', 3)}</button>
    <div class="grow">
      <div class="row" style="gap:8px"><div class="t-title grow">${esc(t.title)}</div><span class="pill p${t.priority}">P${t.priority}</span></div>
      <div class="t-meta">
        ${t.done ? `<span>${ic('done')} Xong ${fmtShort(t.doneAt)}</span>` : `<span class="${dl.c}">${ic('cal')} ${dl.t}</span>`}
        ${dev && !opts.noDev ? `<span>${ic('device')} ${esc(dev.name)}</span>` : ''}
        ${t.repeat ? `<span>${ic('repeat')} ${repeatLabel(t.repeat)}</span>` : ''}
        ${t.photos?.length ? `<span>${ic('camera')} ${t.photos.length}</span>` : ''}
        ${t.assignee ? `<span>${ic('user')} ${esc(t.assignee)}</span>` : ''}
        ${!t.done && t.status === 'doing' ? `<span class="st st-doing">Đang làm</span>` : ''}${!t.done && t.status === 'hold' ? `<span class="st st-hold">Hoãn</span>` : ''}
      </div>
      ${t.note && opts.showNote ? `<div class="muted" style="font-size:13px;margin-top:6px">${esc(t.note)}</div>` : ''}
    </div></div>`;
}
export function bindTaskCards(root) {
  $$('[data-chk]', root).forEach(b => b.onclick = e => { e.stopPropagation(); toggleDone(b.dataset.chk); });
  $$('[data-task]', root).forEach(el => el.onclick = () => taskForm(task(el.dataset.task)));
}
export function toggleDone(id) {
  const t = task(id); if (!t) return;
  if (t.done) { uncompleteTask(t); toast('Đã mở lại công việc'); }
  else {
    const n = completeTask(t);
    toast(n ? `✔ Hoàn thành · lần kế tiếp: ${fmtShort(n.due)}` : '✔ Đã hoàn thành');
  }
  save(); nav.render();
}

// ---------- form thêm / sửa ----------
const REPEATS = [
  { k: 'none', l: 'Không lặp', r: null }, { k: 'w1', l: 'Hàng tuần', r: { n: 1, unit: 'week' } },
  { k: 'm1', l: 'Hàng tháng', r: { n: 1, unit: 'month' } }, { k: 'm3', l: '3 tháng', r: { n: 3, unit: 'month' } },
  { k: 'm6', l: '6 tháng', r: { n: 6, unit: 'month' } }, { k: 'm12', l: 'Hàng năm', r: { n: 12, unit: 'month' } },
  { k: 'cus', l: 'Tùy chỉnh…', r: 'custom' },
];
export function taskForm(t, preset = {}) {
  const isNew = !t;
  const d = t ? JSON.parse(JSON.stringify(t)) : Object.assign({ title: '', note: '', priority: 2, due: addDays(today(), 7), deviceId: '', repeat: null, photos: [], assignee: '', status: 'todo', result: '' }, preset);
  const people = [...new Set(S.state.tasks.map(x => x.assignee).filter(Boolean))];
  const repKey = r => !r ? 'none' : (REPEATS.find(x => x.r && x.r !== 'custom' && x.r.n === r.n && x.r.unit === r.unit)?.k || 'cus');
  const devOpts = `<option value="">— Không gắn thiết bị —</option>` + S.state.devices.map(v => `<option value="${v.id}" ${v.id === d.deviceId ? 'selected' : ''}>${esc(v.name)}</option>`).join('');
  const html = `
    <div class="field"><label class="lb">Công việc</label><input class="inp" id="fTitle" placeholder="VD: Thay lọc dầu trạm thủy lực chính" value="${esc(d.title)}"></div>
    <div class="field"><label class="lb">Mức ưu tiên</label><div class="seg" id="fPr">
      ${[1, 2, 3].map(p => `<button class="p${p} ${d.priority === p ? 'on' : ''}" data-p="${p}"><b>${p}</b><small>${PR[p]}</small></button>`).join('')}</div></div>
    <div class="field"><label class="lb">Hạn hoàn thành</label><input type="date" class="inp" id="fDue" value="${d.due}">
      <div class="qchips" id="fQd">
        <button data-q="0">Hôm nay</button><button data-q="1">Ngày mai</button><button data-q="3">+3 ngày</button>
        <button data-q="7">+1 tuần</button><button data-q="m1">+1 tháng</button><button data-q="none">Không hạn</button></div>
      <div class="muted" style="font-size:12.5px;margin:8px 2px 0">${ic('bell').replace('<svg', '<svg style="width:13px;height:13px;display:inline;vertical-align:-2px"')} Nhắc trước ${S.state.settings.remindDays} ngày lúc ${S.state.settings.remindTime}</div></div>
    <div class="field"><label class="lb">Thiết bị</label><select class="inp" id="fDev">${devOpts}</select></div>
    <div class="field"><label class="lb">Người thực hiện</label><input class="inp" id="fAs" list="fAsL" value="${esc(d.assignee || '')}" placeholder="VD: Tổ thủy lực ca A, anh Hùng…"><datalist id="fAsL">${people.map(x => `<option value="${esc(x)}">`).join('')}</datalist></div>
    ${!isNew ? `<div class="field"><label class="lb">Trạng thái</label><div class="seg4" id="fSt">${Object.entries(STATUS).map(([k, l]) => `<button data-st="${k}" class="st-${k} ${d.status === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="field"><label class="lb">Kết quả / lý do hoãn</label><textarea class="inp" id="fRes" placeholder="Đã làm gì, thông số đo, vật tư đã thay… hoặc lý do hoãn">${esc(d.result || '')}</textarea></div>` : ''}
    <div class="field"><label class="lb">Lặp lại (bảo trì định kỳ)</label>
      <div class="qchips" id="fRep">${REPEATS.map(x => `<button data-k="${x.k}" class="${repKey(d.repeat) === x.k ? 'on' : ''}">${x.l}</button>`).join('')}</div>
      <div class="row" id="fCus" style="margin-top:8px;${repKey(d.repeat) === 'cus' ? '' : 'display:none'}">
        <span class="muted">Mỗi</span><input type="number" min="1" class="inp" id="fN" style="width:80px;padding:9px" value="${d.repeat?.n || 2}">
        <select class="inp" id="fU" style="width:auto;padding:9px 34px 9px 12px">
          ${['day', 'week', 'month'].map(u => `<option value="${u}" ${d.repeat?.unit === u ? 'selected' : ''}>${{ day: 'ngày', week: 'tuần', month: 'tháng' }[u]}</option>`).join('')}</select></div>
      <div class="muted" style="font-size:12.5px;margin:8px 2px 0">Khi đánh dấu hoàn thành, app tự tạo lần kế tiếp tính từ ngày làm xong.</div></div>
    <div class="field"><label class="lb">Ghi chú</label><textarea class="inp" id="fNote" placeholder="Mã vật tư, thông số, người thực hiện…">${esc(d.note)}</textarea></div>
    <div class="field"><label class="lb">Ảnh hiện trường</label><div class="photos" id="fPh"></div></div>
    <button class="btn pri" id="fSave">${ic('check')} ${isNew ? 'Thêm công việc' : 'Lưu thay đổi'}</button>
    ${!isNew ? `<div class="btn-row" style="margin-top:10px">
      <button class="btn sec" id="fDone">${ic('done')} ${t.done ? 'Mở lại' : 'Hoàn thành'}</button>
      <button class="btn dan" id="fDel">${ic('trash')} Xóa</button></div>
    ${!t.done ? `<button class="btn sec" id="fBl" style="margin-top:10px">${ic('alert')} Chuyển thành tồn đọng</button>` : ''}` : ''}`;
  openSheet(isNew ? 'Công việc mới' : 'Chi tiết công việc', html, (b, close) => {
    const q = s => b.querySelector(s);
    if (isNew) setTimeout(() => q('#fTitle').focus(), 320);
    q('#fPr').onclick = e => { const bt = e.target.closest('[data-p]'); if (!bt) return; d.priority = +bt.dataset.p; $$('[data-p]', b).forEach(x => x.classList.toggle('on', x === bt)); };
    q('#fQd').onclick = e => {
      const bt = e.target.closest('[data-q]'); if (!bt) return; const v = bt.dataset.q;
      q('#fDue').value = v === 'none' ? '' : v === 'm1' ? addMonths(today(), 1) : addDays(today(), +v);
    };
    let rep = repKey(d.repeat);
    q('#fRep').onclick = e => {
      const bt = e.target.closest('[data-k]'); if (!bt) return; rep = bt.dataset.k;
      $$('#fRep [data-k]', b).forEach(x => x.classList.toggle('on', x === bt)); q('#fCus').style.display = rep === 'cus' ? '' : 'none';
    };
    const drawPh = async () => {
      const box = q('#fPh');
      const srcs = await Promise.all(d.photos.map(p => fileSrc(p)));
      box.innerHTML = d.photos.map((p, i) => `<div class="ph"><img src="${srcs[i]}" data-view="${i}"><button data-rm="${i}">${ic('x', 2.4)}</button></div>`).join('') + `<button class="add" data-add>${ic('camera')}</button>`;
      box.querySelector('[data-add]').onclick = async () => {
        await addPhotos(p => { d.photos.push(p); drawPh(); });
      };
      $$('[data-rm]', box).forEach(x => x.onclick = () => { d.photos.splice(+x.dataset.rm, 1); drawPh(); });
      $$('[data-view]', box).forEach(x => x.onclick = () => viewPhoto(x.src));
    };
    drawPh();
    const collect = () => {
      d.title = q('#fTitle').value.trim(); d.note = q('#fNote').value.trim(); d.due = q('#fDue').value; d.deviceId = q('#fDev').value; d.assignee = q('#fAs').value.trim();
      if (q('#fRes')) d.result = q('#fRes').value.trim();
      if (rep === 'cus') d.repeat = { n: Math.max(1, +q('#fN').value || 1), unit: q('#fU').value };
      else d.repeat = REPEATS.find(x => x.k === rep).r;
      if (d.repeat && !d.due) d.due = today();
    };
    let stSel = d.status;
    if (q('#fSt')) q('#fSt').onclick = e => { const bt = e.target.closest('[data-st]'); if (!bt) return; stSel = bt.dataset.st; $$('#fSt [data-st]', b).forEach(x => x.classList.toggle('on', x === bt)); };
    q('#fSave').onclick = () => {
      collect(); if (!d.title) { toast('Nhập tên công việc'); q('#fTitle').focus(); return; }
      if (isNew) newTask(d);
      else {
        const removed = t.photos.filter(p => !d.photos.includes(p)); const wasDone = t.done;
        Object.assign(t, d); removed.forEach(p => { if (!pathInUse(p)) deletePath(p); });
        if (stSel === 'done' && !wasDone) { const n = completeTask(t); if (n) toast(`✔ Hoàn thành · lần kế tiếp: ${fmtShort(n.due)}`); }
        else if (stSel !== 'done' && wasDone) { uncompleteTask(t); t.status = stSel; }
        else t.status = stSel;
      }
      save(); close(); nav.render(); toast(isNew ? 'Đã thêm công việc' : 'Đã lưu');
    };
    if (!isNew) {
      q('#fDone').onclick = () => { collect(); Object.assign(t, d); close(); toggleDone(t.id); };
      if (q('#fBl')) q('#fBl').onclick = () => {
        collect(); Object.assign(t, d);
        const b2 = newBacklog({ deviceId: t.deviceId, desc: t.title + (t.note ? ' – ' + t.note : ''), photos: [...t.photos], action: t.result || '', fromTask: t.id });
        t.status = 'hold'; t.result = (t.result ? t.result + ' · ' : '') + 'Đã chuyển thành tồn đọng';
        save(); close(); nav.render(); toast('Đã chuyển thành tồn đọng – xem ở Nhật ký');
      };
      q('#fDel').onclick = async () => {
        if (!await confirmBox('Xóa công việc?', `“${esc(t.title)}” sẽ bị xóa vĩnh viễn.`, 'Xóa', true)) return;
        S.state.tasks = S.state.tasks.filter(x => x.id !== t.id); t.photos.forEach(p => { if (!pathInUse(p)) deletePath(p); }); save(); close(); nav.render(); toast('Đã xóa');
      };
    }
  });
}

// ---------- thẻ Nhật ký tuần trên Tổng quan ----------
function weekCard() {
  const cur = weekStart(today()); const weeks = [];
  for (let i = 7; i >= 0; i--) { const ws = addDays(cur, -7 * i); const pl = S.state.tasks.filter(t => inWeek(t.due, ws)); weeks.push({ no: weekNo(ws), total: pl.length, done: pl.filter(t => t.done).length, cur: i === 0 }); }
  const w = weeks[7]; const pct = w.total ? Math.round(w.done / w.total * 100) : 0;
  const ob = openBacklog(); const oldest = ob.reduce((m, b) => Math.max(m, daysTo(b.found) * -1), 0);
  return `<button class="card wcard" data-wc><div class="row"><div class="grow"><div class="wc-h">${ic('journal')} Nhật ký tuần ${w.no}</div>
      <div class="wc-s">${w.total ? `${w.done}/${w.total} việc kế hoạch · <b>${pct}%</b>` : 'Chưa lập kế hoạch tuần này'}</div></div>
      <div class="wc-bl ${ob.length ? 'red' : ''}"><b>${ob.length}</b><span>tồn đọng${ob.length ? ` · lâu nhất ${oldest} ngày` : ''}</span></div></div>
    <div class="bars">${weeks.map(x => { const r = x.total ? x.done / x.total : 0; return `<div class="bar ${x.cur ? 'cur' : ''}"><i style="height:${Math.max(4, r * 100)}%;${x.total ? '' : 'opacity:.25'}"></i><span>${x.no}</span></div>`; }).join('')}</div>
    <div class="wc-f muted">Tỉ lệ hoàn thành kế hoạch 8 tuần gần nhất</div></button>`;
}

// ---------- màn hình Tổng quan ----------
export function viewHome(v) {
  const st = S.state; const open = openTasks();
  const over = open.filter(t => t.due && daysTo(t.due) < 0);
  const week = open.filter(t => t.due && daysTo(t.due) >= 0 && daysTo(t.due) <= 7);
  const p1 = open.filter(t => t.priority === 1);
  const m = today().slice(0, 7); const doneM = st.tasks.filter(t => t.done && (t.doneAt || '').startsWith(m));
  const cnt = [1, 2, 3].map(p => open.filter(t => t.priority === p).length); const tot = cnt[0] + cnt[1] + cnt[2] || 1;
  const soon = [...over, ...week].sort(sortTasks).slice(0, 6);
  const rec = open.filter(t => t.repeat && t.due && daysTo(t.due) > 7).sort(sortTasks).slice(0, 4);
  const hr = new Date().getHours(); const greet = hr < 11 ? 'Chào buổi sáng' : hr < 14 ? 'Chào buổi trưa' : hr < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const name = st.settings.name ? ', ' + esc(st.settings.name) : '';
  const headline = over.length ? `${over.length} việc đã quá hạn` : week.length ? `${week.length} việc trong 7 ngày tới` : open.length ? 'Mọi việc đều đúng tiến độ' : 'Chưa có công việc nào';
  v.innerHTML = `<div class="fade-in">
    <div class="hero"><div class="date">${fmtD(today())}</div><div class="big">${greet}${name}</div><div class="sub">${headline}</div></div>
    <div class="stats">
      <button class="stat red" data-f="over"><div class="dot">${ic('alert')}</div><div class="n">${over.length}</div><div class="l">Quá hạn</div></button>
      <button class="stat amber" data-f="week"><div class="dot">${ic('clock')}</div><div class="n">${week.length}</div><div class="l">Trong 7 ngày tới</div></button>
      <button class="stat gold" data-f="p1"><div class="dot">${ic('flag')}</div><div class="n">${p1.length}</div><div class="l">Ưu tiên 1 đang mở</div></button>
      <button class="stat green" data-f="done"><div class="dot">${ic('done')}</div><div class="n">${doneM.length}</div><div class="l">Hoàn thành tháng này</div></button>
    </div>
    <div class="card" style="margin-top:10px"><div class="row"><div class="grow" style="font-weight:600">${open.length} việc đang mở</div><span class="muted" style="font-size:12.5px">theo ưu tiên</span></div>
      <div class="pbar">${cnt.map((c, i) => `<i style="width:${c / tot * 100}%;background:var(--p${i + 1})"></i>`).join('')}</div>
      <div class="legend">${cnt.map((c, i) => `<span><b style="background:var(--p${i + 1})"></b>${PR[i + 1]}: <b style="background:none;width:auto;height:auto;color:var(--tx)">${c}</b></span>`).join('')}</div></div>
    ${weekCard()}
    <div class="sec-h"><h2>Cần làm sớm</h2><a data-go="tasks">Xem tất cả</a></div>
    <div id="hSoon">${soon.length ? soon.map(t => taskCard(t)).join('') : `<div class="card empty" style="padding:22px">${ic('done')}Không có việc quá hạn hay sắp đến hạn</div>`}</div>
    ${rec.length ? `<div class="sec-h"><h2>Bảo trì định kỳ sắp tới</h2></div><div>${rec.map(t => taskCard(t)).join('')}</div>` : ''}
    ${!st.tasks.length ? `<div class="card" style="margin-top:14px"><div style="font-weight:600;margin-bottom:6px">Bắt đầu nhanh</div>
      <div class="muted" style="font-size:13.5px">① Thêm thiết bị ở tab <b>Thiết bị</b> · ② Bấm nút <b>+</b> xanh để thêm công việc · ③ Xây sơ đồ và gắn tài liệu ở tab <b>Tài liệu</b>.</div></div>` : ''}
  </div>`;
  bindTaskCards(v);
  const wc = v.querySelector('[data-wc]'); if (wc) wc.onclick = () => { nav.week = weekStart(today()); nav.tab = 'journal'; nav.stack = []; nav.render(); };
  $$('[data-f]', v).forEach(b => b.onclick = () => { nav.taskFilter = b.dataset.f; nav.tab = 'tasks'; nav.stack = []; nav.render(); });
  $$('[data-go]', v).forEach(b => b.onclick = () => { nav.taskFilter = 'open'; nav.tab = 'tasks'; nav.render(); });
}

// ---------- màn hình Công việc ----------
const FILTERS = [
  ['open', 'Đang mở', t => !t.done], ['over', 'Quá hạn', t => !t.done && t.due && daysTo(t.due) < 0],
  ['week', '7 ngày tới', t => !t.done && t.due && daysTo(t.due) >= 0 && daysTo(t.due) <= 7],
  ['p1', 'Ưu tiên 1', t => !t.done && t.priority === 1], ['p2', 'Ưu tiên 2', t => !t.done && t.priority === 2],
  ['p3', 'Ưu tiên 3', t => !t.done && t.priority === 3], ['rep', 'Định kỳ', t => !t.done && t.repeat],
  ['done', 'Đã xong', t => t.done],
];
export function viewTasks(v) {
  const f = FILTERS.find(x => x[0] === nav.taskFilter) || FILTERS[0];
  let list = S.state.tasks.filter(f[2]);
  let body = '';
  if (f[0] === 'done') {
    list.sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
    body = list.map(t => taskCard(t)).join('');
  } else {
    list.sort(sortTasks);
    const groups = [['Quá hạn', t => t.due && daysTo(t.due) < 0], ['Hôm nay', t => t.due && daysTo(t.due) === 0],
      ['7 ngày tới', t => t.due && daysTo(t.due) > 0 && daysTo(t.due) <= 7], ['Sau đó', t => t.due && daysTo(t.due) > 7], ['Chưa đặt hạn', t => !t.due]];
    body = groups.map(([g, fn]) => { const l = list.filter(fn); return l.length ? `<div class="sec-h"><h2>${g}</h2><span class="muted" style="font-size:12.5px">${l.length}</span></div>${l.map(t => taskCard(t)).join('')}` : ''; }).join('');
  }
  v.innerHTML = `<div class="fade-in"><div class="chips">${FILTERS.map(x => `<button class="chip ${x === f ? 'on' : ''}" data-fl="${x[0]}">${x[1]}<span class="c">${S.state.tasks.filter(x[2]).length}</span></button>`).join('')}</div>
    <div style="margin-top:4px">${body || `<div class="empty">${ic('tasks')}Không có công việc nào ở mục này.<br>Bấm nút <b style="color:var(--gold)">+</b> để thêm.</div>`}</div></div>`;
  $$('[data-fl]', v).forEach(b => b.onclick = () => { nav.taskFilter = b.dataset.fl; nav.render(); });
  bindTaskCards(v);
}
