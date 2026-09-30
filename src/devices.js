import { S, save, device, node, flatNodes, sortTasks, SEVER, REASONS } from './store.js';
import { nav, push, pop } from './nav.js';
import { ic } from './icons.js';
import { esc, uid, daysTo, fmtD, $$ } from './util.js';
import { openSheet, confirmBox, toast, viewPhoto } from './ui.js';
import { taskCard, bindTaskCards, taskForm } from './tasks.js';
import { lazyImgs, fullOf } from './lazy.js';
import { backlogForm } from './journal.js';

export function viewDevices(v) {
  const ds = [...S.state.devices].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  v.innerHTML = `<div class="fade-in">${ds.length ? ds.map(d => {
    const open = S.state.tasks.filter(t => !t.done && t.deviceId === d.id);
    const over = open.filter(t => t.due && daysTo(t.due) < 0).length;
    return `<div class="dev" data-dev="${d.id}"><div class="dev-ic">${ic('device')}</div>
      <div class="grow"><div class="name ellip">${esc(d.name)}</div><div class="sub ellip">${esc([d.code, d.location].filter(Boolean).join(' · ') || 'Chưa có mã / vị trí')}</div></div>
      ${over ? `<span class="badge red">${over}</span>` : open.length ? `<span class="badge">${open.length}</span>` : ''}
      <span class="muted" style="width:18px">${ic('chev')}</span></div>`;
  }).join('') : `<div class="empty">${ic('device')}Chưa có thiết bị nào.<br>Thêm thiết bị (máy mài, trạm thủy lực, bơm…) để theo dõi lịch sử bảo trì.</div>`}</div>`;
  $$('[data-dev]', v).forEach(el => el.onclick = () => push({ v: 'device', id: el.dataset.dev }));
}

export function viewDevice(v, id) {
  const d = device(id); if (!d) { pop(); return; }
  const mine = S.state.tasks.filter(t => t.deviceId === id);
  const open = mine.filter(t => !t.done).sort(sortTasks);
  const hist = mine.filter(t => t.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  const nd = d.nodeId && node(d.nodeId);
  v.innerHTML = `<div class="fade-in">
    <div class="hero"><div class="row" style="gap:14px;position:relative;z-index:1"><div class="dev-ic" style="width:56px;height:56px">${ic('device')}</div>
      <div class="grow"><div class="big" style="margin:0">${esc(d.name)}</div><div class="sub">${esc(d.code || '')}</div></div></div></div>
    <div class="card" style="margin-top:10px"><dl class="kv">
      <dt>Vị trí</dt><dd>${esc(d.location || '—')}</dd>
      <dt>Đang mở</dt><dd>${open.length} công việc</dd>
      <dt>Đã bảo trì</dt><dd>${hist.length} lần${hist[0] ? ' · gần nhất ' + fmtD(hist[0].doneAt) : ''}</dd>
      ${d.note ? `<dt>Ghi chú</dt><dd style="white-space:pre-wrap">${esc(d.note)}</dd>` : ''}</dl></div>
    <div class="actions">
      <button class="act" data-a="task">${ic('plus')}Thêm việc</button>
      <button class="act" data-a="parts">${ic('parts')}${nd ? 'Tài liệu' : 'Gắn tài liệu'}</button>
      <button class="act" data-a="edit">${ic('edit')}Sửa</button></div>
    ${(() => { const bs = S.state.backlog.filter(x => x.deviceId === id && !x.resolved); return `<div class="sec-h"><h2>Tồn đọng</h2><a data-a="bl">+ Thêm</a></div>` + (bs.length ? bs.map(x => `<div class="blc sv${x.severity}" data-blid="${x.id}"><div class="bl-t">${esc(x.desc)}</div><div class="bl-tags"><span class="sevp sv${x.severity}">${SEVER[x.severity]}</span><span class="rsn">${esc(x.reason === 'khac' && x.reasonText ? x.reasonText : REASONS[x.reason])}</span><span class="rsn">từ ${fmtD(x.found)}</span></div></div>`).join('') : `<div class="card empty" style="padding:14px">Không có tồn đọng</div>`); })()}
    ${(() => { const ns = S.state.notes.filter(x => x.deviceId === id); return ns.length ? `<div class="sec-h"><h2>Ghi chú</h2></div>` + ns.map(x => `<div class="item" data-nid="${x.id}"><div class="fi doc">${ic('note')}</div><div class="grow"><div class="nm ellip">${esc(x.title || 'Ghi chú không tên')}</div><div class="sz">${fmtD(x.updated.slice(0, 10))}</div></div></div>`).join('') : ''; })()}
    <div class="sec-h"><h2>Công việc đang mở</h2><span class="muted" style="font-size:12.5px">${open.length}</span></div>
    ${open.length ? open.map(t => taskCard(t, { noDev: true })).join('') : `<div class="card empty" style="padding:18px">Không có việc đang mở</div>`}
    <div class="sec-h"><h2>Lịch sử bảo trì</h2><span class="muted" style="font-size:12.5px">${hist.length}</span></div>
    ${hist.length ? `<div class="card"><div class="timeline">${hist.map(t => `<div class="tl" data-task="${t.id}"><div class="d">${fmtD(t.doneAt)} · P${t.priority}</div>
      <div class="t">${esc(t.title)}</div>${t.note ? `<div class="muted" style="font-size:13px">${esc(t.note)}</div>` : ''}
      ${t.photos?.length ? `<div class="thumbs">${t.photos.map(p => `<img data-src="${esc(p)}">`).join('')}</div>` : ''}</div>`).join('')}</div></div>`
      : `<div class="card empty" style="padding:18px">Chưa có lần bảo trì nào được ghi nhận</div>`}
  </div>`;
  bindTaskCards(v);
  $$('.tl[data-task]', v).forEach(el => el.onclick = e => { if (e.target.tagName === 'IMG') return; });
  lazyImgs(v); $$('img[data-src]', v).forEach(im => { im.onclick = e => { e.stopPropagation(); viewPhoto(fullOf(im)); }; });
  v.querySelector('[data-a=task]').onclick = () => taskForm(null, { deviceId: id });
  v.querySelector('[data-a=bl]').onclick = () => backlogForm(null, { deviceId: id });
  $$('[data-blid]', v).forEach(el => el.onclick = () => backlogForm(S.state.backlog.find(x => x.id === el.dataset.blid)));
  $$('[data-nid]', v).forEach(el => el.onclick = () => push({ v: 'note', id: el.dataset.nid }));
  v.querySelector('[data-a=edit]').onclick = () => deviceForm(d);
  v.querySelector('[data-a=parts]').onclick = () => {
    if (nd) { nav.partsNode = nd.id; nav.tab = 'parts'; nav.stack = []; nav.render(); }
    else deviceForm(d);
  };
}

export function deviceForm(d) {
  const isNew = !d; const x = d ? { ...d } : { name: '', code: '', location: '', note: '', nodeId: '' };
  const nodeOpts = `<option value="">— Không gắn —</option>` + flatNodes().map(({ n, d: dp }) => `<option value="${n.id}" ${n.id === x.nodeId ? 'selected' : ''}>${'  '.repeat(dp)}${dp ? '└ ' : ''}${esc(n.name)}</option>`).join('');
  openSheet(isNew ? 'Thiết bị mới' : 'Sửa thiết bị', `
    <div class="field"><label class="lb">Tên thiết bị</label><input class="inp" id="dN" value="${esc(x.name)}" placeholder="VD: Máy mài trục HD 403 – SN 890"></div>
    <div class="field"><label class="lb">Mã / số hiệu</label><input class="inp" id="dC" value="${esc(x.code)}" placeholder="VD: UTM-IM-00-0890"></div>
    <div class="field"><label class="lb">Vị trí / khu vực</label><input class="inp" id="dL" value="${esc(x.location)}" placeholder="VD: Xưởng cán nóng – HSM"></div>
    <div class="field"><label class="lb">Thư mục tài liệu liên kết</label><select class="inp" id="dP">${nodeOpts}</select></div>
    <div class="field"><label class="lb">Ghi chú kỹ thuật</label><textarea class="inp" id="dT" placeholder="Loại dầu, áp suất làm việc, hãng sản xuất…">${esc(x.note)}</textarea></div>
    <button class="btn pri" id="dS">${ic('check')} ${isNew ? 'Thêm thiết bị' : 'Lưu'}</button>
    ${!isNew ? `<button class="btn dan" id="dD">${ic('trash')} Xóa thiết bị</button>` : ''}`, (b, close) => {
    const q = s => b.querySelector(s);
    if (isNew) setTimeout(() => q('#dN').focus(), 320);
    q('#dS').onclick = () => {
      const o = { name: q('#dN').value.trim(), code: q('#dC').value.trim(), location: q('#dL').value.trim(), nodeId: q('#dP').value, note: q('#dT').value.trim() };
      if (!o.name) { toast('Nhập tên thiết bị'); return; }
      if (isNew) S.state.devices.push({ id: uid(), ...o }); else Object.assign(d, o);
      save(); close(); nav.render(); toast(isNew ? 'Đã thêm thiết bị' : 'Đã lưu');
    };
    if (!isNew) q('#dD').onclick = async () => {
      if (!await confirmBox('Xóa thiết bị?', 'Các công việc của thiết bị vẫn được giữ lại nhưng không còn gắn thiết bị.', 'Xóa', true)) return;
      S.state.devices = S.state.devices.filter(z => z.id !== d.id); S.state.tasks.forEach(t => { if (t.deviceId === d.id) t.deviceId = ''; });
      save(); close(); pop(); toast('Đã xóa thiết bị');
    };
  });
}
