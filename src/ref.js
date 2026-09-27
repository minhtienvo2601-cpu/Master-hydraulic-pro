import { PIPES } from './pipedata.js';
import { THREADS, DIN24, HOSES, FLANGES, SEALS, GLOSSARY, ARTICLES, MATERIALS, UNITS } from './refdata.js';
import { nav, push } from './nav.js';
import { ic } from './icons.js';
import { esc, norm, matcher, highlight, $$ } from './util.js';

const SCH_ORDER = ['5S', '10S', '10', '20', '30', '40', 'STD', '40S', '60', '80', 'XS', '80S', '100', '120', '140', '160', 'XXS'];
const f = (n, d = 2) => Number(n).toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d });
const kgm = (od, t) => (od - t) * t * 0.0246615; // ASME B36.10M – thép carbon

const SECTIONS = [
  { k: 'pipe', i: 'ruler', t: 'Ống thép DN / inch / SCH', d: 'Đường kính ngoài, độ dày, lòng ống, kg/m' },
  { k: 'press', i: 'gauge', t: 'Tính áp suất ống', d: 'Áp cho phép & áp nổ theo vật liệu' },
  { k: 'unit', i: 'swap', t: 'Đổi đơn vị', d: 'bar–psi, L/phút–gpm, N·m, inch–mm…' },
  { k: 'thread', i: 'thread', t: 'Bảng ren', d: 'BSP · NPT · JIC · ORFS' },
  { k: 'din', i: 'fitting', t: 'Đầu nối côn 24°', d: 'DIN 2353 / ISO 8434-1 · series LL, L, S' },
  { k: 'hose', i: 'hose', t: 'Ống mềm thủy lực', d: '1SN · 2SN · 4SP · 4SH · R12 · R13' },
  { k: 'flange', i: 'flange', t: 'Mặt bích SAE', d: 'Code 61 / Code 62' },
  { k: 'seal', i: 'ring', t: 'Vật liệu gioăng phớt', d: 'NBR · FKM · EPDM · PU · PTFE' },
  { k: 'gloss', i: 'book', t: 'Từ điển phụ kiện', d: 'Co, tê, kép, lơ thu, rắc co… Việt – Anh' },
  { k: 'know', i: 'bulb', t: 'Kiến thức & cách lắp', d: 'Nhận biết ren, lắp vòng cắt, ống mềm…' },
];
const TITLES = { pipe: 'Ống thép SCH', press: 'Áp suất ống', unit: 'Đổi đơn vị', thread: 'Bảng ren', din: 'Đầu nối 24°', hose: 'Ống mềm', flange: 'Mặt bích SAE', seal: 'Gioăng phớt', gloss: 'Từ điển', know: 'Kiến thức' };
export const refTitle = k => TITLES[k] || 'Tra cứu';

// ---------- trang chính ----------
let refQ = '';
export const clearRefQ = () => { refQ = ''; };
export function viewRef(v) {
  v.innerHTML = `<div class="fade-in">
    <div class="searchbox">${ic('search')}<input id="rq" placeholder="Tìm: DN50, JIC, 2SN, lơ thu, Viton…" value="${esc(refQ)}" autocomplete="off"></div>
    <div id="rres"></div>
    <div class="refgrid" id="rgrid">${SECTIONS.map(s => `<button class="refcard" data-sec="${s.k}"><div class="ri">${ic(s.i)}</div><div class="rt">${s.t}</div><div class="rd">${s.d}</div></button>`).join('')}</div></div>`;
  $$('[data-sec]', v).forEach(b => b.onclick = () => push({ v: 'refsec', k: b.dataset.sec }));
  const inp = v.querySelector('#rq'); let t;
  inp.oninput = () => { clearTimeout(t); t = setTimeout(() => { refQ = inp.value; refSearch(v); }, 150); };
  refSearch(v);
}
function refSearch(v) {
  const q = refQ.trim(); const box = v.querySelector('#rres'); const grid = v.querySelector('#rgrid');
  if (q.length < 2) { box.innerHTML = ''; grid.style.display = ''; return; }
  grid.style.display = 'none';
  const m = matcher(q); const hits = [];
  const dnq = q.match(/^\s*dn\s*(\d+)/i);
  for (const p of PIPES) {
    const [nps, dn, od] = p;
    if ((dnq && +dnq[1] === dn) || m(nps) || m('DN' + dn)) hits.push({ k: 'Ống thép', t: `DN${dn} · ${nps} · OD ${f(od, 1)} mm`, go: () => { pipeSel = dn; push({ v: 'refsec', k: 'pipe' }); } });
  }
  for (const [key, th] of Object.entries(THREADS)) th.rows.forEach(r => { if (m(th.name) || r.some(c => m(c))) hits.push({ k: 'Ren · ' + th.name, t: r.join(' · '), go: () => { threadSel = key; push({ v: 'refsec', k: 'thread' }); } }); });
  DIN24.series.forEach(s => s.rows.forEach(r => { const txt = `Series ${s.k} · ống ${r[0]} mm · ${r[1]} · ${r[2]} bar`; if (m(txt) || m('din ' + s.k)) hits.push({ k: 'Đầu nối 24°', t: txt, go: () => push({ v: 'refsec', k: 'din' }) }); }));
  HOSES.types.forEach(h => { if (m(h.k) || m(h.d)) hits.push({ k: 'Ống mềm', t: h.d, go: () => { hoseSel = h.k; push({ v: 'refsec', k: 'hose' }); } }); });
  SEALS.rows.forEach(r => { if (m(r[0]) || m(r[5])) hits.push({ k: 'Gioăng phớt', t: `${r[0]} · ${r[1]} °C`, go: () => push({ v: 'refsec', k: 'seal' }) }); });
  GLOSSARY.forEach(g => { if (m(g[0]) || m(g[1]) || m(g[2])) hits.push({ k: 'Từ điển', t: `${g[0]} – ${g[1]}`, s: g[2], go: () => push({ v: 'refsec', k: 'gloss' }) }); });
  ARTICLES.forEach((a, i) => { if (m(a.t) || m(a.tags) || m(a.b.replace(/<[^>]+>/g, ' '))) hits.push({ k: 'Kiến thức', t: a.t, go: () => { artOpen = i; push({ v: 'refsec', k: 'know' }); } }); });
  if (m('flange') || m('mặt bích') || m('code 61') || m('code 62')) hits.push({ k: 'Mặt bích', t: FLANGES.name, go: () => push({ v: 'refsec', k: 'flange' }) });
  box.innerHTML = hits.length ? hits.slice(0, 80).map((h, i) => `<div class="hit" data-h="${i}"><div class="k">${esc(h.k)}</div><div class="t">${highlight(h.t, q)}</div>${h.s ? `<div class="muted" style="font-size:12.5px;margin-top:3px">${esc(h.s)}</div>` : ''}</div>`).join('')
    : `<div class="empty">${ic('search')}Không tìm thấy “${esc(q)}”</div>`;
  box.style.marginTop = '14px';
  $$('[data-h]', box).forEach(el => el.onclick = () => hits[+el.dataset.h].go());
}

// ---------- chi tiết từng mục ----------
export function viewRefSec(v, k) {
  ({ pipe: vPipe, press: vPress, unit: vUnit, thread: vThread, din: vDin, hose: vHose, flange: vFlange, seal: vSeal, gloss: vGloss, know: vKnow })[k](v);
}
const table = (cols, rows, opts = {}) => `<div class="tblwrap"><table class="tbl${opts.cls ? ' ' + opts.cls : ''}"><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr${r.hl ? ' class="hl"' : ''}>${(r.cells || r).map((c, i) => `<td${i === 0 ? ' class="c0"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const note = (html) => `<div class="refnote">${html}</div>`;
const chips = (items, cur, attr) => `<div class="chips">${items.map(([v, l]) => `<button class="chip ${String(v) === String(cur) ? 'on' : ''}" data-${attr}="${v}">${l}</button>`).join('')}</div>`;

// Ống thép
let pipeSel = 50, pipeUnit = 'dn';
function vPipe(v) {
  const p = PIPES.find(x => x[1] === pipeSel) || PIPES[0]; const [nps, dn, od, ts] = p;
  const list = SCH_ORDER.filter(s => ts[s] != null);
  const rows = list.map(s => { const t = ts[s]; return { hl: s === '160', cells: [s, f(t), f(od - 2 * t), f(kgm(od, t), 2)] }; });
  v.innerHTML = `<div class="fade-in">
    <div class="seg2"><button class="${pipeUnit === 'dn' ? 'on' : ''}" data-pu="dn">Chọn theo DN</button><button class="${pipeUnit === 'in' ? 'on' : ''}" data-pu="in">Chọn theo inch</button></div>
    ${chips(PIPES.map(x => [x[1], pipeUnit === 'dn' ? 'DN' + x[1] : x[0]]), pipeSel, 'dn')}
    <div class="bigcard"><div class="bc-row"><div><div class="bc-l">Cỡ danh nghĩa</div><div class="bc-v">DN${dn} <span>·</span> ${nps}</div></div>
      <div style="text-align:right"><div class="bc-l">Đường kính ngoài</div><div class="bc-v">${f(od, 1)} <small>mm</small></div><div class="bc-s">${f(od / 25.4, 3)} inch</div></div></div></div>
    ${table(['SCH', 'Dày (mm)', 'ĐK trong (mm)', 'kg/m'], rows, { cls: 'tbl-num' })}
    ${note('Theo ASME B36.10M (thép carbon) và B36.19M (inox – hậu tố S). Khối lượng tính cho thép carbon: (OD − t) × t × 0,02466. Dòng tô màu là SCH 160.')}
    <div class="sec-h"><h2>Đo OD thực tế → tìm cỡ ống</h2></div>
    <div class="card"><div class="row"><input class="inp" id="odm" type="number" inputmode="decimal" placeholder="Nhập OD đo được (mm)" style="flex:1"><span class="muted">mm</span></div><div id="odr" style="margin-top:10px"></div></div>
  </div>`;
  $$('[data-dn]', v).forEach(b => b.onclick = () => { pipeSel = +b.dataset.dn; nav.render(); });
  $$('[data-pu]', v).forEach(b => b.onclick = () => { pipeUnit = b.dataset.pu; nav.render(); });
  const on = v.querySelector(`[data-dn="${pipeSel}"]`); on && on.scrollIntoView({ inline: 'center', block: 'nearest' });
  const odm = v.querySelector('#odm'), odr = v.querySelector('#odr');
  odm.oninput = () => {
    const x = parseFloat(odm.value.replace(',', '.')); if (!x) { odr.innerHTML = ''; return; }
    const near = [...PIPES].sort((a, b) => Math.abs(a[2] - x) - Math.abs(b[2] - x)).slice(0, 2);
    odr.innerHTML = near.map((p, i) => `<button class="item" data-go="${p[1]}" style="width:100%;text-align:left;margin:0 0 6px"><div class="fi ${i ? 'oth' : 'xls'}">${i ? '≈' : '✔'}</div><div class="grow"><div class="nm">DN${p[1]} · ${p[0]}</div><div class="sz">OD chuẩn ${f(p[2], 1)} mm · lệch ${f(x - p[2], 1)} mm</div></div></button>`).join('')
      + (Math.abs(near[0][2] - x) > 2 ? `<div class="muted" style="font-size:12.5px">Lệch nhiều so với ống SCH – có thể là ống chính xác hệ mét (ví dụ 25, 30, 38 mm) hoặc ống đồng.</div>` : '');
    $$('[data-go]', odr).forEach(b => b.onclick = () => { pipeSel = +b.dataset.go; nav.render(); });
  };
}

// Tính áp suất ống
const pr = { mode: 'sch', dn: 25, sch: '160', od: 25, t: 3, mat: 'a106', c: 0, tol: true };
function vPress(v) {
  const p = PIPES.find(x => x[1] === pr.dn) || PIPES[5];
  const schs = SCH_ORDER.filter(s => p[3][s] != null); if (!schs.includes(pr.sch)) pr.sch = schs.includes('80') ? '80' : schs[0];
  v.innerHTML = `<div class="fade-in">
    <div class="seg2"><button class="${pr.mode === 'sch' ? 'on' : ''}" data-m="sch">Ống theo SCH</button><button class="${pr.mode === 'cus' ? 'on' : ''}" data-m="cus">Nhập OD × dày</button></div>
    ${pr.mode === 'sch' ? `
      <div class="field"><label class="lb">Cỡ ống</label><select class="inp" id="pdn">${PIPES.map(x => `<option value="${x[1]}" ${x[1] === pr.dn ? 'selected' : ''}>DN${x[1]} · ${x[0]} · OD ${f(x[2], 1)}</option>`).join('')}</select></div>
      <div class="field"><label class="lb">SCH</label><div class="chipwrap">${chips(schs.map(s => [s, s]), pr.sch, 'sch')}</div></div>`
    : `<div class="btn-row" style="margin-bottom:16px"><div><label class="lb" style="display:block;font-size:12px;color:var(--mut);margin:0 0 7px 2px">OD (mm)</label><input class="inp" id="pod" type="number" inputmode="decimal" value="${pr.od}"></div>
      <div><label class="lb" style="display:block;font-size:12px;color:var(--mut);margin:0 0 7px 2px">Dày (mm)</label><input class="inp" id="pt" type="number" inputmode="decimal" value="${pr.t}"></div></div>`}
    <div class="field"><label class="lb">Vật liệu</label><select class="inp" id="pmat">${MATERIALS.map(m => `<option value="${m.k}" ${m.k === pr.mat ? 'selected' : ''}>${m.n}</option>`).join('')}</select></div>
    <div class="btn-row" style="margin-bottom:12px">
      <div><label style="display:block;font-size:12px;color:var(--mut);margin:0 0 7px 2px">Dự phòng ăn mòn (mm)</label><input class="inp" id="pc" type="number" inputmode="decimal" value="${pr.c}"></div>
      <label class="tgl"><input type="checkbox" id="ptol" ${pr.tol ? 'checked' : ''}><span>Trừ dung sai chế tạo −12,5%</span></label></div>
    <div id="pres"></div>
    ${note('Áp cho phép theo ASME B31.3: P = 2·S·t / (D − 2·Y·t), Y = 0,4, hệ số mối hàn E = 1 (ống đúc). Áp nổ lý thuyết theo Barlow với giới hạn bền Rm. Ở nhiệt độ thường. <b>Chỉ dùng tham khảo nhanh</b>, không thay thế tính toán thiết kế; áp làm việc thực còn bị giới hạn bởi đầu nối, mối hàn, xung áp.')}
  </div>`;
  const q = s => v.querySelector(s);
  $$('[data-m]', v).forEach(b => b.onclick = () => { pr.mode = b.dataset.m; nav.render(); });
  q('#pdn') && (q('#pdn').onchange = e => { pr.dn = +e.target.value; nav.render(); });
  $$('[data-sch]', v).forEach(b => b.onclick = () => { pr.sch = b.dataset.sch; nav.render(); });
  const calc = () => {
    const num = s => parseFloat(String(s).replace(',', '.')) || 0;
    if (q('#pod')) { pr.od = num(q('#pod').value); pr.t = num(q('#pt').value); }
    pr.mat = q('#pmat').value; pr.c = num(q('#pc').value); pr.tol = q('#ptol').checked;
    const D = pr.mode === 'sch' ? p[2] : pr.od, t = pr.mode === 'sch' ? p[3][pr.sch] : pr.t; const M = MATERIALS.find(m => m.k === pr.mat);
    const tm = t * (pr.tol ? 0.875 : 1) - pr.c;
    const box = q('#pres');
    if (!D || !t || tm <= 0 || t * 2 >= D) { box.innerHTML = `<div class="card muted">Nhập kích thước hợp lệ</div>`; return; }
    const P = 2 * M.S * tm / (D - 2 * 0.4 * tm) * 10; const Pb = 2 * M.Rm * t / D * 10;
    box.innerHTML = `<div class="bigcard"><div class="bc-row"><div><div class="bc-l">Áp làm việc cho phép</div><div class="bc-v">${f(P, 0)} <small>bar</small></div><div class="bc-s">${f(P * 14.5038, 0)} psi · ${f(P / 10, 1)} MPa</div></div>
      <div style="text-align:right"><div class="bc-l">Áp nổ lý thuyết</div><div class="bc-v" style="color:var(--p1t)">${f(Pb, 0)} <small>bar</small></div><div class="bc-s">Hệ số an toàn ≈ ${f(Pb / P, 1)}</div></div></div>
      <div class="bc-s" style="margin-top:10px">Ống ${f(D, 1)} × ${f(t, 2)} mm · chiều dày tính toán ${f(tm, 2)} mm · S = ${M.S} MPa (${M.src}) · Rm = ${M.Rm} MPa</div></div>`;
  };
  ['#pod', '#pt', '#pc'].forEach(s => q(s) && (q(s).oninput = calc)); q('#pmat').onchange = calc; q('#ptol').onchange = calc;
  calc();
}

// Đổi đơn vị
let ucat = 'Áp suất', uval = '1', ufrom = 'bar';
function vUnit(v) {
  const C = UNITS[ucat]; if (!C.u[ufrom]) ufrom = Object.keys(C.u)[0];
  v.innerHTML = `<div class="fade-in">${chips(Object.keys(UNITS).map(k => [k, k]), ucat, 'uc')}
    <div class="card" style="margin-top:6px"><div class="row"><input class="inp" id="uv" type="number" inputmode="decimal" value="${esc(uval)}" style="flex:1;font-size:22px;font-weight:700">
      <select class="inp" id="uf" style="width:auto;padding-right:34px">${Object.keys(C.u).map(u => `<option ${u === ufrom ? 'selected' : ''}>${u}</option>`).join('')}</select></div></div>
    <div id="uout" style="margin-top:10px"></div>
    <div class="sec-h"><h2>Hay dùng</h2></div>
    ${note('1 bar = 14,504 psi = 0,1 MPa · 1 MPa = 10 bar = 145 psi · 1 inch = 25,4 mm · 1 gpm (US) = 3,785 L/phút · 1 kW = 1,341 HP · 1 N·m = 0,7376 lbf·ft · 1 kgf/cm² = 0,981 bar')}</div>`;
  const q = s => v.querySelector(s);
  $$('[data-uc]', v).forEach(b => b.onclick = () => { ucat = b.dataset.uc; ufrom = ''; nav.render(); });
  const calc = () => {
    uval = q('#uv').value; ufrom = q('#uf').value; const x = parseFloat(String(uval).replace(',', '.'));
    if (isNaN(x)) { q('#uout').innerHTML = ''; return; }
    let out;
    if (C.temp) {
      const c = ufrom === '°C' ? x : ufrom === '°F' ? (x - 32) * 5 / 9 : x - 273.15;
      out = [['°C', c], ['°F', c * 9 / 5 + 32], ['K', c + 273.15]];
    } else { const base = x * C.u[ufrom]; out = Object.entries(C.u).map(([u, k]) => [u, base / k]); }
    q('#uout').innerHTML = out.filter(o => o[0] !== ufrom).map(([u, val]) => `<div class="urow"><span class="uv">${fmtN(val)}</span><span class="uu">${u}</span></div>`).join('');
  };
  q('#uv').oninput = calc; q('#uf').onchange = calc; calc();
}
function fmtN(v) { const a = Math.abs(v); const d = a >= 1000 ? 1 : a >= 100 ? 2 : a >= 1 ? 3 : 5; return Number(v.toFixed(d)).toLocaleString('vi-VN', { maximumFractionDigits: d }); }

// Ren
let threadSel = 'bsp';
function vThread(v) {
  const th = THREADS[threadSel];
  v.innerHTML = `<div class="fade-in">${chips(Object.entries(THREADS).map(([k, x]) => [k, x.name.split(' (')[0]]), threadSel, 'th')}
    <div class="card" style="margin:6px 0 12px"><div style="font-weight:700">${th.name}</div><div class="muted" style="font-size:12.5px;margin-top:2px">${th.std}</div><div style="font-size:13.5px;margin-top:8px;color:var(--tx2)">${th.note}</div></div>
    ${table(th.cols, th.rows)}
    ${note('Mẹo: đo đỉnh ren bằng thước cặp và đếm số ren/inch bằng dưỡng ren, rồi so với bảng. Xem thêm bài “Cách nhận biết loại ren đầu nối” trong mục Kiến thức.')}</div>`;
  $$('[data-th]', v).forEach(b => b.onclick = () => { threadSel = b.dataset.th; nav.render(); });
}
function vDin(v) {
  v.innerHTML = `<div class="fade-in"><div class="card" style="margin-bottom:12px"><div style="font-weight:700">${DIN24.name}</div><div style="font-size:13.5px;margin-top:6px;color:var(--tx2)">${DIN24.note}</div></div>
    ${DIN24.series.map(s => `<div class="sec-h"><h2>Series ${s.k} – ${s.d}</h2></div>${table(['Ống OD (mm)', 'Ren đai ốc', 'Áp tối đa (bar)'], s.rows.map(r => [r[0], r[1], r[2]]), { cls: 'tbl-num' })}`).join('')}
    ${note('Ký hiệu đặt hàng ví dụ: GE 12 L R1/2 = đầu nối thẳng, ống 12 mm series L, ren cổng R 1/2". Nguồn: ISO 8434-1 bảng 1.')}</div>`;
}
let hoseSel = '2SN';
function vHose(v) {
  const h = HOSES.types.find(x => x.k === hoseSel) || HOSES.types[1];
  v.innerHTML = `<div class="fade-in">${chips(HOSES.types.map(x => [x.k, x.k]), hoseSel, 'hs')}
    <div class="card" style="margin:6px 0 12px;font-weight:600">${h.d}</div>
    ${table(['Cỡ', 'ĐK trong', 'Áp (bar)', 'R uốn'], h.rows.map(r => [r[0], f(r[1], 1), r[2], r[3]]), { cls: 'tbl-num' })}
    ${note(HOSES.note + ' ĐK trong và R uốn tính bằng mm. Cỡ “-dash” = đường kính trong tính theo 1/16 inch.')}</div>`;
  $$('[data-hs]', v).forEach(b => b.onclick = () => { hoseSel = b.dataset.hs; nav.render(); });
}
function vFlange(v) {
  v.innerHTML = `<div class="fade-in"><div class="card" style="margin-bottom:12px"><div style="font-weight:700">${FLANGES.name}</div><div style="font-size:13.5px;margin-top:6px;color:var(--tx2)">${FLANGES.note}</div></div>${table(FLANGES.cols, FLANGES.rows, { cls: 'tbl-num' })}</div>`;
}
function vSeal(v) {
  v.innerHTML = `<div class="fade-in">${SEALS.rows.map(r => `<div class="card sealcard"><div class="row"><div class="grow" style="font-weight:700;font-size:15.5px">${r[0]}</div><span class="pill p3">${r[1]} °C</span></div>
    <div class="sealgrid"><div><span>Dầu khoáng</span><b>${r[2]}</b></div><div><span>Nước-glycol</span><b>${r[3]}</b></div><div><span>Este phốt phát</span><b>${r[4]}</b></div></div>
    <div class="muted" style="font-size:13px;margin-top:8px">${r[5]}</div></div>`).join('')}
    ${note('Dải nhiệt độ tham khảo cho hợp chất thông dụng; từng hãng có công thức riêng. HFC = dầu nước-glycol chống cháy; HFD = este phốt phát chống cháy.')}</div>`;
}
function vGloss(v) {
  v.innerHTML = `<div class="fade-in">${GLOSSARY.map(g => `<div class="card" style="margin-bottom:8px"><div class="row"><div class="grow" style="font-weight:700">${g[0]}</div><div style="color:var(--gold);font-size:13px;font-weight:600;text-align:right">${g[1]}</div></div><div class="muted" style="font-size:13px;margin-top:4px">${g[2]}</div></div>`).join('')}</div>`;
}
let artOpen = -1;
function vKnow(v) {
  v.innerHTML = `<div class="fade-in">${ARTICLES.map((a, i) => `<div class="card art ${i === artOpen ? 'open' : ''}" style="margin-bottom:10px"><button class="art-h" data-art="${i}"><span class="grow">${a.t}</span>${ic('chev')}</button><div class="art-b">${a.b}</div></div>`).join('')}</div>`;
  $$('[data-art]', v).forEach(b => b.onclick = () => { const c = b.parentElement; c.classList.toggle('open'); });
  if (artOpen >= 0) setTimeout(() => { v.querySelectorAll('.art')[artOpen]?.scrollIntoView({ block: 'start' }); artOpen = -1; }, 50);
}
