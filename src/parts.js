import * as XLSX from 'xlsx';
import { S, save, node, kids, pathTo, descendants, COLORS } from './store.js';
import { nav } from './nav.js';
import { ic } from './icons.js';
import { esc, uid, fmtSize, fileKind, extOf, MIME, today, $$ } from './util.js';
import { openSheet, confirmBox, promptBox, menu, toast, busy } from './ui.js';
import { pickFiles, saveBlob, deletePath, openFile, openUrl } from './platform.js';
import { viewFile, canView } from './viewer.js';

const view = { s: 1, tx: 0, ty: 0 };
let lastNode = null;

function wrap(name, max = 15) {
  const words = String(name).split(/\s+/); const lines = [''];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if (!cur) lines[lines.length - 1] = w;
    else if ((cur + ' ' + w).length <= max) lines[lines.length - 1] = cur + ' ' + w;
    else lines.push(w);
  }
  if (lines.length > 2) { lines.length = 2; lines[1] = lines[1].slice(0, max - 1) + '…'; }
  return lines.map(l => l.length > max + 2 ? l.slice(0, max) + '…' : l);
}
const countFiles = n => n.files.length + n.links.length;

function buildMap(c) {
  const ch = kids(c.id); const n = ch.length;
  const two = n > 7; const R1 = n <= 4 ? 140 : 160, R2 = 265;
  const pos = ch.map((k, i) => {
    const a = (-90 + (360 / Math.max(n, 1)) * i) * Math.PI / 180;
    const R = two && i % 2 ? R2 : R1;
    return { k, a, R, x: Math.cos(a) * R, y: Math.sin(a) * R };
  });
  let minX = -90, maxX = 90, minY = -90, maxY = 90;
  let links = '', gnodes = '', cnodes = '';
  for (const p of pos) {
    const col = p.k.color || '#1E6FFF';
    const ca = p.a + 0.22, cr = p.R * 0.55;
    links += `<path d="M0 0 Q ${Math.cos(ca) * cr} ${Math.sin(ca) * cr} ${p.x} ${p.y}" stroke="${col}" stroke-opacity=".55" stroke-width="2.2" fill="none"/>`;
    const gk = kids(p.k.id); const show = gk.slice(0, 5);
    show.forEach((g, j) => {
      const ga = p.a + (j - (show.length - 1) / 2) * 0.2; const gr = p.R + 72;
      const gx = Math.cos(ga) * gr, gy = Math.sin(ga) * gr;
      links += `<line x1="${p.x}" y1="${p.y}" x2="${gx}" y2="${gy}" stroke="${col}" stroke-opacity=".3" stroke-width="1.3"/>`;
      gnodes += `<circle cx="${gx}" cy="${gy}" r="7" fill="${g.color || col}" fill-opacity=".85" style="stroke:var(--nodeStroke)" stroke-width="2"/>`;
      minX = Math.min(minX, gx - 12); maxX = Math.max(maxX, gx + 12); minY = Math.min(minY, gy - 12); maxY = Math.max(maxY, gy + 12);
    });
    if (gk.length > 5) { const gx = Math.cos(p.a) * (p.R + 100), gy = Math.sin(p.a) * (p.R + 100); gnodes += `<text x="${gx}" y="${gy + 4}" text-anchor="middle" class="node-sub">+${gk.length - 5}</text>`; }
    const lines = wrap(p.k.name); const w = 128, h = lines.length > 1 ? 62 : 50;
    const sub = `${countFiles(p.k)} file · ${gk.length} nhánh`;
    cnodes += `<g class="mm-node" data-nid="${p.k.id}" transform="translate(${p.x} ${p.y})">
      <rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="16" style="fill:var(--node)" stroke="${col}" stroke-width="1.6"/>
      <rect x="${-w / 2}" y="${-h / 2}" width="5" height="${h}" rx="2.5" fill="${col}"/>
      ${lines.map((l, i) => `<text x="3" y="${-h / 2 + 20 + i * 16}" text-anchor="middle" class="node-lbl">${esc(l)}</text>`).join('')}
      <text x="3" y="${h / 2 - 9}" text-anchor="middle" class="node-sub">${sub}</text></g>`;
    minX = Math.min(minX, p.x - w / 2 - 10); maxX = Math.max(maxX, p.x + w / 2 + 10); minY = Math.min(minY, p.y - h / 2 - 10); maxY = Math.max(maxY, p.y + h / 2 + 10);
  }
  const cl = wrap(c.name, 12);
  const center = `<g class="mm-node" data-center="1">
    <circle r="74" fill="url(#halo)"/>
    <circle r="60" fill="url(#gold)" stroke="#BFDBFF" stroke-opacity=".6" stroke-width="1.5"/>
    ${cl.map((l, i) => `<text y="${(i - (cl.length - 1) / 2) * 17 - 4}" text-anchor="middle" style="font-size:14px;font-weight:700;fill:#FFFFFF">${esc(l)}</text>`).join('')}
    <text y="${(cl.length - 1) * 8.5 + 16}" text-anchor="middle" style="font-size:10.5px;fill:#DCEBFF;font-weight:500">${n} nhánh · ${countFiles(c)} file</text></g>`;
  const empty = n ? '' : `<text y="112" text-anchor="middle" class="node-sub" style="font-size:12px">Bấm “Thêm nhánh” để tạo nhánh con</text>`;
  const pad = 16; const vb = [minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2 + (n ? 0 : 40)];
  return `<svg class="map" viewBox="${vb.join(' ')}" preserveAspectRatio="xMidYMid meet">
    <defs><radialGradient id="gold" cx="35%" cy="30%"><stop offset="0" stop-color="#7DB8FF"/><stop offset=".6" stop-color="#1E6FFF"/><stop offset="1" stop-color="#0B47C9"/></radialGradient>
    <radialGradient id="halo"><stop offset=".6" stop-color="#3D8BFF" stop-opacity=".3"/><stop offset="1" stop-color="#3D8BFF" stop-opacity="0"/></radialGradient></defs>
    <g id="vp">${links}${gnodes}${center}${cnodes}${empty}</g></svg>`;
}

function bindMap(wrapEl, c) {
  const svg = wrapEl.querySelector('svg'); const vp = svg.querySelector('#vp');
  if (lastNode !== c.id) { view.s = 1; view.tx = 0; view.ty = 0; lastNode = c.id; }
  const apply = () => vp.setAttribute('transform', `translate(${view.tx} ${view.ty}) scale(${view.s})`);
  apply();
  const ratio = () => svg.viewBox.baseVal.width / svg.clientWidth || 1;
  const pts = new Map(); let moved = 0, startDist = 0, startS = 1, downTarget = null;
  svg.addEventListener('pointerdown', e => {
    svg.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) { moved = 0; downTarget = e.target.closest('[data-nid],[data-center]'); }
    if (pts.size === 2) { const [a, b] = [...pts.values()]; startDist = Math.hypot(a.x - b.x, a.y - b.y); startS = view.s; moved = 99; }
  });
  svg.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return; const prev = pts.get(e.pointerId); const cur = { x: e.clientX, y: e.clientY }; pts.set(e.pointerId, cur);
    if (pts.size === 1) { const dx = cur.x - prev.x, dy = cur.y - prev.y; moved += Math.abs(dx) + Math.abs(dy); if (moved > 6) { view.tx += dx * ratio(); view.ty += dy * ratio(); apply(); } }
    else if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); view.s = Math.min(3, Math.max(.4, startS * d / startDist)); apply(); }
  });
  const up = e => {
    pts.delete(e.pointerId);
    if (pts.size === 0 && moved <= 6 && downTarget) {
      if (downTarget.dataset.nid) { nav.partsNode = downTarget.dataset.nid; nav.render(); }
      else if (downTarget.dataset.center) nodeMenu(c);
    }
    if (pts.size === 0) downTarget = null;
  };
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  wrapEl.querySelector('[data-z=in]').onclick = () => { view.s = Math.min(3, view.s * 1.25); apply(); };
  wrapEl.querySelector('[data-z=out]').onclick = () => { view.s = Math.max(.4, view.s / 1.25); apply(); };
  wrapEl.querySelector('[data-z=fit]').onclick = () => { view.s = 1; view.tx = 0; view.ty = 0; apply(); };
}

function fileItem(f) {
  const [k, lbl] = fileKind(f.name); const idx = S.index[f.id];
  return `<div class="item" data-file="${f.id}"><div class="fi ${k}">${lbl}</div>
    <div class="grow"><div class="nm ellip">${esc(f.name)}</div><div class="sz">${f.pinned ? '📌 Đã ghim · ' : ''}${fmtSize(f.size || 0)} · lưu offline${idx ? ` · đã lập chỉ mục ${idx.length} dòng` : ''}</div></div>
    <button class="more" data-fmenu="${f.id}">${ic('dots')}</button></div>`;
}
function linkItem(l) {
  const od = /1drv\.ms|onedrive|sharepoint/i.test(l.url);
  return `<div class="item" data-link="${l.id}"><div class="fi lnk">${ic(od ? 'cloud' : 'link')}</div>
    <div class="grow"><div class="nm ellip">${esc(l.title)}</div><div class="sz ellip">${od ? 'OneDrive · ' : ''}${esc(l.url.replace(/^https?:\/\//, ''))}</div></div>
    <button class="more" data-lmenu="${l.id}">${ic('dots')}</button></div>`;
}

export function viewParts(v) {
  const c = node(nav.partsNode) || node('root'); nav.partsNode = c.id;
  const path = pathTo(c.id); const ch = kids(c.id);
  const h = Math.round(Math.min(Math.max(window.innerHeight * 0.46, 300), 520));
  v.innerHTML = `<div class="fade-in">
    <div class="crumbs">${path.map((p, i) => `${i ? ic('chev') : ''}<button data-crumb="${p.id}" class="${p.id === c.id ? 'cur' : ''}">${esc(p.name)}</button>`).join('')}</div>
    <div class="mapwrap" style="height:${h}px">${buildMap(c)}
      <div class="hint">Chạm nhánh để mở · chụm để phóng to</div>
      <div class="zoombtns"><button data-z="out">${ic('zout')}</button><button data-z="fit">${ic('fit')}</button><button data-z="in">${ic('zin')}</button></div></div>
    <div class="row" style="margin-top:16px"><span style="width:12px;height:12px;border-radius:4px;background:${c.color || '#1E6FFF'};flex:none"></span>
      <div class="grow ellip" style="font-size:19px;font-weight:700">${esc(c.name)}</div>
      <button class="icon-btn" data-nmenu>${ic('dots')}</button></div>
    <div class="actions">
      <button class="act" data-a="branch">${ic('branch')}Thêm nhánh</button>
      <button class="act" data-a="file">${ic('upload')}Thêm file</button>
      <button class="act" data-a="link">${ic('cloud')}Link OneDrive</button></div>
    <div class="sec-h"><h2>Mã / từ khóa &amp; ghi chú</h2><a data-a="codes">${c.codes ? 'Sửa' : 'Thêm'}</a></div>
    <div class="codes" data-a="codes">${c.codes ? esc(c.codes) : '<span class="muted">Chạm để nhập mã vật tư, số bản vẽ, từ khóa, ghi chú… App sẽ tìm được theo các mã này.</span>'}</div>
    <div class="sec-h"><h2>Tài liệu</h2><span class="muted" style="font-size:12.5px">${c.files.length}</span></div>
    ${c.files.length ? [...c.files].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)).map(fileItem).join('') : `<div class="card empty" style="padding:18px">Chưa có file. Bấm “Thêm file” để chọn PDF, Excel, ảnh… (chọn được trực tiếp từ OneDrive)</div>`}
    ${c.links.length ? `<div class="sec-h"><h2>Liên kết OneDrive</h2><span class="muted" style="font-size:12.5px">${c.links.length}</span></div>${c.links.map(linkItem).join('')}` : ''}
    ${ch.length ? `<div class="sec-h"><h2>Nhánh con</h2></div><div class="chips" style="flex-wrap:wrap;margin:0;padding:0">${ch.map(k => `<button class="chip" data-crumb="${k.id}"><span style="display:inline-block;width:8px;height:8px;border-radius:3px;background:${k.color};margin-right:6px"></span>${esc(k.name)}</button>`).join('')}</div>` : ''}
  </div>`;
  bindMap(v.querySelector('.mapwrap'), c);
  $$('[data-crumb]', v).forEach(b => b.onclick = () => { nav.partsNode = b.dataset.crumb; nav.render(); });
  v.querySelector('[data-nmenu]').onclick = () => nodeMenu(c);
  $$('[data-a]', v).forEach(b => b.onclick = () => ({ branch: () => addBranch(c), file: () => addFiles(c), link: () => linkForm(c), codes: () => editCodes(c) })[b.dataset.a]());
  $$('[data-file]', v).forEach(el => el.onclick = e => { if (e.target.closest('[data-fmenu]')) return; const f = c.files.find(x => x.id === el.dataset.file); openF(f); });
  $$('[data-fmenu]', v).forEach(b => b.onclick = () => fileMenu(c, c.files.find(x => x.id === b.dataset.fmenu)));
  $$('[data-link]', v).forEach(el => el.onclick = e => { if (e.target.closest('[data-lmenu]')) return; openUrl(c.links.find(x => x.id === el.dataset.link).url); });
  $$('[data-lmenu]', v).forEach(b => b.onclick = () => { const l = c.links.find(x => x.id === b.dataset.lmenu); menu(l.title, [
    { icon: 'open', label: 'Mở liên kết', run: () => openUrl(l.url) },
    { icon: 'edit', label: 'Sửa', run: () => linkForm(c, l) },
    { icon: 'trash', label: 'Xóa liên kết', danger: true, run: () => { c.links = c.links.filter(x => x !== l); save(); nav.render(); } }]); });
}

export async function openF(f, find) {
  if (canView(f.name, f.mime)) { viewFile({ name: f.name, mime: f.mime, path: f.path, key: f.id, find }); return; }
  try { await openFile(f.path, f.mime, f.name); }
  catch (e) { toast('Không có ứng dụng nào mở được loại file này'); }
}

function nodeMenu(c) {
  const items = [
    { icon: 'branch', label: 'Thêm nhánh con', run: () => addBranch(c) },
    { icon: 'edit', label: 'Đổi tên / màu', run: () => nodeForm(c) },
  ];
  if (c.parentId) {
    items.push({ icon: 'back', label: 'Lên nhánh cha', run: () => { nav.partsNode = c.parentId; nav.render(); } });
    items.push({ icon: 'trash', label: 'Xóa nhánh này', danger: true, run: () => delNode(c) });
  }
  menu(c.name, items);
}
function nodeForm(c, parent) {
  const isNew = !c; let color = c ? c.color : COLORS[(kids(parent.id).length + 1) % COLORS.length];
  openSheet(isNew ? 'Nhánh mới' : 'Sửa nhánh', `
    <div class="field"><label class="lb">Tên nhánh</label><input class="inp" id="nN" value="${esc(c?.name || '')}" placeholder="VD: Van servo, Bơm, Gioăng phớt…"></div>
    <div class="field"><label class="lb">Màu</label><div class="swatches">${COLORS.map(x => `<button data-c="${x}" style="background:${x}" class="${x === color ? 'on' : ''}"></button>`).join('')}</div></div>
    <button class="btn pri" id="nS">${ic('check')} ${isNew ? 'Tạo nhánh' : 'Lưu'}</button>`, (b, close) => {
    setTimeout(() => b.querySelector('#nN').focus(), 320);
    $$('[data-c]', b).forEach(x => x.onclick = () => { color = x.dataset.c; $$('[data-c]', b).forEach(y => y.classList.toggle('on', y === x)); });
    const go = () => {
      const name = b.querySelector('#nN').value.trim(); if (!name) { toast('Nhập tên nhánh'); return; }
      if (isNew) S.state.nodes.push({ id: uid(), parentId: parent.id, name, color, codes: '', files: [], links: [] });
      else { c.name = name; c.color = color; }
      save(); close(); nav.render(); toast(isNew ? 'Đã tạo nhánh' : 'Đã lưu');
    };
    b.querySelector('#nS').onclick = go; b.querySelector('#nN').onkeydown = e => { if (e.key === 'Enter') go(); };
  });
}
const addBranch = c => nodeForm(null, c);
async function delNode(c) {
  const ds = descendants(c.id); const nf = [c, ...ds].reduce((s, n) => s + n.files.length, 0);
  if (!await confirmBox('Xóa nhánh?', `Xóa “${esc(c.name)}”${ds.length ? ` cùng ${ds.length} nhánh con` : ''}${nf ? ` và ${nf} file đã lưu` : ''}. Không thể hoàn tác.`, 'Xóa', true)) return;
  const ids = new Set([c.id, ...ds.map(d => d.id)]);
  for (const n of [c, ...ds]) for (const f of n.files) { await deletePath(f.path); delete S.index[f.id]; }
  S.state.nodes = S.state.nodes.filter(n => !ids.has(n.id));
  S.state.devices.forEach(d => { if (ids.has(d.nodeId)) d.nodeId = ''; });
  nav.partsNode = c.parentId; save({ index: true }); nav.render(); toast('Đã xóa nhánh');
}
async function editCodes(c) {
  const v = await promptBox('Mã / từ khóa & ghi chú', c.name, c.codes, { multi: true, ph: 'VD:\n425-251-745 Bôi trơn dẫn hướng\n300001-665-0 Van điện từ VEI-8A NC', hint: 'Mỗi mã một dòng. Ô tìm kiếm sẽ tìm theo nội dung này.' });
  if (v === null) return; c.codes = v; save(); nav.render();
}
function linkForm(c, l) {
  openSheet(l ? 'Sửa liên kết' : 'Thêm liên kết OneDrive', `
    <div class="field"><label class="lb">Tên hiển thị</label><input class="inp" id="lT" value="${esc(l?.title || '')}" placeholder="VD: Bản vẽ Vol 4 – Máy mài"></div>
    <div class="field"><label class="lb">Đường link</label><input class="inp" id="lU" value="${esc(l?.url || '')}" placeholder="https://1drv.ms/…" inputmode="url"></div>
    <div class="card" style="font-size:13px;color:var(--tx2);margin-bottom:16px"><b style="color:var(--gold2)">Cách lấy link:</b> mở app OneDrive → nhấn giữ file hoặc thư mục → <b>Chia sẻ</b> → <b>Sao chép liên kết</b> → quay lại đây dán vào ô trên.</div>
    <button class="btn pri" id="lS">${ic('check')} Lưu liên kết</button>`, (b, close) => {
    b.querySelector('#lS').onclick = () => {
      let url = b.querySelector('#lU').value.trim(); const title = b.querySelector('#lT').value.trim();
      const m = url.match(/https?:\/\/\S+/); if (!m) { toast('Link phải bắt đầu bằng https://'); return; } url = m[0];
      const t = title || (/1drv|onedrive|sharepoint/i.test(url) ? 'Thư mục OneDrive' : url.replace(/^https?:\/\//, '').slice(0, 40));
      if (l) Object.assign(l, { url, title: t }); else c.links.push({ id: uid(), title: t, url });
      save(); close(); nav.render(); toast('Đã lưu liên kết');
    };
  });
}
function fileMenu(c, f) {
  menu(f.name, [
    { icon: 'open', label: 'Mở file', run: () => openF(f) },
    { icon: 'pin', label: f.pinned ? 'Bỏ ghim' : 'Ghim lên đầu', run: () => { f.pinned = !f.pinned; save(); nav.render(); } },
    { icon: 'edit', label: 'Đổi tên', run: async () => { const n = await promptBox('Đổi tên file', 'Tên file', f.name); if (n) { f.name = n; save(); nav.render(); } } },
    { icon: 'trash', label: 'Xóa file', danger: true, run: async () => {
      if (!await confirmBox('Xóa file?', `“${esc(f.name)}” sẽ bị xóa khỏi app (file gốc trên OneDrive không bị ảnh hưởng).`, 'Xóa', true)) return;
      await deletePath(f.path); delete S.index[f.id]; c.files = c.files.filter(x => x !== f); save({ index: true }); nav.render(); } },
  ]);
}

async function addFiles(c) {
  const files = await pickFiles('*/*', true); if (!files.length) return;
  const big = files.filter(f => f.size > 150 * 1048576);
  if (big.length && !await confirmBox('File rất lớn', `${esc(big[0].name)} nặng ${fmtSize(big[0].size)}. Lưu offline sẽ tốn bộ nhớ và mất thời gian. Với file lớn nên dùng “Link OneDrive”. Vẫn tiếp tục?`, 'Vẫn lưu')) return;
  const b = busy('Đang lưu file…'); let ok = 0, indexed = 0;
  try {
    for (let i = 0; i < files.length; i++) {
      const f = files[i]; const id = uid(); const ext = extOf(f.name); const path = `files/${id}${ext ? '.' + ext : ''}`;
      b.set(`Đang lưu ${i + 1}/${files.length}: ${f.name}`);
      await saveBlob(path, f, p => b.set(`Đang lưu ${i + 1}/${files.length}: ${Math.round(p * 100)}%`));
      c.files.push({ id, name: f.name, size: f.size, mime: f.type || MIME[ext] || 'application/octet-stream', path, added: today() });
      ok++;
      if (['xls', 'xlsx', 'xlsm', 'csv'].includes(ext) && f.size < 25 * 1048576) {
        b.set(`Đang đọc nội dung ${f.name}…`);
        try { const lines = await indexSheet(f); if (lines.length) { S.index[id] = lines; indexed++; } } catch (e) { console.warn(e); }
      }
    }
  } catch (e) { console.error(e); toast('Lỗi khi lưu file: ' + (e.message || e)); }
  b.done(); save({ index: true }); nav.render();
  if (ok) toast(`Đã thêm ${ok} file${indexed ? ` · tìm được theo nội dung ${indexed} file Excel` : ''}`);
}
async function indexSheet(file) {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const out = [];
  for (const sn of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, blankrows: false, raw: false, defval: '' });
    rows.forEach((r, i) => {
      const cells = r.map(x => String(x).trim()).filter(Boolean); if (!cells.length) return;
      out.push(`${wb.SheetNames.length > 1 ? sn + ' · ' : ''}dòng ${i + 1}: ${cells.join(' | ')}`);
    });
    if (out.length > 30000) break;
  }
  return out.slice(0, 30000);
}
