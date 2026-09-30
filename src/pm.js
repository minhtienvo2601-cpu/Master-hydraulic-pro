// Theo dõi THAY THẾ ĐỊNH KỲ: khu vực → hệ thống → loại vật tư → vị trí
// Nhập thẳng từ file Excel MASTER_DATA (sheet Lọc, Khớp nối hoa mai, Khớp nối mềm, Dầu mỡ, Ống mềm, Bình tích áp…)
// và xuất lại Excel giữ đúng cấu trúc đó, thêm cột Còn lại / Trạng thái.
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { S, save, newBacklog, REASONS, pathInUse } from './store.js';
import { nav, push, pop, cur } from './nav.js';
import { ic } from './icons.js';
import { $$, esc, uid, today, addDays, daysTo, ymd, norm, matcher } from './util.js';
import { openSheet, toast, busy, confirmBox, promptBox, menu, viewPhoto, addPhotos } from './ui.js';
import { pickFiles, deletePath } from './platform.js';
import { lazyImgs, fullOf } from './lazy.js';
import { deliver } from './viewer.js';

// ======================= DỮ LIỆU =======================
export function pm() { const st = S.state; if (!st.pm) st.pm = { area: '', types: [], items: [] }; return st.pm; }
const natural = (a, b) => String(a).localeCompare(String(b), 'vi', { numeric: true, sensitivity: 'base' });
const typeOf = id => pm().types.find(t => t.id === id);
const itemOf = id => pm().items.find(i => i.id === id);
// khu vực đang xem ('' = tất cả)
const areasOf = () => [...new Set(pm().items.map(i => i.area || '').filter(Boolean))].sort(natural);
function scoped() { const P = pm(); if (P.cur && !areasOf().includes(P.cur)) P.cur = ''; return P.cur ? P.items.filter(i => i.area === P.cur) : P.items; }
const areaName = () => { const P = pm(); return P.cur || areasOf().join(', ') || P.area || ''; };
// xóa file ảnh không còn dùng
function dropPhotos(list) { for (const p of list) if (p && !pathInUse(p)) deletePath(p); }
const histPhotos = its => its.flatMap(i => (i.hist || []).flatMap(h => h.photos || []));
const dmy = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '';
const dmy2 = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}` : '';
const fmtN = n => n == null || n === '' ? '' : Number(n).toLocaleString('vi-VN');

export function lastDate(it) { let d = it.start || ''; for (const h of it.hist || []) if (h.d > d) d = h.d; return d; }
// k: red quá hạn · amb ≤30 ngày · ok còn hạn · nodate chưa có ngày · nocyc chưa đặt chu kỳ
export function info(it) {
  const last = lastDate(it); const used = last ? -daysTo(last) : null;
  if (!it.cycle) return { last, used, left: null, due: '', k: 'nocyc' };
  if (!last) return { last, used, left: null, due: '', k: 'nodate' };
  const left = it.cycle - used;
  return { last, used, left, due: addDays(last, it.cycle), k: left < 0 ? 'red' : left <= 30 ? 'amb' : 'ok' };
}
const label = it => it.pos || it.sys || '—';
const place = it => it.loc || it.extra?.app || '';
const doneWord = t => t?.kind === 'kiemtra' ? 'kiểm tra' : 'thay';
function stCell(inf) {
  if (inf.k === 'nocyc') return `<span class="st none">Chưa đặt chu kỳ</span>`;
  if (inf.k === 'nodate') return `<span class="st none">Chưa có ngày</span>`;
  return `<span class="st ${inf.k}">${inf.left < 0 ? 'Quá ' + (-inf.left) : inf.left}</span>`;
}
function counts(items) {
  const c = { t: items.length, red: 0, amb: 0, ok: 0, none: 0 };
  for (const it of items) { const k = info(it).k; if (k === 'red' || k === 'amb' || k === 'ok') c[k]++; else c.none++; }
  return c;
}
const systems = items => [...new Set(items.map(i => i.sys).filter(Boolean))].sort(natural);

// ======================= MÀN HÌNH CHÍNH (tab Định kỳ) =======================
const n0 = (v, cls) => v ? `<b class="${cls}">${v}</b>` : '<span class="muted">–</span>';
function mxHead(first) { return `<div class="tb-h"><div class="grow">${first}</div><div class="mx">Tổng</div><div class="mx red">Quá</div><div class="mx amb">≤30N</div><div class="mx ok">Còn</div><div class="mx">Chưa</div></div>`; }
function mxRow(lbl, sub, c, attrs) {
  return `<button class="tb-r" ${attrs}><div class="grow" style="min-width:0;text-align:left"><div class="tb-t wrap">${esc(lbl)}</div>${sub ? `<div class="tb-s">${esc(sub)}</div>` : ''}</div>
    <div class="mx">${c.t}</div><div class="mx">${n0(c.red, 'red')}</div><div class="mx">${n0(c.amb, 'amb')}</div><div class="mx">${n0(c.ok, 'ok')}</div><div class="mx">${c.none || '<span class="muted">–</span>'}</div></button>`;
}
export function viewPM(v) {
  const P = pm();
  if (!P.items.length) {
    v.innerHTML = `<div class="fade-in"><div class="card" style="text-align:center;padding:26px 18px">
      <div style="width:56px;height:56px;border-radius:18px;background:var(--goldDim);color:var(--gold2);display:grid;place-items:center;margin:0 auto 12px">${ic('repeat')}</div>
      <div style="font-size:18px;font-weight:800">Thay thế định kỳ</div>
      <div class="muted" style="font-size:13.5px;margin:6px 0 16px">Theo dõi hạn thay lõi lọc, dầu, ống mềm, khớp nối… theo từng hệ thống. Nhập thẳng từ file Excel đang theo dõi (VD: MASTER_DATA_MATERIAL_HSM.xlsx).</div>
      <button class="btn pri" id="pmImp">${ic('upload')} Nhập từ file Excel</button>
      <button class="btn sec" id="pmAdd" style="margin-top:10px">${ic('plus')} Thêm vị trí thủ công</button></div></div>`;
    v.querySelector('#pmImp').onclick = importExcel; v.querySelector('#pmAdd').onclick = () => itemForm(null, {});
    return;
  }
  const AR = areasOf(); const IT = scoped(); const all = counts(IT);
  v.innerHTML = `<div class="fade-in">
    ${AR.length > 1 ? `<div class="chips" style="margin-bottom:10px">${['', ...AR].map(a => `<button class="chip ${a === (P.cur || '') ? 'on' : ''}" data-ar="${esc(a)}">${a ? esc(a) : 'Tất cả khu vực'}<span class="c">${a ? P.items.filter(i => i.area === a).length : P.items.length}</span></button>`).join('')}</div>` : ''}
    <div class="pm-tiles">
      <button class="pm-tile red" data-go="due"><b>${all.red}</b><span>Quá hạn</span></button>
      <button class="pm-tile amb" data-go="due"><b>${all.amb}</b><span>Trong 30 ngày</span></button>
      <button class="pm-tile" data-go="all"><b>${all.none}</b><span>Chưa có ngày / chu kỳ</span></button>
    </div>
    <div class="pm-acts">
      <button data-a="due">${ic('clock')}<span>Cần xử lý</span></button>
      <button data-a="need">${ic('cart')}<span>Nhu cầu vật tư</span></button>
      <button data-a="imp">${ic('upload')}<span>Nhập Excel</span></button>
      <button data-a="exp">${ic('file')}<span>Xuất Excel</span></button>
    </div>
    <div class="sec-h"><h2>Theo loại vật tư</h2><span class="muted" style="font-size:12.5px">${esc(areaName())}${areaName() ? ' · ' : ''}${IT.length} vị trí</span></div>
    <div class="tb">${mxHead('Loại vật tư')}${P.types.filter(t => IT.some(i => i.type === t.id)).map(t => { const its = IT.filter(i => i.type === t.id); return mxRow(t.name, t.cycle ? `Chu kỳ chính ${t.cycle} ngày` : 'Chưa đặt chu kỳ', counts(its), `data-t="${t.id}"`); }).join('')}</div>
    <div class="sec-h"><h2>Theo hệ thống</h2></div>
    <div class="tb">${mxHead('Hệ thống')}${systems(IT).map(s => mxRow(s, '', counts(IT.filter(i => i.sys === s)), `data-s="${esc(s)}"`)).join('')}</div>
    <div class="muted" style="font-size:12px;margin:4px 2px 0">Quá: đã quá hạn · ≤30N: còn ≤ 30 ngày · Chưa: chưa có ngày thay hoặc chưa đặt chu kỳ</div>
  </div>`;
  $$('[data-ar]', v).forEach(b => b.onclick = () => { P.cur = b.dataset.ar; save(); nav.render(); });
  $$('[data-t]', v).forEach(b => b.onclick = () => push({ v: 'pmtype', t: b.dataset.t, sys: '', sort: 'sys' }));
  $$('[data-s]', v).forEach(b => b.onclick = () => push({ v: 'pmtype', t: 'all', sys: b.dataset.s, sort: 'sys' }));
  $$('[data-go]', v).forEach(b => b.onclick = () => b.dataset.go === 'due' ? push({ v: 'pmdue', range: 30 }) : push({ v: 'pmtype', t: 'all', sys: '', sort: 'left' }));
  $$('[data-a]', v).forEach(b => b.onclick = () => ({ due: () => push({ v: 'pmdue', range: 60 }), need: () => push({ v: 'pmneed', range: 60 }), imp: importExcel, exp: () => exportPM() })[b.dataset.a]());
}

// ======================= BẢNG THEO LOẠI =======================
function rowHtml(it, withType, sel) {
  const inf = info(it); const t = withType ? typeOf(it.type) : null;
  const code = it.code || (it.alt ? `<span class="amb-t">QĐ ${esc(it.alt)}</span>` : '<span class="amb-t">Thiếu mã</span>');
  const qty = it.qty != null && it.qty !== '' && !(it.qty == 1 && (it.unit || 'cái') === 'cái') ? ` ×${fmtN(it.qty)}${it.unit && it.unit !== 'cái' ? ' ' + esc(it.unit) : ''}` : '';
  return `<button class="tb-r${sel ? ' sel' : ''}" data-i="${it.id}">
    ${sel != null ? `<span class="cbx2${sel ? ' on' : ''}">${sel ? ic('check', 3) : ''}</span>` : ''}
    <div class="tc-pos">${esc(label(it))}</div>
    <div class="grow" style="min-width:0;text-align:left"><div class="tb-t">${t ? `<span class="tag">${esc(t.name)}</span>` : ''}${esc(place(it) || it.vt || '')}</div><div class="tb-s mono">${code}${qty}</div></div>
    <div class="tc-date">${inf.last ? dmy2(inf.last) : '–'}</div>
    <div class="tc-date dk">${it.cycle || '–'}</div><div class="tc-date dk">${inf.due ? dmy2(inf.due) : '–'}</div>
    <div class="tc-left">${stCell(inf)}</div></button>`;
}
export function viewPMType(v, r) {
  const P = pm(); r.q = r.q || ''; r.sort = r.sort || 'sys';
  const IT = scoped(); const base = r.t === 'all' ? IT : IT.filter(i => i.type === r.t);
  const syss = systems(base);
  const t = typeOf(r.t);
  v.innerHTML = `<div class="fade-in">
    <div class="pm-tabs">${[{ id: 'all', name: 'Tất cả', n: IT.length }, ...P.types.map(x => ({ id: x.id, name: x.name, n: IT.filter(i => i.type === x.id).length })).filter(x => x.n || x.id === r.t)]
      .map(x => `<button class="${x.id === r.t ? 'on' : ''}" data-tt="${x.id}">${esc(x.name)} <small>${x.n}</small></button>`).join('')}</div>
    <div class="chips" style="margin:10px 0 0;padding:0">${['', ...syss].map(s => `<button class="chip ${s === r.sys ? 'on' : ''}" data-sy="${esc(s)}">${s ? esc(s) : 'Tất cả'}</button>`).join('')}</div>
    <div class="pm-tool">
      <div class="searchbox" style="height:42px;flex:1">${ic('search')}<input id="pmQ" placeholder="Tìm vị trí, mã, tên…" value="${esc(r.q)}" autocomplete="off"></div>
      <button class="icon-btn" id="pmSort" title="Sắp xếp" aria-label="Sắp xếp">${ic(r.sort === 'sys' ? 'list' : 'clock')}</button>
      <button class="icon-btn ${r.selMode ? 'on' : ''}" id="pmSel" title="Chọn nhiều" aria-label="Chọn nhiều">${ic('check')}</button>
      ${t ? `<button class="icon-btn" id="pmTm" aria-label="Tùy chọn loại">${ic('dots')}</button>` : ''}
    </div>
    <div class="muted" id="pmInfo" style="font-size:12.5px;margin:8px 2px"></div>
    <div id="pmTbl"></div>
    <div style="height:${r.selMode ? 90 : 20}px"></div>
  </div>
  ${r.selMode ? `<div class="pm-selbar"><span id="pmSelN">Đã chọn 0</span><button class="btn sec" id="pmSelAll">Chọn tất cả</button><button class="btn pri" id="pmSelDo">${ic('check')} Ghi đã ${doneWord(t)}</button></div>` : ''}`;
  r.picked = r.picked || new Set();
  const draw = () => {
    const m = r.q.trim() ? matcher(r.q) : null;
    let list = base.filter(i => (!r.sys || i.sys === r.sys) && (!m || [i.pos, i.sys, i.loc, i.code, i.vt, i.alt, i.altVt, i.extra?.app, i.extra?.dwg].some(x => m(x))));
    const head = `<div class="tb-h">${r.selMode ? '<span style="width:22px"></span>' : ''}<div class="tc-pos">Vị trí</div><div class="grow">Tên vị trí · mã VT</div><div class="tc-date">Lần cuối</div><div class="tc-date dk">Chu kỳ</div><div class="tc-date dk">Hạn tới</div><div class="tc-left">Còn (ngày)</div></div>`;
    let body = '';
    const sel = it => r.selMode ? r.picked.has(it.id) : null;
    if (r.sort === 'left') {
      list = [...list].sort((a, b) => { const x = info(a), y = info(b); return (x.left ?? 1e9) - (y.left ?? 1e9) || natural(label(a), label(b)); });
      body = list.map(it => rowHtml(it, r.t === 'all', sel(it))).join('');
    } else {
      const g = new Map(); for (const it of list) { const k = it.sys || '(khác)'; if (!g.has(k)) g.set(k, []); g.get(k).push(it); }
      for (const k of [...g.keys()].sort(natural)) {
        const xs = g.get(k).sort((a, b) => (r.t === 'all' ? natural(typeOf(a.type)?.name || '', typeOf(b.type)?.name || '') : 0) || natural(label(a), label(b)));
        const c = counts(xs);
        body += `<div class="tb-g">${esc(k)} <span>· ${xs.length} vị trí${c.red ? ` · <b class="red">${c.red} quá hạn</b>` : ''}${c.amb ? ` · <b class="amb">${c.amb} ≤30N</b>` : ''}</span></div>` + xs.map(it => rowHtml(it, r.t === 'all', sel(it))).join('');
      }
    }
    const c = counts(list);
    v.querySelector('#pmInfo').innerHTML = `${list.length} vị trí · <b class="red">${c.red}</b> quá hạn · <b class="amb">${c.amb}</b> ≤30 ngày · ${c.none} chưa có ngày/chu kỳ${r.sort === 'left' ? ' · <b>sắp theo hạn</b>' : ''}`;
    v.querySelector('#pmTbl').innerHTML = list.length ? `<div class="tb">${head}${body}</div>` : `<div class="empty">${ic('search')}Không có vị trí nào</div>`;
    $$('#pmTbl [data-i]', v).forEach(b => b.onclick = () => {
      if (r.selMode) { const id = b.dataset.i; r.picked.has(id) ? r.picked.delete(id) : r.picked.add(id); b.classList.toggle('sel'); const cb = b.querySelector('.cbx2'); cb.classList.toggle('on'); cb.innerHTML = r.picked.has(id) ? ic('check', 3) : ''; updSel(); }
      else push({ v: 'pmitem', id: b.dataset.i });
    });
    r._list = list; updSel();
  };
  const updSel = () => { const n = v.querySelector('#pmSelN'); if (n) n.textContent = `Đã chọn ${r.picked.size}`; };
  $$('[data-tt]', v).forEach(b => b.onclick = () => { r.t = b.dataset.tt; r.sys = ''; r.picked = new Set(); nav.render(); });
  $$('[data-sy]', v).forEach(b => b.onclick = () => { r.sys = b.dataset.sy; nav.render(); });
  const q = v.querySelector('#pmQ'); let qt = null; q.oninput = () => { clearTimeout(qt); qt = setTimeout(() => { r.q = q.value; draw(); }, 150); };
  v.querySelector('#pmSort').onclick = () => { r.sort = r.sort === 'sys' ? 'left' : 'sys'; toast(r.sort === 'left' ? 'Sắp theo hạn gần nhất' : 'Nhóm theo hệ thống'); nav.render(); };
  v.querySelector('#pmSel').onclick = () => { r.selMode = !r.selMode; r.picked = new Set(); nav.render(); };
  const tm = v.querySelector('#pmTm'); if (tm) tm.onclick = () => typeMenu(t, base);
  if (r.selMode) {
    v.querySelector('#pmSelAll').onclick = () => { (r._list || []).forEach(i => r.picked.add(i.id)); draw(); };
    v.querySelector('#pmSelDo').onclick = () => { const its = [...r.picked].map(itemOf).filter(Boolean); if (!its.length) { toast('Chưa chọn vị trí nào'); return; } markDone(its, () => { r.selMode = false; r.picked = new Set(); nav.render(); }); };
  }
  draw();
}
function typeMenu(t, its) {
  menu(t.name, [
    { icon: 'repeat', label: `Đặt chu kỳ cho loại này${t.cycle ? ` (đang ${t.cycle} ngày)` : ''}`, run: async () => {
      const val = await promptBox('Chu kỳ ' + t.name, 'Số ngày (VD: 180, 360, 730)', String(t.cycle || ''), { hint: 'Áp dụng cho các vị trí CHƯA có chu kỳ riêng. Vị trí đã có chu kỳ giữ nguyên.' });
      if (val == null) return; const n = parseInt(val, 10); if (!(n > 0)) { toast('Số ngày không hợp lệ'); return; }
      const old = t.cycle; t.cycle = n; let k = 0; for (const it of its) if (!it.cycle || it.cycle === old) { it.cycle = n; k++; }
      save(); nav.render(); toast(`Đã đặt ${n} ngày cho ${k} vị trí`);
    } },
    { icon: 'plus', label: 'Thêm vị trí vào loại này', run: () => itemForm(null, { type: t.id }) },
    { icon: 'edit', label: 'Đổi tên loại', run: async () => { const n = await promptBox('Đổi tên loại', 'Tên loại vật tư', t.name); if (n) { t.name = n; save(); nav.render(); } } },
    { icon: 'trash', label: `Xóa loại và ${pm().items.filter(i => i.type === t.id).length} vị trí`, danger: true, run: async () => {
      if (!await confirmBox('Xóa cả loại?', `Loại “${esc(t.name)}” và ${pm().items.filter(i => i.type === t.id).length} vị trí (kèm lịch sử thay${areasOf().length > 1 ? ', ở mọi khu vực' : ''}) sẽ bị xóa.`, 'Xóa', true)) return;
      const P = pm(); const gone = P.items.filter(i => i.type === t.id); P.items = P.items.filter(i => i.type !== t.id); P.types = P.types.filter(x => x !== t); dropPhotos(histPhotos(gone)); save(); pop(); toast('Đã xóa loại ' + t.name);
    } },
  ]);
}

// ======================= CẦN XỬ LÝ (sắp theo hạn) =======================
export function viewPMDue(v, r) {
  const range = r.range || 60;
  const list = scoped().map(it => ({ it, inf: info(it) })).filter(x => x.inf.left != null && x.inf.left <= range).sort((a, b) => a.inf.left - b.inf.left || natural(label(a.it), label(b.it)));
  v.innerHTML = `<div class="fade-in">
    <div class="seg3">${[30, 60, 90].map(n => `<button class="${n === range ? 'on' : ''}" data-r="${n}">${n === 30 ? 'Quá hạn + 30 ngày' : n + ' ngày'}</button>`).join('')}</div>
    <div class="muted" style="font-size:12.5px;margin:10px 2px">${list.length} vị trí đến hạn trong ${range} ngày tới (gồm cả quá hạn) · bấm ✓ để ghi đã thay</div>
    ${list.length ? `<div class="tb"><div class="tb-h"><div class="grow">Vị trí · việc cần làm</div><div class="tc-left">Còn (ngày)</div><div style="width:40px;text-align:center">Xong</div></div>
      ${list.map(({ it, inf }) => { const t = typeOf(it.type); return `<div class="tb-r" data-i="${it.id}"><div class="grow" style="min-width:0">
        <div class="tb-t"><span class="pos-t">${esc(label(it))}</span><span class="tag">${esc(t?.name || '')}</span></div>
        <div class="tb-s">${esc([place(it), it.code || it.alt].filter(Boolean).join(' · '))}</div></div>
        <div class="tc-left">${stCell(inf)}</div><button class="okbtn" data-ok="${it.id}" aria-label="Ghi đã thay">${ic('check', 2.6)}</button></div>`; }).join('')}</div>`
      : `<div class="empty">${ic('done')}Không có vị trí nào đến hạn trong ${range} ngày</div>`}
  </div>`;
  $$('[data-r]', v).forEach(b => b.onclick = () => { r.range = +b.dataset.r; nav.render(); });
  $$('[data-i]', v).forEach(el => el.onclick = e => { if (e.target.closest('[data-ok]')) return; push({ v: 'pmitem', id: el.dataset.i }); });
  $$('[data-ok]', v).forEach(b => b.onclick = () => markDone([itemOf(b.dataset.ok)]));
}

// ======================= CHI TIẾT MỘT VỊ TRÍ =======================
export function viewPMItem(v, r) {
  const it = itemOf(r.id); if (!it) { pop(); return; }
  const t = typeOf(it.type); const inf = info(it);
  const kv = (k, val, mono) => val === '' || val == null ? '' : `<div class="kv"><div>${k}</div><div class="${mono ? 'mono' : ''}">${val}</div></div>`;
  const hist = [...(it.hist || [])].sort((a, b) => a.d.localeCompare(b.d));
  let prev = it.start || '';
  const hrows = hist.map((h, i) => { const used = prev ? -daysTo(prev) + daysTo(h.d) : null; prev = h.d;
    return `<button class="tb-r" data-h="${it.hist.indexOf(h)}"><div style="width:34px;font-weight:800">${i + 1}</div><div style="width:86px" class="num">${dmy(h.d)}</div><div style="width:58px;text-align:right" class="num">${used != null ? used : '–'}</div>
      <div class="grow" style="min-width:0;padding-left:8px;text-align:left"><div class="tb-s" style="font-family:inherit;color:var(--tx2)">${esc([h.cond, h.qty ? 'SL ' + fmtN(h.qty) : '', h.note, h.by].filter(Boolean).join(' · ') || '')}</div>
      ${(h.photos || []).length ? `<div class="hph">${h.photos.map(p => `<img data-src="${esc(p)}" alt="">`).join('')}</div>` : ''}</div></button>`; }).join('');
  v.innerHTML = `<div class="fade-in">
    <div class="pm-head"><div><div class="muted" style="font-size:12px">${esc(t?.name || '')} · ${esc(it.sys || '')}</div><div style="font-size:20px;font-weight:800">${esc(label(it))}${place(it) ? ' · ' + esc(place(it)) : ''}</div></div><button class="icon-btn" id="pmIm" aria-label="Tùy chọn">${ic('dots')}</button></div>
    <div class="tb kvt">
      ${kv('Còn lại', stCell(inf) + (inf.due ? ` <span class="muted" style="font-size:12.5px">hạn ${dmy(inf.due)}</span>` : ''))}
      ${kv('Mã vật tư', esc(it.code || '(chưa có)'), true)}${kv('Tên vật tư', esc(it.vt))}
      ${kv('Mã quy đổi', esc(it.alt), true)}${kv('Tên quy đổi', esc(it.altVt))}
      ${kv('Số lượng', it.qty != null && it.qty !== '' ? fmtN(it.qty) + ' ' + esc(it.unit || 'cái') : '<span class="muted">(chưa có)</span>')}
      ${kv('Chu kỳ', it.cycle ? it.cycle + ' ngày' : '<span class="muted">Chưa đặt</span>')}
      ${kv('Ngày lắp', dmy(it.start))}${kv(`Thay lần cuối`, inf.last ? dmy(inf.last) : '<span class="muted">(chưa có)</span>')}${kv('Đã dùng', inf.used != null ? inf.used + ' ngày' : '')}
      ${kv('Bản vẽ', esc([it.extra?.dwg, it.extra?.page ? 'trang ' + it.extra.page : ''].filter(Boolean).join(' · ')))}${kv('Thông số', esc(it.extra?.spec || ''))}${kv('Ghi chú', esc(it.note))}
    </div>
    <div class="sec-h"><h2>Lịch sử ${doneWord(t)}</h2><span class="muted" style="font-size:12.5px">${hist.length} lần</span></div>
    ${hist.length ? `<div class="tb"><div class="tb-h"><div style="width:34px">Lần</div><div style="width:86px">Ngày</div><div style="width:58px;text-align:right">Dùng</div><div class="grow" style="padding-left:8px">Ghi chú</div></div>${hrows}</div>` : `<div class="empty" style="padding:20px">Chưa có lần ${doneWord(t)} nào${it.start ? ' (lắp ngày ' + dmy(it.start) + ')' : ''}</div>`}
    <div style="height:84px"></div>
  </div>
  <div class="pm-bot"><button class="btn sec" id="pmHold">${ic('clock')} Hoãn</button><button class="btn pri" id="pmDone">${ic('check')} Ghi đã ${doneWord(t)}</button></div>`;
  lazyImgs(v); $$('img[data-src]', v).forEach(im => { im.onclick = e => { e.stopPropagation(); viewPhoto(fullOf(im)); }; });
  v.querySelector('#pmDone').onclick = () => markDone([it]);
  v.querySelector('#pmHold').onclick = () => holdItem(it);
  v.querySelector('#pmIm').onclick = () => menu(label(it), [
    { icon: 'edit', label: 'Sửa thông tin vị trí', run: () => itemForm(it) },
    { icon: 'trash', label: 'Xóa vị trí này', danger: true, run: async () => { if (!await confirmBox('Xóa vị trí?', `${esc(label(it))} và lịch sử thay sẽ bị xóa.`, 'Xóa', true)) return; pm().items = pm().items.filter(x => x !== it); dropPhotos(histPhotos([it])); save(); pop(); toast('Đã xóa'); } },
  ]);
  $$('[data-h]', v).forEach(b => b.onclick = () => { const h = it.hist[+b.dataset.h]; menu(`Lần ${doneWord(t)} ${dmy(h.d)}`, [
    { icon: 'cal', label: 'Sửa ngày', run: async () => { const d = await promptBox('Sửa ngày', 'Ngày (dd/mm/yyyy)', dmy(h.d)); const y = d && parseDateText(d); if (y) { h.d = y; save(); nav.render(); } else if (d) toast('Ngày không hợp lệ'); } },
    { icon: 'trash', label: 'Xóa lần này', danger: true, run: async () => { if (!await confirmBox('Xóa lần thay này?', dmy(h.d), 'Xóa', true)) return; it.hist.splice(+b.dataset.h, 1); dropPhotos(h.photos || []); save(); nav.render(); } },
  ]); });
}

// ---------- ghi đã thay (1 hoặc nhiều vị trí) ----------
export function markDone(items, after) {
  const one = items.length === 1 ? items[0] : null; const t = typeOf(items[0].type); const w = doneWord(t);
  const conds = t?.kind === 'kiemtra' ? ['Đạt', 'Cần xử lý'] : ['Bình thường', 'Bẩn / mòn', 'Hỏng'];
  let cond = ''; let photos = []; let saved = false;
  openSheet(`Ghi nhận đã ${w}`, `
    <div class="muted" style="font-size:13px;margin:-4px 0 12px">${one ? `${esc(label(one))}${place(one) ? ' · ' + esc(place(one)) : ''} · <span class="mono">${esc(one.code || one.alt || '')}</span>` : `${items.length} vị trí: ${esc(items.slice(0, 6).map(label).join(', '))}${items.length > 6 ? '…' : ''}`}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="field"><label class="lb" for="mdD">Ngày ${w}</label><input type="date" class="inp" id="mdD" value="${today()}"></div>
      <div class="field"><label class="lb" for="mdQ">Số lượng${one ? '' : ' / vị trí'}</label><input class="inp" id="mdQ" inputmode="decimal" value="${one && one.qty != null ? esc(one.qty) : ''}" placeholder="theo vị trí"></div>
    </div>
    <div class="field"><label class="lb">Tình trạng ${t?.kind === 'kiemtra' ? '' : 'vật tư cũ'}</label><div class="seg3" id="mdC">${conds.map(c => `<button data-c="${c}">${c}</button>`).join('')}</div></div>
    <div class="field"><label class="lb" for="mdN">Ghi chú</label><input class="inp" id="mdN" placeholder="VD: dùng bộ lọc A, mã quy đổi…"></div>
    <button class="btn sec" id="mdP">${ic('camera')} <span>Thêm ảnh (tùy chọn)</span></button>
    <div id="mdNext" class="pm-next"></div>
    <button class="btn pri" id="mdOk" style="margin-top:12px">${ic('check')} Lưu đã ${w}</button>`, (b, close) => {
    const nx = () => { const d = b.querySelector('#mdD').value; const c = one ? one.cycle : items[0].cycle; b.querySelector('#mdNext').innerHTML = d && c ? `${ic('clock')} Hạn tiếp theo: <b>${dmy(addDays(d, c))}</b> (${c} ngày)` : ''; };
    b.querySelector('#mdD').oninput = nx; nx();
    $$('[data-c]', b).forEach(x => x.onclick = () => { cond = cond === x.dataset.c ? '' : x.dataset.c; $$('[data-c]', b).forEach(y => y.classList.toggle('on', y.dataset.c === cond)); });
    b.querySelector('#mdP').onclick = async () => { await addPhotos(p => { photos.push(p); b.querySelector('#mdP span').textContent = `Đã thêm ${photos.length} ảnh – bấm để thêm`; }); };
    b.querySelector('#mdOk').onclick = () => {
      const d = b.querySelector('#mdD').value; if (!d) { toast('Chọn ngày'); return; }
      const qv = b.querySelector('#mdQ').value.trim(); const note = b.querySelector('#mdN').value.trim(); const by = S.state.settings.name || '';
      for (const it of items) { it.hist = it.hist || []; it.hist.push({ d, qty: qv ? Number(qv.replace(',', '.')) || qv : (it.qty ?? ''), cond, note, by, photos: [...photos] }); }
      saved = true; save(); close(); toast(`✔ Đã ghi ${items.length} vị trí${one && one.cycle ? ' · hạn tới ' + dmy(addDays(d, one.cycle)) : ''}`);
      after ? after() : nav.render();
    };
  }, { onClose: () => { if (!saved) dropPhotos(photos); } });
}
// ---------- hoãn → tạo tồn đọng ----------
function holdItem(it) {
  const t = typeOf(it.type);
  openSheet('Hoãn – chưa thay được', `<div class="muted" style="font-size:13px;margin:-4px 0 12px">App tạo một mục <b>tồn đọng</b> để theo dõi ở Nhật ký, hạn thay giữ nguyên.</div>
    ${Object.entries(REASONS).map(([k, l]) => `<button class="menu-item" data-k="${k}">${ic('clock')}<span>${l}</span></button>`).join('')}`, (b, close) => {
    $$('[data-k]', b).forEach(x => x.onclick = () => {
      newBacklog({ desc: `Chưa ${doneWord(t)} định kỳ: ${label(it)}${place(it) ? ' – ' + place(it) : ''} (${t?.name || ''})`, parts: [it.code || it.alt, it.vt].filter(Boolean).join(' – '), reason: x.dataset.k, severity: info(it).k === 'red' ? 1 : 2, action: `Thay ${it.vt || ''}`.trim() });
      save(); close(); toast('Đã tạo tồn đọng – xem ở Nhật ký');
    });
  });
}
// ---------- thêm / sửa vị trí ----------
export function itemForm(it, preset = {}) {
  const P = pm(); const isNew = !it; it = it || { id: uid(), area: P.cur || P.area || '', type: preset.type || P.types[0]?.id || '', sys: preset.sys || '', pos: '', loc: '', code: '', vt: '', alt: '', altVt: '', qty: 1, unit: 'cái', cycle: 0, start: '', hist: [], note: '', extra: {} };
  const syss = systems(P.items);
  openSheet(isNew ? 'Thêm vị trí thay thế' : 'Sửa vị trí', `
    <div class="field"><label class="lb" for="ifT">Loại vật tư</label><select class="inp" id="ifT">${P.types.length ? '' : '<option value="">– Chọn loại –</option>'}${P.types.map(t => `<option value="${t.id}" ${t.id === it.type ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}<option value="__new">＋ Loại mới…</option></select></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="field"><label class="lb" for="ifS">Hệ thống</label><input class="inp" id="ifS" list="ifSL" value="${esc(it.sys)}" placeholder="HR1"><datalist id="ifSL">${syss.map(s => `<option value="${esc(s)}">`).join('')}</datalist></div>
      <div class="field"><label class="lb" for="ifP">Mã vị trí</label><input class="inp" id="ifP" value="${esc(it.pos)}" placeholder="HR1-01"></div></div>
    <div class="field"><label class="lb" for="ifL">Vị trí lắp đặt</label><input class="inp" id="ifL" value="${esc(it.loc)}" placeholder="Lọc hồi left, Pump 1…"></div>
    <div class="field"><label class="lb" for="ifC">Mã vật tư</label><input class="inp mono" id="ifC" value="${esc(it.code)}" inputmode="numeric"></div>
    <div class="field"><label class="lb" for="ifV">Tên vật tư</label><input class="inp" id="ifV" value="${esc(it.vt)}"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="field"><label class="lb" for="ifA">Mã quy đổi</label><input class="inp mono" id="ifA" value="${esc(it.alt)}"></div>
      <div class="field"><label class="lb" for="ifAV">Tên quy đổi</label><input class="inp" id="ifAV" value="${esc(it.altVt)}"></div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="field"><label class="lb" for="ifQ">Số lượng</label><input class="inp" id="ifQ" inputmode="decimal" value="${esc(it.qty ?? '')}"></div>
      <div class="field"><label class="lb" for="ifU">ĐVT</label><input class="inp" id="ifU" value="${esc(it.unit || 'cái')}"></div></div>
    <div class="field"><label class="lb" for="ifY">Chu kỳ (ngày)</label><input class="inp" id="ifY" inputmode="numeric" value="${it.cycle || ''}" placeholder="VD: 360">
      <div class="chips" style="margin:8px 0 0;padding:0">${[90, 180, 360, 730, 1460].map(n => `<button class="chip" data-y="${n}">${n === 1460 ? '4 năm' : n === 730 ? '2 năm' : n + ' ngày'}</button>`).join('')}</div></div>
    ${isNew ? `<div class="field"><label class="lb" for="ifD">Ngày lắp / thay gần nhất</label><input type="date" class="inp" id="ifD" value=""></div>` : `<div class="field"><label class="lb" for="ifD">Ngày lắp</label><input type="date" class="inp" id="ifD" value="${it.start || ''}"></div>`}
    <div class="field"><label class="lb" for="ifN">Ghi chú</label><input class="inp" id="ifN" value="${esc(it.note)}"></div>
    <button class="btn pri" id="ifOk">${ic('check')} Lưu</button>`, (b, close) => {
    const g = id => b.querySelector(id);
    $$('[data-y]', b).forEach(x => x.onclick = () => { g('#ifY').value = x.dataset.y; });
    g('#ifT').onchange = async () => { if (g('#ifT').value !== '__new') { it.type = g('#ifT').value; return; } const n = await promptBox('Loại vật tư mới', 'Tên loại', '', { ph: 'VD: Gioăng phớt' }); if (!n) { g('#ifT').value = it.type; return; } const t = { id: uid(), name: n, kind: 'thay', cycle: 0 }; P.types.push(t); g('#ifT').insertAdjacentHTML('afterbegin', `<option value="${t.id}">${esc(n)}</option>`); g('#ifT').value = t.id; };
    g('#ifOk').onclick = () => {
      const type = g('#ifT').value; if (!type || type === '__new') { toast('Chọn loại vật tư'); return; }
      Object.assign(it, { type, sys: g('#ifS').value.trim(), pos: g('#ifP').value.trim(), loc: g('#ifL').value.trim(), code: g('#ifC').value.trim(), vt: g('#ifV').value.trim(), alt: g('#ifA').value.trim(), altVt: g('#ifAV').value.trim(),
        qty: g('#ifQ').value.trim() === '' ? '' : (Number(g('#ifQ').value.replace(',', '.')) || g('#ifQ').value.trim()), unit: g('#ifU').value.trim() || 'cái', cycle: parseInt(g('#ifY').value, 10) || 0, note: g('#ifN').value.trim() });
      if (!it.pos && !it.sys && !it.loc && !it.code) { toast('Nhập ít nhất hệ thống, vị trí hoặc mã vật tư'); return; }
      const d = g('#ifD').value;
      if (isNew) { if (d) it.start = d; if (!it.cycle) it.cycle = typeOf(type)?.cycle || 0; P.items.push(it); } else it.start = d;
      save(); close(); nav.render(); toast(isNew ? 'Đã thêm vị trí' : 'Đã lưu');
    };
  });
}

// ======================= NHU CẦU VẬT TƯ =======================
function needList(range) {
  const m = new Map();
  for (const it of scoped()) {
    const inf = info(it); if (inf.left == null || inf.left > range) continue;
    const code = it.code || it.alt || ''; const k = code || 'x:' + norm(it.vt || place(it));
    if (!m.has(k)) m.set(k, { code, vt: it.code ? it.vt : (it.altVt || it.vt), unit: it.unit || 'cái', qty: 0, unknown: 0, n: 0, first: inf.left, firstDue: inf.due, items: [] });
    const e = m.get(k); e.n++; e.items.push(it);
    const q = Number(it.qty); if (it.qty !== '' && it.qty != null && !isNaN(q)) e.qty += q; else e.unknown++;
    if (inf.left < e.first) { e.first = inf.left; e.firstDue = inf.due; }
  }
  return [...m.values()].sort((a, b) => a.first - b.first);
}
export function viewPMNeed(v, r) {
  const range = r.range || 60; const list = needList(range);
  v.innerHTML = `<div class="fade-in">
    <div class="seg3">${[30, 60, 90, 180].map(n => `<button class="${n === range ? 'on' : ''}" data-r="${n}">${n === 180 ? '6 tháng' : n + ' ngày'}</button>`).join('')}</div>
    <div class="muted" style="font-size:12.5px;margin:10px 2px">Cộng dồn theo mã vật tư (gồm vị trí quá hạn) · “?” = vị trí chưa nhập số lượng · chạm dòng để xem vị trí</div>
    ${list.length ? `<div class="tb"><div class="tb-h"><div class="grow">Mã · tên vật tư</div><div style="width:96px;text-align:right">Cần</div><div class="tc-left">Hạn sớm</div></div>
      ${list.map((e, i) => `<button class="tb-r" data-n="${i}"><div class="grow" style="min-width:0;text-align:left"><div class="tb-t mono" style="color:var(--gold2)">${esc(e.code || '(chưa có mã)')}</div><div class="tb-s" style="font-family:inherit">${esc(e.vt || '')}</div><div class="tb-s" style="font-family:inherit">${e.n} vị trí</div></div>
        <div style="width:96px;text-align:right;font-weight:800">${e.qty ? fmtN(e.qty) + ' ' + esc(e.unit) : ''}${e.unknown ? `<div class="tb-s amb-t" style="font-family:inherit">+${e.unknown} vị trí ?</div>` : ''}</div>
        <div class="tc-left">${stCell({ k: e.first < 0 ? 'red' : e.first <= 30 ? 'amb' : 'ok', left: e.first })}</div></button>`).join('')}</div>
      <button class="btn pri" id="nX">${ic('file')} Xuất Excel gửi phòng vật tư</button>`
      : `<div class="empty">${ic('cart')}Không có vật tư nào cần thay trong ${range} ngày</div>`}
  </div>`;
  $$('[data-r]', v).forEach(b => b.onclick = () => { r.range = +b.dataset.r; nav.render(); });
  $$('[data-n]', v).forEach(b => b.onclick = () => { const e = list[+b.dataset.n]; menu(`${e.code || e.vt} · ${e.n} vị trí`, e.items.map(it => ({ icon: 'chev', label: `${label(it)} ${place(it)} · ${info(it).left < 0 ? 'quá ' + (-info(it).left) : 'còn ' + info(it).left} ngày`, run: () => push({ v: 'pmitem', id: it.id }) }))); });
  const x = v.querySelector('#nX'); if (x) x.onclick = () => exportPM(range);
}

// ======================= NHẬP TỪ EXCEL =======================
const H = s => norm(s).replace(/\s+/g, ' ').trim();
const cellStr = v => v == null ? '' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(v)) : String(v).trim();
function toYMD(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && v > 20000 && v < 80000) { const p = XLSX.SSF.parse_date_code(v); if (p) return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`; }
  if (v instanceof Date && !isNaN(v)) return ymd(v);
  return parseDateText(String(v));
}
export function parseDateText(s) {
  const m = String(s).trim().match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/); if (!m) { const m2 = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})/); return m2 ? `${m2[1]}-${m2[2]}-${m2[3]}` : ''; }
  let y = +m[3]; if (y < 100) y += 2000; const d = +m[1], mo = +m[2]; if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return '';
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
const idLike = s => /^[A-Za-zĐđ]{1,5}\s?[A-Za-z]?\d*[-.]\d+$/.test(String(s).trim());
function sysOf(p) {
  p = String(p).trim(); let m = p.match(/^LMR\s*R?(\d)/i); if (m) return 'LMR' + m[1];
  m = p.match(/^([A-Za-z]+\d+)[-.]/); if (m) return m[1].toUpperCase();
  m = p.match(/^([A-Za-z]+)[-.]\d/); if (m) return m[1].toUpperCase();
  return p;
}
const KNOWN = { 'loc': 'Lọc', 'khop noi hoa mai': 'Khớp nối hoa mai', 'khop noi mem': 'Khớp nối mềm', 'dau mo': 'Dầu mỡ', 'dau mo rm': 'Dầu mỡ', 'ong mem': 'Ống mềm', 'binh tich ap': 'Bình tích áp', 'gioang phot': 'Gioăng phớt' };
function findHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const hs = (rows[i] || []).map(H); const score = ['he thong', 'ma vat tu', 'ten vat tu', 'vi tri lap dat', 'stt', 'ma vi tri', 'ma vt', 'ptj code'].filter(k => hs.includes(k)).length;
    if (hs.includes('he thong') && score >= 2) return i;
  }
  return -1;
}
function mapCols(hdr) {
  const hs = hdr.map(H); const find = (...res) => { for (const re of res) { const i = hs.findIndex(h => h && re.test(h)); if (i >= 0) return i; } return -1; };
  const all = re => hs.map((h, i) => re.test(h) ? i : -1).filter(i => i >= 0);
  return {
    id: find(/^id$/), sys: find(/^he thong$/), pos: find(/^ma vi tri$/, /^ptj code$/),
    loc: [find(/^vi tri lap dat$/), find(/^vi tri lap$/), find(/^application$/)].filter(i => i >= 0),
    mark: find(/dwg.*mark/, /^mark/), page: find(/^so trang ban ve/),
    code: [find(/^ma vat tu$/), find(/^ma vt$/), find(/^mvt$/), find(/^ma vat tu 2$/), find(/^ma vat tu 1$/)].filter(i => i >= 0),
    vt: [find(/^ten vat tu$/), find(/^ten vt$/), find(/^ten vat tu 2$/), find(/^name\/type\/size$/)].filter(i => i >= 0),
    alt: find(/^ma quy doi/), altVt: find(/^ten (vt |vat tu )?quy doi/), app: find(/^application$/),
    qty: [find(/^so luong$/), find(/^q'?ty$/), find(/^sl lap/), find(/^sl$/)].filter(i => i >= 0),
    vol: find(/^dung tich \(lit\)/), unit: find(/^dvt$/), cycle: find(/^chu ky/), note: find(/^ghi chu$/),
    start: find(/^ngay (fist|first) fill/, /^thoi diem lap dat/, /^ngay lap$/),
    dates: all(/^(thay the lan|kiem tra lan|lan) ?\d+$/),
    spec: all(/^(dung tich binh|ap suat lam viec|ap suat nap)/),
  };
}
// Chu kỳ lấy từ sheet HOME (công thức "Còn lại (ngày)" = chu kỳ − số ngày) hoặc cột "Chu kỳ thay thế"
function homeCycles(wb) {
  const name = wb.SheetNames.find(n => H(n) === 'home'); if (!name) return {};
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null }); if (rows.length < 3) return {};
  const titles = rows[0] || [], hdr = (rows[1] || []).map(H); const out = {};
  const keyOf = t => { t = H(t); return t.includes('hoa mai') ? 'hoa mai' : t.includes('loc') ? 'loc' : t.includes('dau') ? 'dau' : ''; };
  hdr.forEach((h, c) => {
    const direct = /^chu ky/.test(h); if (!/^con lai/.test(h) && !direct) return;
    let sc = -1; for (let k = c - 1; k >= Math.max(0, c - 5); k--) if (hdr[k] === 'he thong') { sc = k; break; } if (sc < 0) return;
    let title = ''; for (let k = sc; k >= Math.max(0, sc - 3); k--) if (titles[k]) { title = titles[k]; break; }
    const key = keyOf(title); if (!key) return; out[key] = out[key] || {};
    for (let r = 2; r < rows.length; r++) { const row = rows[r] || []; const pos = cellStr(row[sc]); if (!pos) continue;
      const cyc = direct ? Number(row[c]) : (typeof row[c] === 'number' && typeof row[c - 1] === 'number' ? row[c] + row[c - 1] : NaN);
      if (cyc > 0) out[key][H(pos)] = Math.round(cyc); }
  });
  return out;
}
const mode = arr => { const m = new Map(); let best = 0, bv = 0; for (const x of arr) { const n = (m.get(x) || 0) + 1; m.set(x, n); if (n > best) { best = n; bv = x; } } return bv; };
function parseWorkbook(wb) {
  const hc = homeCycles(wb); const T = today(); const out = [];
  for (const name of wb.SheetNames) {
    if (/^(home|tong hop)$/.test(H(name))) continue; // sheet tổng hợp / công thức, không phải danh sách vị trí
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
    const hi = findHeader(rows); if (hi < 0) continue;
    const C = mapCols(rows[hi]); const nn = H(name);
    const typeName = KNOWN[nn] || name.trim();
    const hkey = nn.includes('hoa mai') ? 'hoa mai' : nn === 'loc' || nn.startsWith('loc ') ? 'loc' : nn.startsWith('dau') ? 'dau' : '';
    const cyc = hc[hkey] || {};
    const items = []; const dup = new Map();
    for (let r = hi + 1; r < rows.length; r++) {
      const row = rows[r] || []; const g = i => i >= 0 ? row[i] : null; const s = i => cellStr(g(i));
      if (!row.some(x => x != null && x !== '')) continue; if (H(row[0]) === 'home') continue;
      let sys = s(C.sys), pos = s(C.pos);
      if (C.pos < 0) { if (idLike(sys)) { pos = sys; sys = sysOf(sys); } else pos = s(C.mark); }
      const first = arr => { for (const i of arr) { const x = s(i); if (x) return x; } return ''; };
      const loc = first(C.loc), code = first(C.code).replace(/\.0$/, ''), vt = first(C.vt);
      if (!sys && !pos && !loc && !code) continue;
      if (/^(tao ma|#n\/a)$/i.test(H(code))) continue;
      const pastD = [], futD = [];
      for (const i of C.dates) { const d = toYMD(g(i)); if (d) (d <= T ? pastD : futD).push(d); }
      const start = C.start >= 0 ? toYMD(g(C.start)) : '';
      let cycle = C.cycle >= 0 ? Math.round(Number(g(C.cycle))) || 0 : 0;
      if (!cycle) cycle = cyc[H(pos)] || cyc[H(sys)] || 0;
      if (!cycle && futD.length && (pastD.length || start)) { const lp = [...pastD, start].filter(Boolean).sort().pop(); const nf = futD.sort()[0]; cycle = -daysTo(lp) + daysTo(nf); }
      let qty = first(C.qty), unit = s(C.unit) || 'cái';
      if (C.vol >= 0) { qty = s(C.vol); unit = 'L'; }
      qty = qty === '' ? '' : (Number(String(qty).replace(',', '.')) || qty);
      const baseKey = [H(sys), H(pos), H(loc), code].join('|'); const n = (dup.get(baseKey) || 0) + 1; dup.set(baseKey, n);
      items.push({ id: s(C.id), key: baseKey + (n > 1 ? '#' + n : ''), sys, pos, loc, code, vt, alt: s(C.alt).replace(/\.0$/, ''), altVt: s(C.altVt), qty, unit, start, dates: [...new Set(pastD)].sort(), cycle, note: s(C.note),
        extra: { app: C.app >= 0 && C.loc[0] !== C.app ? s(C.app) : '', dwg: s(C.mark), page: s(C.page), spec: C.spec.map(i => s(i)).filter(Boolean).join(' · ') } });
    }
    if (!items.length) continue;
    const cycles = items.map(i => i.cycle).filter(Boolean);
    out.push({ sheet: name, typeName, kind: nn.includes('binh tich ap') || nn.includes('kiem tra') ? 'kiemtra' : 'thay', defCycle: cycles.length ? mode(cycles) : 0,
      checked: !!KNOWN[nn] || C.id >= 0, items });
  }
  return out;
}
function findType(name) { return pm().types.find(t => H(t.name) === H(name)); }
function matchItem(area, type, row) {
  const P = pm();
  if (row.id) { const x = P.items.find(i => i.id === row.id); if (x) return x; }
  return type ? P.items.find(i => i.type === type.id && H(i.area) === H(area) && i.key === row.key) : null;
}
export async function importExcel() {
  const [f] = await pickFiles('.xlsx,.xls,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel', false); if (!f) return;
  const bz = busy('Đang đọc file Excel…'); let sheets;
  try { const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' }); sheets = parseWorkbook(wb); }
  catch (e) { bz.done(); toast('Không đọc được file: ' + (e.message || e), 3500); return; }
  bz.done();
  if (!sheets.length) { toast('Không tìm thấy sheet nào có cột “Hệ thống”', 3500); return; }
  const guess = pm().area || (f.name.replace(/\.[^.]+$/, '').split(/[_\s-]+/).filter(Boolean).pop() || '').toUpperCase();
  const stat = (sh, area) => { const t = findType(sh.typeName); let nw = 0, up = 0; for (const r of sh.items) matchItem(area, t, r) ? up++ : nw++; return { nw, up }; };
  openSheet('Nhập từ Excel', `<div class="muted" style="font-size:13px;margin:-4px 0 12px">${esc(f.name)} · chọn các sheet cần nhập. Vị trí đã có sẽ được cập nhật (thêm ngày thay mới), không bị nhân đôi.</div>
    <div class="field"><label class="lb" for="imA">Khu vực</label><input class="inp" id="imA" value="${esc(guess)}"></div>
    <div id="imL"></div>
    <button class="btn pri" id="imOk" style="margin-top:6px">${ic('check')} Nhập dữ liệu</button>`, (b, close) => {
    const draw = () => { const area = b.querySelector('#imA').value.trim();
      b.querySelector('#imL').innerHTML = sheets.map((sh, i) => { const st = stat(sh, area); return `<label class="imrow"><input type="checkbox" data-k="${i}" ${sh.checked ? 'checked' : ''}>
        <span class="grow"><b>${esc(sh.sheet)}</b>${H(sh.sheet) !== H(sh.typeName) ? ` → ${esc(sh.typeName)}` : ''}<br><small class="muted">${sh.items.length} vị trí · ${st.nw} mới · ${st.up} cập nhật${sh.defCycle ? ` · chu kỳ chính ${sh.defCycle} ngày` : ' · chưa có chu kỳ'}</small></span></label>`; }).join('');
      $$('[data-k]', b).forEach(x => x.onchange = () => { sheets[+x.dataset.k].checked = x.checked; }); };
    b.querySelector('#imA').oninput = draw; draw();
    b.querySelector('#imOk').onclick = () => {
      const area = b.querySelector('#imA').value.trim(); const P = pm(); if (area) P.area = area;
      let nw = 0, up = 0, nd = 0;
      for (const sh of sheets.filter(x => x.checked)) {
        let t = findType(sh.typeName); if (!t) { t = { id: uid(), name: sh.typeName, kind: sh.kind, cycle: sh.defCycle }; P.types.push(t); } else if (!t.cycle && sh.defCycle) t.cycle = sh.defCycle;
        for (const r of sh.items) {
          let it = matchItem(area, t, r);
          if (!it) { it = { id: uid(), area, type: t.id, key: r.key, hist: [], extra: {} }; P.items.push(it); nw++; } else up++;
          for (const k of ['sys', 'pos', 'loc', 'code', 'vt', 'alt', 'altVt', 'unit', 'note', 'start']) if (r[k] !== '' && r[k] != null) it[k] = r[k]; else if (it[k] == null) it[k] = '';
          if (r.qty !== '' && r.qty != null) it.qty = r.qty; else if (it.qty == null) it.qty = '';
          it.extra = Object.assign({}, it.extra, Object.fromEntries(Object.entries(r.extra).filter(([, x]) => x)));
          if (r.cycle) it.cycle = r.cycle; else if (!it.cycle) it.cycle = t.cycle || 0;
          const have = new Set((it.hist || []).map(h => h.d));
          for (const d of r.dates) if (!have.has(d) && d !== it.start) { it.hist.push({ d, qty: '', cond: '', note: 'Từ Excel', by: '', photos: [] }); nd++; }
        }
      }
      const ORD = ['Lọc', 'Dầu mỡ', 'Khớp nối hoa mai', 'Khớp nối mềm', 'Ống mềm', 'Bình tích áp', 'Gioăng phớt'].map(H); const oi = t => { const i = ORD.indexOf(H(t.name)); return i < 0 ? 99 : i; };
      P.types = P.types.map((t, i) => [t, i]).sort((a, b) => oi(a[0]) - oi(b[0]) || a[1] - b[1]).map(x => x[0]);
      save(); close(); nav.render(); toast(`✔ Đã nhập: ${nw} vị trí mới · ${up} cập nhật · ${nd} ngày thay`, 4000);
    };
  });
}

// ======================= XUẤT EXCEL =======================
const safeSheet = s => String(s).replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet';
const FILL = { red: 'FFFDE2E1', amb: 'FFFFF1DB', ok: 'FFDFF6EC', none: 'FFF1F3F7' }, FONTC = { red: 'FFB42318', amb: 'FF9A5B00', ok: 'FF067647', none: 'FF697488' };
const stTxt = inf => inf.k === 'red' ? 'Quá hạn' : inf.k === 'amb' ? 'Sắp đến hạn' : inf.k === 'ok' ? 'Còn hạn' : inf.k === 'nocyc' ? 'Chưa đặt chu kỳ' : 'Chưa có ngày';
// ngày cho Excel: dùng giờ UTC để Excel không lùi 1 ngày (máy ở múi giờ +7)
const dt = s => s ? new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))) : null;
const kk = inf => inf.k === 'nocyc' || inf.k === 'nodate' ? 'none' : inf.k;
export async function exportPM(needRange = 90) {
  const P = pm(); const IT = scoped(); if (!IT.length) { toast('Chưa có dữ liệu'); return; }
  const bz = busy('Đang tạo file Excel…');
  try {
    const wb = new ExcelJS.Workbook(); wb.creator = 'Bảo Trì Thủy Lực';
    const thin = { style: 'thin', color: { argb: 'FFCED9EB' } }; const border = { top: thin, left: thin, bottom: thin, right: thin };
    const head = (ws, r, cols) => { cols.forEach((h, i) => { const c = ws.getCell(r, i + 1); c.value = h; c.font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E6FFF' } }; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = border; }); ws.getRow(r).height = 30; };
    const title = (ws, text, sub) => { ws.getCell(1, 1).value = text; ws.getCell(1, 1).font = { name: 'Arial', bold: true, size: 14, color: { argb: 'FF0B2A66' } }; ws.getCell(2, 1).value = sub; ws.getCell(2, 1).font = { name: 'Arial', italic: true, size: 10, color: { argb: 'FF697488' } }; };
    const sub = `${areaName() ? 'Khu vực ' + areaName() + ' · ' : ''}Ngày xuất ${dmy(today())} · ${S.state.settings.org || ''}`.replace(/ · $/, '');
    // 1. Tổng hợp
    const ws0 = wb.addWorksheet('Tổng hợp', { views: [{ showGridLines: false }] });
    title(ws0, 'THEO DÕI THAY THẾ ĐỊNH KỲ', sub);
    [34, 10, 11, 12, 11, 16].forEach((w, i) => ws0.getColumn(i + 1).width = w);
    let r = 4; const hdr0 = ['', 'Tổng', 'Quá hạn', '≤ 30 ngày', 'Còn hạn', 'Chưa có ngày / chu kỳ'];
    const block = (name, groups) => { head(ws0, r, [name, ...hdr0.slice(1)]); r++;
      for (const [lbl, its] of groups) { const c = counts(its); [lbl, c.t, c.red, c.amb, c.ok, c.none].forEach((v, i) => { const x = ws0.getCell(r, i + 1); x.value = v; x.border = border; x.font = { name: 'Arial', size: 10, bold: i === 0 || (i === 2 && v > 0), color: i === 2 && v ? { argb: FONTC.red } : i === 3 && v ? { argb: FONTC.amb } : undefined }; if (i) x.alignment = { horizontal: 'center' }; }); r++; }
      r++; };
    block('Loại vật tư', P.types.map(t => [t.name, IT.filter(i => i.type === t.id)]).filter(x => x[1].length));
    block('Hệ thống', systems(IT).map(s => [s, IT.filter(i => i.sys === s)]));
    // 2. từng loại
    for (const t of P.types) {
      const its = IT.filter(i => i.type === t.id).sort((a, b) => natural(a.sys, b.sys) || natural(label(a), label(b))); if (!its.length) continue;
      const maxH = Math.max(1, ...its.map(i => (i.hist || []).length));
      const ws = wb.addWorksheet(safeSheet(t.name), { views: [{ state: 'frozen', ySplit: 4, xSplit: 4, showGridLines: false }] });
      title(ws, `${t.name.toUpperCase()} – THAY THẾ ĐỊNH KỲ`, sub);
      const cols = ['STT', 'Hệ thống', 'Mã vị trí', 'Vị trí lắp đặt', 'Mã vật tư', 'Tên vật tư', 'Mã quy đổi', 'Tên quy đổi', 'SL', 'ĐVT', 'Ngày lắp', ...Array.from({ length: maxH }, (_, i) => `Lần ${i + 1}`), `${t.kind === 'kiemtra' ? 'Kiểm tra' : 'Thay'} lần cuối`, 'Chu kỳ (ngày)', 'Đã dùng (ngày)', 'Còn lại (ngày)', 'Hạn tới', 'Trạng thái', 'Ghi chú', 'ID'];
      const widths = [6, 12, 12, 26, 16, 38, 16, 30, 7, 7, 11, ...Array(maxH).fill(11), 12, 10, 10, 11, 11, 15, 28, 12];
      widths.forEach((w, i) => ws.getColumn(i + 1).width = w);
      head(ws, 4, cols);
      its.forEach((it, n) => {
        const inf = info(it); const hs = [...(it.hist || [])].map(h => h.d).sort();
        const vals = [n + 1, it.sys, it.pos, place(it), it.code, it.vt, it.alt, it.altVt, it.qty === '' ? null : it.qty, it.unit, dt(it.start), ...Array.from({ length: maxH }, (_, i) => dt(hs[i])),
          dt(inf.last), it.cycle || null, inf.used, inf.left, dt(inf.due), stTxt(inf), it.note, it.id];
        const row = ws.getRow(5 + n);
        vals.forEach((v, i) => { const c = row.getCell(i + 1); c.value = v ?? null; c.border = border; c.font = { name: 'Arial', size: 10 }; c.alignment = { vertical: 'middle' };
          if (v instanceof Date) c.numFmt = 'dd/mm/yyyy';
          if (n % 2) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7FAFF' } }; });
        const k = kk(inf); for (const ci of [cols.length - 4, cols.length - 3, cols.length - 2]) { const c = row.getCell(ci); c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[k] } }; c.font = { name: 'Arial', size: 10, bold: k !== 'none', color: { argb: FONTC[k] } }; c.alignment = { horizontal: 'center', vertical: 'middle' }; }
        row.getCell(cols.length).font = { name: 'Arial', size: 8, color: { argb: 'FFA0A8B8' } };
      });
      ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: cols.length } };
    }
    // 3. nhu cầu vật tư
    const need = needList(needRange);
    const wn = wb.addWorksheet(`Nhu cầu ${needRange} ngày`, { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] });
    title(wn, `NHU CẦU VẬT TƯ THAY THẾ ĐỊNH KỲ – ${needRange} NGÀY TỚI`, sub + ' · gồm vị trí đã quá hạn');
    [6, 18, 44, 11, 7, 10, 12, 60].forEach((w, i) => wn.getColumn(i + 1).width = w);
    head(wn, 4, ['STT', 'Mã vật tư', 'Tên vật tư', 'SL cần', 'ĐVT', 'Số vị trí', 'Hạn sớm nhất', 'Các vị trí']);
    need.forEach((e, n) => { const row = wn.getRow(5 + n); const dd = dt(e.firstDue);
      [n + 1, e.code, e.vt, e.qty || null, e.unit, e.n, dd, e.items.map(i => label(i) + (place(i) ? ' ' + place(i) : '')).join('; ') + (e.unknown ? ` (${e.unknown} vị trí chưa có SL)` : '')].forEach((v, i) => { const c = row.getCell(i + 1); c.value = v; c.border = border; c.font = { name: 'Arial', size: 10, bold: i === 3 }; c.alignment = { vertical: 'middle', wrapText: i === 7 }; if (v instanceof Date) c.numFmt = 'dd/mm/yyyy'; });
      if (e.first < 0) { const c = row.getCell(7); c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL.red } }; c.font = { name: 'Arial', size: 10, bold: true, color: { argb: FONTC.red } }; } });
    const buf = await wb.xlsx.writeBuffer(); bz.done();
    const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    await deliver(`ThayTheDinhKy_${(P.cur || P.area || 'KV').replace(/[^\w-]+/g, '')}_${dmy(today()).replace(/\//g, '-')}.xlsx`, btoa(s), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } catch (e) { bz.done(); console.error(e); toast('Lỗi xuất Excel: ' + (e.message || e)); }
}

// ======================= THẺ Ở TRANG TỔNG QUAN + TÌM KIẾM =======================
export function pmHomeCard() {
  const P = pm(); if (!P.items.length) return '';
  const c = counts(P.items); const soon = P.items.map(it => ({ it, inf: info(it) })).filter(x => x.inf.left != null && x.inf.left <= 30).sort((a, b) => a.inf.left - b.inf.left).slice(0, 4);
  return `<div class="card" style="margin-top:10px"><button class="pmh-go" data-pmgo><div class="grow"><div class="wc-h">${ic('repeat')} Thay thế định kỳ${areasOf().length ? ' · ' + esc(areasOf().join(', ')) : ''}</div>
      <div class="wc-s"><b class="red">${c.red}</b> quá hạn · <b class="amb">${c.amb}</b> trong 30 ngày · ${c.t} vị trí</div></div>${ic('chev')}</button>
    ${soon.length ? `<div class="tb" style="margin:12px 0 0">${soon.map(({ it, inf }) => `<button class="tb-r" data-pmi="${it.id}"><div class="tc-pos">${esc(label(it))}</div><div class="grow" style="min-width:0;text-align:left"><div class="tb-t">${esc(place(it) || it.vt)}</div><div class="tb-s">${esc(typeOf(it.type)?.name || '')}</div></div><div class="tc-left">${stCell(inf)}</div></button>`).join('')}</div>` : ''}</div>`;
}
export function bindPmHomeCard(v) {
  const g = v.querySelector('[data-pmgo]'); if (g) g.onclick = () => { nav.tab = 'pm'; nav.stack = []; nav.render(); };
  $$('[data-pmi]', v).forEach(b => b.onclick = () => { nav.tab = 'pm'; nav.stack = [{ v: 'pmitem', id: b.dataset.pmi }]; nav.render(); });
}
export function pmSearch(m) {
  return pm().items.filter(i => [i.pos, i.loc, i.code, i.vt, i.alt, i.extra?.dwg].some(x => m(x))).slice(0, 60).map(i => ({ k: 'Định kỳ · ' + (typeOf(i.type)?.name || ''), t: `${label(i)} ${place(i)}`.trim(), s: [i.code || i.alt, i.vt].filter(Boolean).join(' – '), go: () => { nav.tab = 'pm'; nav.stack = [{ v: 'pmitem', id: i.id }]; nav.render(); } }));
}
export { cur };
