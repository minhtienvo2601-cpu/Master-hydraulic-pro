// Trình xem file ngay trong app: PDF (PDF.js), Word (docx-preview), Excel (SheetJS), ảnh, văn bản.
import * as XLSX from 'xlsx';
import { renderAsync } from 'docx-preview';
import { esc } from './util.js';
import { ic } from './icons.js';
import { readBytes, b64ToBytes, readB64, openFile, sharePath, shareFile, saveToDevice, writeExport, fileSrc, readJSON, writeJSON } from './platform.js';
import { openSheet, toast, promptBox, menu } from './ui.js';

// ---------- nhận dạng loại file ----------
const extOf = n => (String(n || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
export function kindOf(name, mime = '') {
  const e = extOf(name); mime = String(mime || '');
  if (e === 'pdf' || mime.includes('pdf')) return 'pdf';
  if (e === 'docx' || mime.includes('wordprocessingml')) return 'docx';
  if (['xlsx', 'xlsm', 'xls', 'csv', 'ods'].includes(e) || mime.includes('spreadsheet') || mime.includes('ms-excel')) return 'sheet';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(e) || mime.startsWith('image/')) return 'img';
  if (['txt', 'log', 'md', 'json', 'xml', 'ini', 'cfg'].includes(e) || mime.startsWith('text/')) return 'text';
  return null;
}
export const canView = (name, mime) => !!kindOf(name, mime);

// ---------- ghi nhớ trang đang đọc + đánh dấu trang (theo từng file) ----------
let mem = null, memT = null;
async function getMem() { if (!mem) mem = (await readJSON('viewer.json', {})) || {}; return mem; }
function saveMem() { clearTimeout(memT); memT = setTimeout(() => writeJSON('viewer.json', mem), 700); }

// ---------- khung trình xem ----------
let cur = null;
export function closeViewer() {
  if (!cur) return false;
  if (cur.findOpen) { cur.closeFind(); return true; }
  cur.close(); return true;
}

// f = { name, mime, path, b64?, key?, exported? }
export async function viewFile(f) {
  const kind = kindOf(f.name, f.mime);
  if (!kind) return openExternal(f);
  if (cur) cur.close();
  const el = document.createElement('div'); el.className = 'vw';
  el.innerHTML = `
    <div class="vw-top">
      <button class="icon-btn" data-a="close" aria-label="Đóng">${ic('back')}</button>
      <div class="vw-ttl"><div class="vw-nm">${esc(f.name)}</div><div class="vw-sub" data-sub>Đang mở…</div></div>
      ${kind === 'pdf' ? `<button class="icon-btn" data-a="find" aria-label="Tìm">${ic('search')}</button><button class="icon-btn" data-a="pages" aria-label="Trang">${ic('list')}</button>` : ''}
      <button class="icon-btn" data-a="more" aria-label="Tùy chọn">${ic('dots')}</button>
    </div>
    <div class="vw-find" hidden><input class="inp" placeholder="Tìm chữ hoặc mã trong file…" enterkeyhint="search"><span class="vw-cnt"></span>
      <button class="icon-btn" data-a="prev">${ic('up')}</button><button class="icon-btn" data-a="next">${ic('down')}</button></div>
    <div class="vw-main">
      <div class="vw-body"><div class="vw-load"><div class="spin"></div><div>Đang mở file…</div></div></div>
      <button class="vw-pill" hidden></button>
    </div>
    <div class="vw-tabs" hidden></div>
    ${f.exported ? `<div class="vw-act"><button class="btn pri" data-a="save">${ic('save')} Lưu vào máy</button><button class="btn sec" data-a="share">${ic('share')} Chia sẻ</button></div>` : ''}`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  const ctx = { f, el, kind, body: el.querySelector('.vw-body'), sub: el.querySelector('[data-sub]'), cleanup: [], findOpen: false, closeFind() {} };
  ctx.close = () => {
    if (ctx.closed) return; ctx.closed = true;
    ctx.cleanup.forEach(fn => { try { fn(); } catch (e) {} });
    el.classList.remove('show'); setTimeout(() => el.remove(), 220);
    if (cur === ctx) cur = null;
  };
  cur = ctx;
  el.querySelector('[data-a=close]').onclick = ctx.close;
  el.querySelector('[data-a=more]').onclick = () => moreMenu(ctx);
  if (f.exported) {
    el.querySelector('[data-a=save]').onclick = () => doSave(f);
    el.querySelector('[data-a=share]').onclick = () => doShare(f);
  }
  const onResize = () => ctx.onResize && ctx.onResize();
  window.addEventListener('resize', onResize); ctx.cleanup.push(() => window.removeEventListener('resize', onResize));
  try {
    const data = f.b64 ? b64ToBytes(f.b64).buffer : await readBytes(f.path);
    if (ctx.closed) return;
    if (kind === 'pdf') await openPdf(ctx, data);
    else if (kind === 'docx') await openDocx(ctx, data);
    else if (kind === 'sheet') openXls(ctx, data);
    else if (kind === 'img') await openImg(ctx);
    else openText(ctx, data);
  } catch (e) {
    console.error(e);
    if (ctx.closed) return;
    ctx.sub.textContent = 'Không mở được';
    ctx.body.innerHTML = `<div class="vw-err">${ic('alert')}<div><b>Không xem được file này trong app</b></div><small>${esc(e && e.message || e)}</small>
      <button class="btn pri" data-x>${ic('open')} Mở bằng ứng dụng khác</button></div>`;
    ctx.body.querySelector('[data-x]').onclick = () => openExternal(f);
  }
}

// File xuất ra (PDF/Word/Excel/zip): lưu tạm → xem trước → Lưu vào máy / Chia sẻ
export async function deliver(name, b64, mime) {
  const path = await writeExport(name, b64);
  const f = { name, mime, path, b64, exported: true };
  if (canView(name, mime)) { viewFile(f); return; }
  fileActions(f);
}
function fileActions(f) {
  const kb = Math.round(f.b64.length * 3 / 4 / 1024);
  openSheet('File đã tạo xong', `<div class="item" style="margin-bottom:14px"><div class="fi zip">${ic('file')}</div><div class="grow"><div class="nm">${esc(f.name)}</div><div class="sz">${kb > 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' KB'}</div></div></div>
    <button class="btn pri" data-s>${ic('save')} Lưu vào máy</button>
    <button class="btn sec" data-h style="margin-top:10px">${ic('share')} Chia sẻ (Drive, Zalo, Gmail…)</button>
    <p class="muted" style="font-size:12.5px;margin:12px 2px 0">Lưu vào máy: file nằm trong thư mục <b>Documents/BaoTriThuyLuc</b>, mở bằng app <b>Quản lý file</b>.</p>`, (b, cl) => {
    b.querySelector('[data-s]').onclick = () => { cl(); doSave(f); };
    b.querySelector('[data-h]').onclick = () => { cl(); doShare(f); };
  });
}
async function doSave(f) {
  try {
    const b64 = f.b64 || await readB64(f.path);
    const where = await saveToDevice(f.name, b64, f.mime);
    toast('Đã lưu: ' + where, 4200);
  } catch (e) { console.error(e); toast('Không lưu được vào máy – hãy dùng Chia sẻ', 3500); }
}
async function doShare(f) {
  try { if (f.path) await sharePath(f.path, f.name, f.mime); else await shareFile(f.name, f.b64, f.mime); }
  catch (e) { if (!/cancel/i.test(String(e && e.message || e))) toast('Không chia sẻ được'); }
}
async function openExternal(f) {
  try {
    let path = f.path;
    if (!path && f.b64) path = await writeExport(f.name, f.b64);
    await openFile(path, f.mime, f.name);
  } catch (e) { toast('Không có ứng dụng nào mở được loại file này'); }
}
function moreMenu(ctx) {
  const { f } = ctx; const items = [];
  if (ctx.kind === 'pdf' && ctx.pdf) {
    items.push({ icon: 'chev', label: 'Đến trang…', run: () => ctx.pdf.askPage() });
    items.push({ icon: 'bookmark', label: `Đánh dấu trang ${ctx.pdf.cur() + 1}`, run: () => ctx.pdf.addMark() });
    items.push({ icon: 'fit', label: 'Vừa khung màn hình', run: () => ctx.setZoom && ctx.setZoom(1) });
  } else if (ctx.setZoom) items.push({ icon: 'fit', label: 'Vừa khung màn hình', run: () => ctx.setZoom(1) });
  items.push({ icon: 'save', label: 'Lưu vào máy (Documents)', run: () => doSave(f) });
  items.push({ icon: 'share', label: 'Chia sẻ (Drive, Zalo, Gmail…)', run: () => doShare(f) });
  items.push({ icon: 'open', label: 'Mở bằng ứng dụng khác', run: () => openExternal(f) });
  menu(f.name, items);
}

// ---------- phóng to thu nhỏ: chụm 2 ngón, chạm đúp, Ctrl + lăn chuột ----------
function pinchZoom(ctx, target, getZ, applyZ, min, max, originDiv = () => 1) {
  const body = ctx.body; let st = null, pinchedAt = 0, tap = null, lastTap = null;
  const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const rel = (x, y) => { const r = body.getBoundingClientRect(); return [x - r.left, y - r.top]; };
  body.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      const [sx, sy] = rel((e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2);
      st = { d0: dist(e.touches), z0: getZ(), sx, sy, cx: body.scrollLeft + sx, cy: body.scrollTop + sy, k: 1 };
      const od = originDiv();
      target.style.transformOrigin = `${st.cx / od}px ${st.cy / od}px`; tap = null;
    } else if (e.touches.length === 1) tap = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }, { passive: true });
  body.addEventListener('touchmove', e => {
    if (tap && e.touches.length === 1 && Math.hypot(e.touches[0].clientX - tap.x, e.touches[0].clientY - tap.y) > 10) tap = null;
    if (!st || e.touches.length < 2) return;
    e.preventDefault();
    const z = Math.max(min * 0.8, Math.min(max * 1.15, st.z0 * dist(e.touches) / st.d0));
    st.k = z / st.z0; target.style.transform = `scale(${st.k})`;
  }, { passive: false });
  const end = e => {
    if (st) {
      if (e.touches.length >= 2) return;
      const s = st; st = null; pinchedAt = Date.now();
      const z = Math.max(min, Math.min(max, s.z0 * s.k));
      target.style.transform = '';
      if (Math.abs(z - s.z0) > 0.005) applyZ(z, s.cx, s.cy, s.sx, s.sy);
      return;
    }
    if (!tap || e.touches.length || Date.now() - tap.t > 280 || Date.now() - pinchedAt < 400) { tap = null; return; }
    const now = Date.now();
    if (lastTap && now - lastTap.t < 320 && Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) < 40) {
      const [sx, sy] = rel(tap.x, tap.y); const z0 = getZ();
      applyZ(Math.max(min, Math.min(max, z0 > 1.3 ? 1 : 2.5)), body.scrollLeft + sx, body.scrollTop + sy, sx, sy);
      lastTap = null;
    } else lastTap = { ...tap, t: now };
    tap = null;
  };
  body.addEventListener('touchend', end); body.addEventListener('touchcancel', end);
  body.addEventListener('wheel', e => {
    if (!e.ctrlKey) return; e.preventDefault();
    const [sx, sy] = rel(e.clientX, e.clientY); const z0 = getZ();
    const z = Math.max(min, Math.min(max, z0 * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    if (z !== z0) applyZ(z, body.scrollLeft + sx, body.scrollTop + sy, sx, sy);
  }, { passive: false });
}
// Dùng cho Word / Excel / ảnh / văn bản: phóng bằng CSS zoom
function zoomable(ctx, content, base, min, max) {
  let z = 1; const zv = () => base() * z;
  const apply = () => { content.style.zoom = String(zv()); };
  const set = (nz, cx, cy, sx, sy) => {
    const old = zv(); z = nz; apply(); const k = zv() / old;
    if (cx != null) { ctx.body.scrollLeft = cx * k - sx; ctx.body.scrollTop = cy * k - sy; }
  };
  apply();
  pinchZoom(ctx, content, () => z, set, min, max, zv);
  ctx.setZoom = nz => set(nz, 0, ctx.body.scrollTop, 0, 0);
  ctx.onResize = apply;
}

// ================= PDF =================
let pdfjsP = null;
function loadPdfjs() {
  if (!pdfjsP) {
    const base = new URL('pdfjs/', location.href).href;
    pdfjsP = import(/* webpackIgnore: true */ base + 'pdf.min.mjs').then(lib => { lib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs'; return lib; })
      .catch(e => { pdfjsP = null; throw e; });
  }
  return pdfjsP;
}
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();

async function openPdf(ctx, data) {
  const lib = await loadPdfjs();
  const base = new URL('pdfjs/', location.href).href;
  const task = lib.getDocument({ data: new Uint8Array(data), cMapUrl: base + 'cmaps/', cMapPacked: true, standardFontDataUrl: base + 'standard_fonts/', wasmUrl: base + 'wasm/', isEvalSupported: false, enableXfa: false, verbosity: 0 });
  task.onPassword = (cb, reason) => {
    promptBox(reason === 2 ? 'Sai mật khẩu, nhập lại' : 'File PDF có mật khẩu', 'Mật khẩu').then(p => { if (p == null) { task.destroy(); ctx.close(); } else cb(p); });
  };
  ctx.cleanup.push(() => task.destroy());
  const doc = await task.promise;
  if (ctx.closed) return;
  const { body, el } = ctx; const n = doc.numPages;
  const key = ctx.f.exported ? null : (ctx.f.key || ctx.f.path);
  const M = await getMem(); const my = key ? (M[key] = M[key] || { p: 0, marks: [] }) : { p: 0, marks: [] };
  my.marks = my.marks || [];
  ctx.sub.textContent = `${n} trang`;

  const p1 = await doc.getPage(1); const v1 = p1.getViewport({ scale: 1 });
  const sizes = Array.from({ length: n }, () => [v1.width, v1.height]);
  const PAD = 8, GAP = 10;
  body.innerHTML = '<div class="vw-pages"></div>';
  const wrap = body.firstChild;
  const pages = [];
  for (let i = 0; i < n; i++) {
    const d = document.createElement('div'); d.className = 'vw-page'; d.dataset.i = i; d.innerHTML = `<span class="pn">${i + 1}</span>`;
    wrap.appendChild(d); pages.push({ el: d, cw: 0, vis: false, task: null, hl: null });
  }
  let zoom = 1; const tops = [], cssW = [], cssH = [];
  function layout() {
    const A = Math.max(120, (body.clientWidth - PAD * 2)) * zoom; let y = PAD;
    for (let i = 0; i < n; i++) {
      const w = A, h = A * sizes[i][1] / sizes[i][0];
      pages[i].el.style.width = w + 'px'; pages[i].el.style.height = h + 'px';
      tops[i] = y; cssW[i] = w; cssH[i] = h; y += h + GAP;
    }
    wrap.style.width = (A + PAD * 2) + 'px';
  }
  layout();
  let curPage = 0;
  const pill = el.querySelector('.vw-pill'); pill.hidden = false;
  const setPill = () => { pill.textContent = `${curPage + 1} / ${n}`; };
  function pageAt(y) { let lo = 0, hi = n - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (tops[mid] <= y) lo = mid; else hi = mid - 1; } return lo; }
  function onScroll() {
    const i = pageAt(body.scrollTop + body.clientHeight * 0.35);
    if (i !== curPage) { curPage = i; setPill(); if (key) { my.p = i; saveMem(); } }
    pill.classList.add('show'); clearTimeout(onScroll.t); onScroll.t = setTimeout(() => pill.classList.remove('show'), 1600);
  }
  body.addEventListener('scroll', onScroll, { passive: true });
  function goTo(i, frac = 0, xfrac = null) {
    i = Math.max(0, Math.min(n - 1, i));
    body.scrollTop = tops[i] + cssH[i] * frac - (frac ? body.clientHeight * 0.3 : PAD / 2);
    if (xfrac != null && zoom > 1) body.scrollLeft = PAD + cssW[i] * xfrac - body.clientWidth * 0.3;
    curPage = i; setPill(); onScroll();
  }
  function keepAnchor(fn) {
    const i = pageAt(body.scrollTop); const fr = (body.scrollTop - tops[i]) / cssH[i];
    fn(); body.scrollTop = tops[i] + fr * cssH[i];
  }

  // --- vẽ trang (lần lượt, ưu tiên trang gần trang đang xem) ---
  const q = new Set(); let running = false;
  function queue(i) { q.add(i); pump(); }
  async function pump() {
    if (running) return; running = true;
    while (q.size && !ctx.closed) {
      let best = null; for (const i of q) if (best === null || Math.abs(i - curPage) < Math.abs(best - curPage)) best = i;
      q.delete(best); const P = pages[best];
      if (!P.vis || Math.abs(P.cw - cssW[best]) < 1) continue;
      try { await renderPage(best); } catch (e) { if (!e || e.name !== 'RenderingCancelledException') console.warn(e); }
    }
    running = false;
  }
  async function renderPage(i) {
    const P = pages[i]; const page = await doc.getPage(i + 1);
    const v0 = page.getViewport({ scale: 1 });
    if (Math.abs(v0.width - sizes[i][0]) > 0.5 || Math.abs(v0.height - sizes[i][1]) > 0.5) { sizes[i] = [v0.width, v0.height]; keepAnchor(layout); }
    const cw = cssW[i]; const dpr = Math.min(window.devicePixelRatio || 1, 3);
    let s = cw / v0.width * dpr; const area = v0.width * v0.height * s * s, MAXPX = 16e6;
    if (area > MAXPX) s *= Math.sqrt(MAXPX / area);
    const vp = page.getViewport({ scale: s });
    const c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
    P.task = page.render({ canvasContext: c.getContext('2d', { alpha: false }), viewport: vp });
    await P.task.promise; P.task = null;
    if (ctx.closed || !P.vis) return;
    const old = P.el.querySelector('canvas'); if (old) { old.width = 0; old.remove(); }
    P.el.insertBefore(c, P.el.firstChild); P.cw = cw;
    const pn = P.el.querySelector('.pn'); if (pn) pn.remove();
  }
  function release(i) {
    const P = pages[i]; if (P.task) { try { P.task.cancel(); } catch (e) {} P.task = null; }
    const c = P.el.querySelector('canvas'); if (c) { c.width = 0; c.remove(); P.el.insertAdjacentHTML('afterbegin', `<span class="pn">${i + 1}</span>`); }
    P.cw = 0;
  }
  const io = new IntersectionObserver(ents => {
    for (const e of ents) { const i = +e.target.dataset.i; pages[i].vis = e.isIntersecting; if (e.isIntersecting) queue(i); else release(i); }
  }, { root: body, rootMargin: '120% 0px' });
  pages.forEach(P => io.observe(P.el));
  ctx.cleanup.push(() => { io.disconnect(); pages.forEach((P, i) => release(i)); doc.destroy(); });
  const rerender = () => pages.forEach((P, i) => { if (P.vis) queue(i); });

  // --- phóng to ---
  const setZ = (z, cx, cy, sx, sy) => {
    const k = z / zoom; zoom = z; layout();
    body.scrollLeft = cx * k - sx; body.scrollTop = cy * k - sy;
    rerender();
  };
  pinchZoom(ctx, wrap, () => zoom, setZ, 1, 5);
  ctx.setZoom = z => setZ(z, 0, body.scrollTop, 0, 0);
  ctx.onResize = () => { keepAnchor(layout); rerender(); };

  // --- kích thước thật từng trang (bản vẽ khổ ngang lẫn khổ dọc) ---
  (async () => {
    let changed = false;
    for (let i = 1; i < n && !ctx.closed; i++) {
      try { const p = await doc.getPage(i + 1); const v = p.getViewport({ scale: 1 }); if (Math.abs(v.width - sizes[i][0]) > 0.5 || Math.abs(v.height - sizes[i][1]) > 0.5) { sizes[i] = [v.width, v.height]; changed = true; } } catch (e) {}
      if (changed && (i % 25 === 0 || i === n - 1)) { keepAnchor(layout); changed = false; }
    }
  })();

  // --- mở lại trang đang đọc dở ---
  setPill();
  if (my.p > 0 && my.p < n && !ctx.f.find) { requestAnimationFrame(() => { goTo(my.p); toast(`Mở lại trang ${my.p + 1} đang đọc dở`); }); }
  pill.onclick = () => askPage();
  async function askPage() {
    const v = await promptBox('Đến trang', `Số trang (1 – ${n})`, String(curPage + 1));
    const k = parseInt(v, 10); if (k >= 1 && k <= n) goTo(k - 1);
  }
  async function addMark(i = curPage) {
    if (!key) { toast('Chỉ đánh dấu được file trong mục Tài liệu'); return; }
    const t = await promptBox('Đánh dấu trang ' + (i + 1), 'Tên gợi nhớ', 'Trang ' + (i + 1), { ph: 'VD: Sơ đồ thủy lực, BOM…' });
    if (t == null) return;
    my.marks = my.marks.filter(m => m.p !== i); my.marks.push({ p: i, t: t || 'Trang ' + (i + 1) }); my.marks.sort((a, b) => a.p - b.p); saveMem();
    toast('Đã đánh dấu trang ' + (i + 1));
  }
  ctx.pdf = { askPage, addMark, cur: () => curPage };

  // --- tìm chữ ---
  const findBar = el.querySelector('.vw-find'), inp = findBar.querySelector('input'), cnt = findBar.querySelector('.vw-cnt');
  const texts = new Map(); let results = [], ri = -1, token = 0, lastQ = '';
  async function pageText(i) {
    if (texts.has(i)) return texts.get(i);
    const page = await doc.getPage(i + 1); const tc = await page.getTextContent();
    let str = ''; const own = [], pos = [], lens = [];
    tc.items.forEach((it, k) => {
      const s = it.str ? norm(it.str) : ''; lens[k] = s.length; let j = 0;
      for (const ch of s) { if (!/\s/.test(ch)) { str += ch; own.push(k); pos.push(j); } j += ch.length; }
    });
    const r = { str, own, pos, lens, items: tc.items, vp: page.getViewport({ scale: 1 }) }; texts.set(i, r); return r;
  }
  function drawHl(i) {
    const P = pages[i]; if (P.hl) P.hl.remove(); P.hl = null;
    const list = results.filter(r => r.i === i); if (!list.length) return;
    const t = texts.get(i); const d = document.createElement('div'); d.className = 'vw-hl';
    for (const r of list) for (const b of r.boxes) {
      const x = document.createElement('i'); if (r === results[ri]) x.className = 'on';
      Object.assign(x.style, { left: b.l + '%', top: b.t + '%', width: b.w + '%', height: b.h + '%' });
      d.appendChild(x);
    }
    P.el.appendChild(d); P.hl = d; void t;
  }
  function boxesFor(t, a, b) {
    const by = new Map();
    for (let k = a; k < b; k++) { const it = t.own[k]; const p = t.pos[k]; const o = by.get(it); if (o) { o[0] = Math.min(o[0], p); o[1] = Math.max(o[1], p); } else by.set(it, [p, p]); }
    const out = [], vp = t.vp;
    for (const [k, [p0, p1]] of by) {
      const it = t.items[k]; const tx = lib.Util.transform(vp.transform, it.transform);
      const fh = Math.hypot(tx[2], tx[3]) || 8; const len = Math.max(1, t.lens[k]);
      const w = it.width || fh * len * 0.5;
      const x = tx[4] + w * p0 / len, ww = Math.max(w * (p1 - p0 + 1) / len, 4);
      out.push({ l: x / vp.width * 100, t: (tx[5] - fh * 0.95) / vp.height * 100, w: ww / vp.width * 100, h: fh * 1.25 / vp.height * 100 });
    }
    return out;
  }
  function show() {
    if (ri < 0 || !results[ri]) return;
    const r = results[ri]; cnt.textContent = `${ri + 1}/${results.length}${r.more ? '+' : ''}`;
    const pagesHl = new Set(results.map(x => x.i));
    pages.forEach((P, i) => { if (P.hl && !pagesHl.has(i)) { P.hl.remove(); P.hl = null; } });
    drawHl(r.i); if (show.prev != null && show.prev !== r.i) drawHl(show.prev); show.prev = r.i;
    const b = r.boxes[0]; goTo(r.i, b ? b.t / 100 : 0, b ? b.l / 100 : null);
  }
  async function search(qs) {
    const qq = norm(qs).replace(/\s+/g, ''); if (!qq) return;
    if (qq === lastQ && results.length) { ri = (ri + 1) % results.length; show(); return; }
    lastQ = qq; const my = ++token; results = []; ri = -1;
    pages.forEach(P => { if (P.hl) { P.hl.remove(); P.hl = null; } });
    let anyText = false;
    for (let i = 0; i < n; i++) {
      if (my !== token || ctx.closed) return;
      if (ri < 0) cnt.textContent = `${Math.round(i / n * 100)}%`;
      let t; try { t = await pageText(i); } catch (e) { continue; }
      if (t.str.length) anyText = true;
      let from = 0, idx;
      while ((idx = t.str.indexOf(qq, from)) >= 0 && results.length < 999) { results.push({ i, boxes: boxesFor(t, idx, idx + qq.length) }); from = idx + qq.length; }
      if (results.length && ri < 0) { ri = 0; show(); }
      else if (ri >= 0) { cnt.textContent = `${ri + 1}/${results.length}`; if (results.some(r => r.i === i)) drawHl(i); }
    }
    if (my !== token) return;
    if (!results.length) { cnt.textContent = '0'; toast(anyText ? 'Không tìm thấy “' + qs + '”' : 'File này là bản scan (ảnh) nên không tìm chữ được', 3200); }
  }
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); search(inp.value); } });
  findBar.querySelector('[data-a=next]').onclick = () => { if (!results.length) { search(inp.value); return; } ri = (ri + 1) % results.length; show(); };
  findBar.querySelector('[data-a=prev]').onclick = () => { if (!results.length) return; ri = (ri - 1 + results.length) % results.length; show(); };
  el.querySelector('[data-a=find]').onclick = () => { if (ctx.findOpen) ctx.closeFind(); else { findBar.hidden = false; ctx.findOpen = true; setTimeout(() => inp.focus(), 60); } };
  ctx.closeFind = () => { findBar.hidden = true; ctx.findOpen = false; token++; results = []; ri = -1; lastQ = ''; cnt.textContent = ''; pages.forEach(P => { if (P.hl) { P.hl.remove(); P.hl = null; } }); };

  if (ctx.f.find) { findBar.hidden = false; ctx.findOpen = true; inp.value = ctx.f.find; search(ctx.f.find); }

  // --- danh sách trang / mục lục / đánh dấu ---
  el.querySelector('[data-a=pages]').onclick = () => pagesSheet();
  async function pagesSheet() {
    let outline = null; try { outline = await doc.getOutline(); } catch (e) {}
    let alive = true; const tq = []; let tRunning = false;
    openSheet('Trang tài liệu', `<div class="chips vw-seg" style="margin:0 0 12px;padding:0">
        <button class="chip on" data-t="th">Các trang</button><button class="chip" data-t="ol">Mục lục</button><button class="chip" data-t="bm">Đánh dấu (${my.marks.length})</button></div>
      <div data-p="th"><div class="vw-thumbs">${Array.from({ length: n }, (_, i) => `<button class="vw-th ${i === curPage ? 'on' : ''}" data-i="${i}"><div class="im" style="aspect-ratio:${sizes[i][0]}/${sizes[i][1]}"></div><span>${i + 1}</span></button>`).join('')}</div></div>
      <div data-p="ol" hidden></div><div data-p="bm" hidden></div>`, (b, close) => {
      const tabs = b.querySelectorAll('[data-t]');
      tabs.forEach(t => t.onclick = () => { tabs.forEach(x => x.classList.toggle('on', x === t)); b.querySelectorAll('[data-p]').forEach(p => p.hidden = p.dataset.p !== t.dataset.t); });
      b.querySelectorAll('.vw-th').forEach(x => x.onclick = () => { close(); goTo(+x.dataset.i); });
      // ảnh thu nhỏ
      const tio = new IntersectionObserver(ents => ents.forEach(e => { if (e.isIntersecting) { tio.unobserve(e.target); tq.push(e.target); tpump(); } }), { rootMargin: '200px' });
      b.querySelectorAll('.vw-th .im').forEach(x => tio.observe(x));
      async function tpump() {
        if (tRunning) return; tRunning = true;
        while (tq.length && alive) {
          const im = tq.shift(); const i = +im.parentNode.dataset.i;
          try {
            const page = await doc.getPage(i + 1); const v0 = page.getViewport({ scale: 1 });
            const vp = page.getViewport({ scale: 220 / v0.width }); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
            await page.render({ canvasContext: c.getContext('2d', { alpha: false }), viewport: vp }).promise; if (alive) im.appendChild(c);
          } catch (e) {}
        }
        tRunning = false;
      }
      setTimeout(() => { const on = b.querySelector('.vw-th.on'); if (on) on.scrollIntoView({ block: 'center' }); }, 60);
      // mục lục
      const ol = b.querySelector('[data-p=ol]');
      if (!outline || !outline.length) ol.innerHTML = `<div class="empty">${ic('list')}File này không có mục lục</div>`;
      else {
        const flat = []; const walk = (arr, d) => arr.forEach(o => { flat.push({ o, d }); if (o.items && o.items.length && d < 3) walk(o.items, d + 1); }); walk(outline, 0);
        ol.innerHTML = flat.map((x, k) => `<button class="menu-item vw-ol" data-k="${k}" style="padding-left:${12 + x.d * 18}px">${x.d ? '' : ic('chev')}<span>${esc(x.o.title)}</span></button>`).join('');
        ol.querySelectorAll('[data-k]').forEach(x => x.onclick = async () => {
          const o = flat[+x.dataset.k].o; let dest = o.dest;
          try {
            if (typeof dest === 'string') dest = await doc.getDestination(dest);
            if (Array.isArray(dest)) { const ref = dest[0]; const i = typeof ref === 'number' ? ref : await doc.getPageIndex(ref); close(); goTo(i); }
          } catch (e) { toast('Không mở được mục này'); }
        });
      }
      // đánh dấu
      const bm = b.querySelector('[data-p=bm]');
      const drawBm = () => {
        bm.innerHTML = `<button class="btn sec" data-add style="margin-bottom:10px">${ic('bookmark')} Đánh dấu trang đang xem (trang ${curPage + 1})</button>` +
          (my.marks.length ? my.marks.map((m, k) => `<div class="item" data-go="${k}"><div class="fi pdf">${ic('bookmark')}</div><div class="grow"><div class="nm">${esc(m.t)}</div><div class="sz">Trang ${m.p + 1}</div></div><button class="icon-btn" data-del="${k}">${ic('trash')}</button></div>`).join('')
            : `<div class="empty">Chưa đánh dấu trang nào</div>`);
        tabs[2].textContent = `Đánh dấu (${my.marks.length})`;
        bm.querySelector('[data-add]').onclick = async () => { await addMark(); drawBm(); };
        bm.querySelectorAll('[data-go]').forEach(x => x.onclick = e => { if (e.target.closest('[data-del]')) return; close(); goTo(my.marks[+x.dataset.go].p); });
        bm.querySelectorAll('[data-del]').forEach(x => x.onclick = () => { my.marks.splice(+x.dataset.del, 1); saveMem(); drawBm(); });
      };
      drawBm();
      if (!key) tabs[2].hidden = true;
    }, { onClose: () => { alive = false; } });
  }
}

// ================= WORD =================
async function openDocx(ctx, data) {
  const { body, el } = ctx;
  body.innerHTML = '<div class="vw-doc"></div>'; const wrap = body.firstChild;
  const styleEl = document.createElement('div'); styleEl.hidden = true; el.appendChild(styleEl);
  await renderAsync(data, wrap, styleEl, { className: 'docx', inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: true, experimental: true, useBase64URL: true, renderHeaders: true, renderFooters: true, renderFootnotes: true, renderEndnotes: true });
  const secs = wrap.querySelectorAll('section.docx');
  let pw = 0; secs.forEach(s => { pw = Math.max(pw, s.offsetWidth); }); pw = pw || 794;
  wrap.style.width = (pw + 16) + 'px';
  ctx.sub.textContent = secs.length > 1 ? `${secs.length} trang · chỉ xem` : 'Chỉ xem';
  zoomable(ctx, wrap, () => body.clientWidth / (pw + 16), 1, 4);
}

// ================= EXCEL =================
function openXls(ctx, data) {
  const { body, el } = ctx;
  const wb = XLSX.read(new Uint8Array(data), { type: 'array', cellDates: true, cellStyles: true });
  const names = wb.SheetNames;
  const tabs = el.querySelector('.vw-tabs');
  if (names.length > 1) {
    tabs.hidden = false;
    tabs.innerHTML = names.map((nm, k) => `<button class="${k ? '' : 'on'}" data-k="${k}">${esc(nm)}</button>`).join('');
  }
  body.innerHTML = '<div class="vw-sheet"></div>'; const wrap = body.firstChild;
  const show = k => {
    const ws = wb.Sheets[names[k]]; const r = sheetHtml(ws);
    wrap.innerHTML = r.html; ctx.sub.textContent = `${names.length > 1 ? `Sheet ${k + 1}/${names.length} · ` : ''}${r.info}`;
    body.scrollTop = 0; body.scrollLeft = 0;
    tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.k === k));
  };
  tabs.querySelectorAll('button').forEach(b => b.onclick = () => show(+b.dataset.k));
  // chạm vào ô bị che bớt chữ → hiện đủ nội dung
  wrap.addEventListener('click', e => { const td = e.target.closest('td'); if (td && td.textContent && td.scrollWidth > td.clientWidth + 1) toast(td.textContent, 4500); });
  show(0);
  zoomable(ctx, wrap, () => 1, 0.3, 3);
}
function sheetHtml(ws) {
  if (!ws || !ws['!ref']) return { html: '<div class="empty">Sheet trống</div>', info: 'trống' };
  const r = XLSX.utils.decode_range(ws['!ref']);
  const R1 = Math.min(r.e.r, r.s.r + 2999), C1 = Math.min(r.e.c, r.s.c + 99);
  const span = new Map(), cover = new Set();
  for (const m of ws['!merges'] || []) {
    span.set(m.s.r + ',' + m.s.c, [m.e.r - m.s.r + 1, m.e.c - m.s.c + 1]);
    for (let y = m.s.r; y <= m.e.r; y++) for (let x = m.s.c; x <= m.e.c; x++) if (y !== m.s.r || x !== m.s.c) cover.add(y + ',' + x);
  }
  const cols = ws['!cols'] || [], rows = ws['!rows'] || [];
  const cw = c => { const o = cols[c]; if (o && o.hidden) return 0; return Math.round(o ? (o.wpx || (o.wch ? o.wch * 7 + 10 : o.width ? o.width * 7 : 80)) : 80); };
  let h = '<table><colgroup><col style="width:38px">';
  for (let c = r.s.c; c <= C1; c++) h += `<col style="width:${cw(c)}px">`;
  h += '</colgroup><thead><tr><th class="cn"></th>';
  for (let c = r.s.c; c <= C1; c++) h += `<th>${XLSX.utils.encode_col(c)}</th>`;
  h += '</tr></thead><tbody>';
  for (let y = r.s.r; y <= R1; y++) {
    const ro = rows[y]; if (ro && ro.hidden) continue;
    h += `<tr${ro && ro.hpx ? ` style="height:${Math.round(ro.hpx)}px"` : ''}><th>${y + 1}</th>`;
    for (let x = r.s.c; x <= C1; x++) {
      const k = y + ',' + x; if (cover.has(k)) continue;
      const cell = ws[XLSX.utils.encode_cell({ r: y, c: x })]; const sp = span.get(k);
      let t = ''; if (cell) t = cell.w != null ? cell.w : cell.v instanceof Date ? cell.v.toLocaleDateString('vi-VN') : String(cell.v ?? '');
      const num = cell && cell.t === 'n';
      let cs = sp ? sp[1] : 1;
      // chữ dài tràn sang ô trống bên phải giống Excel
      if (!sp && t && !num && !t.includes('\n')) {
        let w = cw(x); const need = t.length * 7.2 + 12;
        while (w < need && x + cs <= C1) {
          const nk = y + ',' + (x + cs); const nc = ws[XLSX.utils.encode_cell({ r: y, c: x + cs })];
          if (cover.has(nk) || span.has(nk) || (nc && nc.v != null && nc.v !== '')) break;
          w += cw(x + cs); cs++;
        }
        for (let j = 1; j < cs; j++) cover.add(y + ',' + (x + j));
      }
      const cls = [num ? 'n' : '', t.includes('\n') || sp ? 'w' : ''].filter(Boolean).join(' ');
      h += `<td${cls ? ` class="${cls}"` : ''}${sp ? ` rowspan="${sp[0]}"` : ''}${cs > 1 ? ` colspan="${cs}"` : ''}>${esc(t).replace(/\n/g, '<br>')}</td>`;
    }
    h += '</tr>';
  }
  h += '</tbody></table>';
  const more = r.e.r > R1 || r.e.c > C1;
  if (more) h += `<div class="vw-note">Chỉ hiện ${R1 - r.s.r + 1} dòng × ${C1 - r.s.c + 1} cột đầu. Mở bằng Excel để xem đủ.</div>`;
  return { html: h, info: `${r.e.r - r.s.r + 1} dòng × ${r.e.c - r.s.c + 1} cột` };
}

// ================= ẢNH / VĂN BẢN =================
async function openImg(ctx) {
  const { body, f } = ctx;
  const src = f.b64 ? `data:${f.mime || 'image/jpeg'};base64,${f.b64}` : await fileSrc(f.path);
  body.innerHTML = `<div class="vw-img"><img alt=""></div>`; const wrap = body.firstChild; const img = wrap.firstChild;
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Ảnh bị lỗi')); img.src = src; });
  ctx.sub.textContent = `${img.naturalWidth} × ${img.naturalHeight}`;
  const W = img.naturalWidth; img.style.width = W + 'px'; wrap.style.width = W + 'px';
  zoomable(ctx, wrap, () => Math.min(1, body.clientWidth / W), 1, 8);
}
function openText(ctx, data) {
  const txt = new TextDecoder('utf-8').decode(new Uint8Array(data).subarray(0, 2e6));
  ctx.body.innerHTML = `<pre class="vw-txt"></pre>`; ctx.body.firstChild.textContent = txt;
  ctx.sub.textContent = `${txt.split('\n').length} dòng`;
  zoomable(ctx, ctx.body.firstChild, () => 1, 0.6, 3);
}
