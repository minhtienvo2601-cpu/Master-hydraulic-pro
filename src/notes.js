import { S, save, device, newBacklog, pathInUse, COLORS, tpl, signersOf } from './store.js';
import { nav, push, pop } from './nav.js';
import { ic } from './icons.js';
import { esc, uid, today, fmtD, fmtShort, matcher, highlight, $$ } from './util.js';
import { openSheet, confirmBox, promptBox, menu, toast, busy, viewPhoto, addPhotos } from './ui.js';
import { deletePath, fileSrc, capturePhotos, pickPhotos, ocrPhoto, ocrAvailable } from './platform.js';
import { parseLabel } from './label.js';
import { exportPdf, exportDocx, exportXlsx } from './exporter.js';

export const note = id => S.state.notes.find(n => n.id === id);
const cat = id => S.state.noteCats.find(c => c.id === id);
const QA = { ok: ['Đạt', 'qa-ok'], ng: ['Không đạt', 'qa-ng'], chk: ['Cần xem lại', 'qa-chk'] };
let noteCatF = 'all', noteQ = '';

function newNote(p = {}) {
  const n = Object.assign({ id: uid(), title: '', cat: noteCatF !== 'all' ? noteCatF : 'kt', pinned: false, deviceId: '', created: new Date().toISOString(), updated: new Date().toISOString(), qa: null, blocks: [{ id: uid(), t: 'p', text: '' }] }, p);
  S.state.notes.unshift(n); return n;
}
const textOf = n => [n.title, ...n.blocks.map(b => b.t === 'img' ? [b.caption, (b.codes || []).join(' ')].join(' ') : b.text), n.qa ? Object.values(n.qa).join(' ') : ''].join(' ');
function firstPhoto(n) { for (const b of n.blocks) if (b.t === 'img' && b.photos?.length) return b.photos[0]; return null; }
function snippetOf(n) { const t = n.blocks.filter(b => b.t !== 'img' && b.text).map(b => b.text).join(' · '); return t.slice(0, 110); }

// ---------------- danh sách ----------------
export function viewNotes(v) {
  const cats = S.state.noteCats; const m = noteQ.trim().length >= 2 ? matcher(noteQ) : null;
  let list = S.state.notes.filter(n => (noteCatF === 'all' || n.cat === noteCatF) && (!m || m(textOf(n))));
  list.sort((a, b) => (b.pinned - a.pinned) || b.updated.localeCompare(a.updated));
  v.innerHTML = `<div class="fade-in">
    <div class="searchbox">${ic('search')}<input id="nq" placeholder="Tìm ghi chú, mã vật tư, chú thích…" value="${esc(noteQ)}" autocomplete="off"></div>
    <div class="chips" style="margin-top:12px"><button class="chip ${noteCatF === 'all' ? 'on' : ''}" data-c="all">Tất cả<span class="c">${S.state.notes.length}</span></button>
      ${cats.map(c => `<button class="chip ${noteCatF === c.id ? 'on' : ''}" data-c="${c.id}"><span class="cdot" style="background:${c.color}"></span>${esc(c.name)}<span class="c">${S.state.notes.filter(n => n.cat === c.id).length}</span></button>`).join('')}
      <button class="chip" data-cats>${ic('edit')}</button></div>
    <div id="nlist" style="margin-top:6px">${list.length ? '' : `<div class="empty">${ic('note')}${S.state.notes.length ? 'Không có ghi chú phù hợp' : 'Chưa có ghi chú nào.<br>Bấm nút <b style="color:var(--gold)">+</b> để tạo ghi chú, chụp ảnh vật tư QA…'}</div>`}</div>
    ${list.length && noteCatF !== 'all' ? `<button class="btn sec" id="nExpAll" style="margin-top:6px">${ic('upload')} Xuất cả mục “${esc(cat(noteCatF)?.name || '')}”</button>` : ''}</div>`;
  const box = v.querySelector('#nlist');
  box.insertAdjacentHTML('beforeend', list.map(n => {
    const c = cat(n.cat); const imgs = n.blocks.filter(b => b.t === 'img'); const nph = imgs.reduce((s, b) => s + (b.photos?.length || 0), 0);
    const ok = imgs.filter(b => b.qa === 'ok').length, ng = imgs.filter(b => b.qa === 'ng').length; const fp = firstPhoto(n); const dev = device(n.deviceId);
    return `<div class="ncard" data-n="${n.id}"><div class="grow" style="min-width:0">
      <div class="row" style="gap:6px">${n.pinned ? `<span class="pinmark">${ic('pin')}</span>` : ''}<div class="nt ellip">${esc(n.title || 'Ghi chú không tên')}</div></div>
      <div class="ns">${esc(snippetOf(n)) || '<span class="muted">…</span>'}</div>
      <div class="t-meta">${c ? `<span><span class="cdot" style="background:${c.color}"></span>${esc(c.name)}</span>` : ''}<span>${fmtShort(n.updated.slice(0, 10))}</span>
        ${nph ? `<span>${ic('camera')} ${nph}</span>` : ''}${ok ? `<span class="qa-ok-t">✔ ${ok}</span>` : ''}${ng ? `<span class="qa-ng-t">✘ ${ng}</span>` : ''}${dev ? `<span>${ic('device')} ${esc(dev.name)}</span>` : ''}</div></div>
      ${fp ? `<img class="nthumb" data-src="${esc(fp)}">` : ''}</div>`;
  }).join(''));
  $$('img[data-src]', box).forEach(async im => { im.src = await fileSrc(im.dataset.src); });
  $$('[data-n]', box).forEach(el => el.onclick = () => push({ v: 'note', id: el.dataset.n }));
  $$('[data-c]', v).forEach(b => b.onclick = () => { noteCatF = b.dataset.c; nav.render(); });
  v.querySelector('[data-cats]').onclick = () => catManager();
  const inp = v.querySelector('#nq'); let t; inp.oninput = () => { clearTimeout(t); t = setTimeout(() => { noteQ = inp.value; const pos = inp.selectionStart; nav.render(); const i2 = document.querySelector('#nq'); if (i2) { i2.focus(); i2.setSelectionRange(pos, pos); } }, 250); };
  const ea = v.querySelector('#nExpAll'); if (ea) ea.onclick = () => exportMenu(list, cat(noteCatF)?.name);
}
export function newNoteAndOpen(p) { const n = newNote(p); save(); push({ v: 'note', id: n.id, fresh: true }); }

function catManager() {
  const draw = (b) => {
    b.innerHTML = S.state.noteCats.map(c => `<div class="set-row"><span class="cdot big" style="background:${c.color}"></span><div class="grow tt">${esc(c.name)}</div>
      <button class="more" data-ed="${c.id}">${ic('edit')}</button><button class="more" data-del="${c.id}">${ic('trash')}</button></div>`).join('') +
      `<button class="btn sec" data-add style="margin-top:12px">${ic('plus')} Thêm mục</button>`;
    b.querySelector('[data-add]').onclick = async () => { const n = await promptBox('Mục mới', 'Tên mục', '', { ph: 'VD: Bơm, Van servo, Hồ sơ nghiệm thu…' }); if (n) { S.state.noteCats.push({ id: uid(), name: n, color: COLORS[S.state.noteCats.length % COLORS.length] }); save(); draw(b); nav.render(); } };
    $$('[data-ed]', b).forEach(x => x.onclick = async () => { const c = cat(x.dataset.ed); const n = await promptBox('Đổi tên mục', 'Tên mục', c.name); if (n) { c.name = n; save(); draw(b); nav.render(); } });
    $$('[data-del]', b).forEach(x => x.onclick = async () => {
      const c = cat(x.dataset.del); const cnt = S.state.notes.filter(n => n.cat === c.id).length;
      if (S.state.noteCats.length <= 1) { toast('Cần giữ ít nhất 1 mục'); return; }
      if (!await confirmBox('Xóa mục?', `Xóa mục “${esc(c.name)}”.${cnt ? ` ${cnt} ghi chú trong mục sẽ chuyển sang mục “${esc(S.state.noteCats.find(z => z !== c).name)}”.` : ''}`, 'Xóa', true)) return;
      const other = S.state.noteCats.find(z => z !== c); S.state.notes.forEach(n => { if (n.cat === c.id) n.cat = other.id; });
      S.state.noteCats = S.state.noteCats.filter(z => z !== c); if (noteCatF === c.id) noteCatF = 'all'; save(); draw(b); nav.render();
    });
  };
  openSheet('Quản lý mục ghi chú', '<div class="set-group" id="cm"></div>', b => draw(b.querySelector('#cm')));
}

// ---------------- trình soạn ghi chú ----------------
let saveT = null, focusId = null, focusHooked = false;
function touch(n) { n.updated = new Date().toISOString(); clearTimeout(saveT); saveT = setTimeout(() => save(), 400); }
// Mã vật tư đã nhập gần đây (mới nhất trước), lấy từ các ghi chú
function recentCodes() {
  const out = [], seen = new Set();
  const notes = [...S.state.notes].sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  for (const n of notes) for (const b of [...n.blocks].reverse()) if (b.t === 'img') for (const c of [...(b.codes || [])].reverse()) { const k = c.toUpperCase(); if (!seen.has(k)) { seen.add(k); out.push(c); } }
  return out;
}
const ckey = s => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
// Tối đa 3 gợi ý: ô trống → 3 mã nhập gần nhất; đang gõ → mã khớp (ưu tiên mã đã dùng gần đây)
function suggestCodes(q, exclude) {
  const ex = new Set((exclude || []).map(c => c.toUpperCase())); const k = ckey(q); const out = [];
  const push = c => { if (out.length < 3 && !ex.has(c.toUpperCase()) && !out.some(o => o.toUpperCase() === c.toUpperCase())) out.push(c); };
  const rc = recentCodes();
  if (!k) { rc.forEach(push); return out; }
  rc.filter(c => ckey(c).includes(k)).forEach(push);
  if (out.length < 3 && k.length >= 3) codeSuggestions().filter(c => ckey(c).includes(k)).forEach(push);
  return out;
}
function codeSuggestions() {
  const set = new Set(); const re = /\b\d{3,}(?:[-.]\d+)+\b|\b[A-Z]{1,4}[-\d]*\d{2,}[A-Z0-9-]*\b/g;
  for (const nd of S.state.nodes) (nd.codes || '').split('\n').forEach(l => (l.match(re) || []).forEach(x => set.add(x)));
  for (const n of S.state.notes) for (const b of n.blocks) if (b.t === 'img') (b.codes || []).forEach(x => set.add(x));
  let cnt = 0; for (const lines of Object.values(S.index)) { for (const l of lines) { (l.match(re) || []).forEach(x => set.add(x)); if (++cnt > 20000) break; } if (set.size > 3000) break; }
  return [...set].slice(0, 3000);
}

export function viewNote(v, id, fresh) {
  const n = note(id); if (!n) { pop(); return; }
  const c = cat(n.cat); const dev = device(n.deviceId);
  v.innerHTML = `<div class="editor">
    <input class="ed-title" id="eT" placeholder="Tiêu đề ghi chú" value="${esc(n.title)}">
    <div class="ed-meta">
      <button class="mchip" data-m="cat"><span class="cdot" style="background:${c?.color || '#999'}"></span>${esc(c?.name || 'Chọn mục')}</button>
      <button class="mchip" data-m="dev">${ic('device')}${dev ? esc(dev.name) : 'Gắn thiết bị'}</button>
      <button class="mchip ${n.pinned ? 'on' : ''}" data-m="pin">${ic('pin')}${n.pinned ? 'Đã ghim' : 'Ghim'}</button>
      <button class="mchip" data-m="qa">${ic('tag')}${n.qa ? 'Phiếu QA' : 'Thêm thông tin QA'}</button>
    </div>
    ${n.qa ? `<div class="qa-head" data-m="qa"><div><span>Số PO / phiếu nhập</span><b>${esc(n.qa.po || '—')}</b></div><div><span>Nhà cung cấp</span><b>${esc(n.qa.supplier || '—')}</b></div>
      <div><span>Người kiểm tra</span><b>${esc(n.qa.inspector || '—')}</b></div><div><span>Ngày kiểm tra</span><b>${n.qa.date ? fmtShort(n.qa.date) + '/' + n.qa.date.slice(0, 4) : '—'}</b></div></div>` : ''}
    <div id="blocks"></div>
    <div class="ed-foot muted">Tự động lưu · sửa lần cuối ${new Date(n.updated).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</div>
  </div>
  <div class="ed-bar" id="edBar">
    <button data-add="img">${ic('camera')}<span>Ảnh vật tư</span></button>
    <button data-add="h"><b style="font-size:17px">H</b><span>Tiêu đề</span></button>
    <button data-add="p">${ic('note')}<span>Đoạn</span></button>
    <button data-add="li"><b style="font-size:20px;line-height:20px">•</b><span>Gạch đầu</span></button>
    <button data-add="chk">${ic('done')}<span>Checklist</span></button>
  </div>`;
  const q = s => v.querySelector(s);
  q('#eT').oninput = e => { n.title = e.target.value; touch(n); };
  if (fresh) setTimeout(() => q('#eT').focus(), 200);
  $$('[data-m]', v).forEach(b => b.onclick = () => metaAction(n, b.dataset.m));
  focusId = null;
  if (!focusHooked) { focusHooked = true; document.addEventListener('focusin', e => { const bl = e.target.closest && e.target.closest('[data-bid]'); if (bl) focusId = bl.dataset.bid; }); }
  $$('[data-add]', q('#edBar')).forEach(b => b.onmousedown = e => e.preventDefault());
  $$('[data-add]', q('#edBar')).forEach(b => b.onclick = async () => {
    const t = b.dataset.add;
    const blk = t === 'img' ? { id: uid(), t: 'img', photos: [], codes: [], caption: '', qa: '', qty: '' } : { id: uid(), t, text: '', done: false };
    lockDone(n); // thêm mục mới → các mục ảnh đã nhập tự khóa
    // mục mới luôn ở cuối; nếu dòng cuối là đoạn trống thì dùng luôn dòng đó
    const last = n.blocks[n.blocks.length - 1];
    if (last && last.t !== 'img' && !last.text && t !== 'img') { last.t = t; touch(n); renderBlocks(v, n); focusBlock(v, last.id); scrollToBlock(v, last.id); return; }
    n.blocks.push(blk); touch(n); renderBlocks(v, n); scrollToBlock(v, blk.id);
    if (t === 'img') { await addPhoto(v, n, blk); setTimeout(() => { v.querySelector(`[data-bid="${blk.id}"] .cinp`)?.focus(); scrollToBlock(v, blk.id); }, 150); }
    else focusBlock(v, blk.id);
  });
  renderBlocks(v, n);
}
function focusBlock(v, id) { const el = v.querySelector(`[data-bid="${id}"] textarea`); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
function autoGrow(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }

// mục ảnh "đã nhập" = có ảnh hoặc mã hoặc chú thích
const hasContent = b => (b.photos || []).length || (b.codes || []).length || (b.caption || '').trim() || (b.name || '').trim();
function lockDone(n) { let ch = false; for (const b of n.blocks) if (b.t === 'img' && !b.locked && hasContent(b)) { b.locked = true; ch = true; } if (ch) touch(n); return ch; }
function scrollToBlock(v, id) { setTimeout(() => { const el = v.querySelector(`[data-bid="${id}"]`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 60); }
function lockedHtml(b, imgNo) {
  return `<div class="blk blk-img locked" data-bid="${b.id}">
    <div class="bi-head"><b>Hình ${imgNo}</b>${b.qa ? `<span class="qa ${QA[b.qa][1]}">${QA[b.qa][0]}</span>` : ''}${b.qty ? `<span class="bi-sl">SL: ${esc(b.qty)}</span>` : ''}<span class="grow"></span>
      <button class="bi-unlock" data-unlock>${ic('lock')}<span>Mở khóa</span></button><button class="more" data-bm="${b.id}">${ic('dots')}</button></div>
    ${(b.photos || []).length ? `<div class="bi-strip">${b.photos.map((p, i) => `<img data-src="${esc(p)}" data-i="${i}">`).join('')}</div>` : ''}
    ${(b.codes || []).length ? `<div class="bi-codes ro">${b.codes.map(c => `<span class="code">${esc(c)}</span>`).join('')}</div>` : ''}
    ${(b.name || '').trim() ? `<div class="bi-nametxt">${esc(b.name)}</div>` : ''}
    ${(b.caption || '').trim() ? `<div class="bi-captxt">${esc(b.caption)}</div>` : ''}
    ${b.qa === 'ng' && b.backlogId ? `<div class="bi-captxt muted" style="font-style:normal">${ic('alert')} Đã tạo tồn đọng</div>` : ''}
  </div>`;
}

function renderBlocks(v, n) {
  const box = v.querySelector('#blocks'); let imgNo = 0;
  box.innerHTML = n.blocks.map(b => {
    if (b.t === 'img') {
      imgNo++;
      if (b.locked) return lockedHtml(b, imgNo);
      return `<div class="blk blk-img" data-bid="${b.id}">
        <div class="bi-head"><b>Hình ${imgNo}</b><span class="grow"></span>${b.qa ? `<span class="qa ${QA[b.qa][1]}">${QA[b.qa][0]}</span>` : ''}${ocrAvailable ? `<button class="bi-ocr" data-ocr>${ic('scan')}<span>Đọc tem</span></button>` : ''}<button class="more" data-bm="${b.id}">${ic('dots')}</button></div>
        <div class="bi-grid">${(b.photos || []).map((p, i) => `<div class="bi-ph"><img data-src="${esc(p)}" data-i="${i}"><button data-rmph="${i}">${ic('x', 2.4)}</button></div>`).join('')}
          <button class="bi-add" data-addph>${ic('camera')}<span>${b.photos?.length ? 'Thêm ảnh' : 'Chụp / chọn ảnh'}</span></button></div>
        <div class="bi-codes">${(b.codes || []).map((c, i) => `<span class="code">${esc(c)}<button data-rmc="${i}">${ic('x', 2.6)}</button></span>`).join('')}
          <input class="cinp" autocomplete="off" placeholder="${b.codes?.length ? '+ mã khác' : 'Nhập mã vật tư…'}" enterkeyhint="done"></div>
        <div class="csug" hidden></div>
        <textarea class="bi-name" rows="1" placeholder="Tên vật tư">${esc(b.name || '')}</textarea>
        <div class="bi-row"><div class="qa-seg">${Object.entries(QA).map(([k, [l, c]]) => `<button data-qa="${k}" class="${c} ${b.qa === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          <input class="bi-qty" placeholder="SL" value="${esc(b.qty || '')}"></div>
        ${b.qa === 'ng' ? `<button class="btn sec bi-bl" data-bl>${ic('alert')} ${b.backlogId ? 'Đã tạo tồn đọng ✔' : 'Tạo tồn đọng / khiếu nại NCC'}</button>` : ''}
        <textarea class="bi-cap" rows="1" placeholder="Chú thích / mô tả (tùy chọn)">${esc(b.caption || '')}</textarea>
        ${hasContent(b) ? `<button class="btn pri bi-done" data-done>${ic('check')} Xong – khóa mục này</button>` : ''}
      </div>`;
    }
    const cls = { h: 'blk-h', p: 'blk-p', li: 'blk-li', chk: 'blk-chk' }[b.t];
    return `<div class="blk ${cls} ${b.t === 'chk' && b.done ? 'checked' : ''}" data-bid="${b.id}">
      ${b.t === 'li' ? '<span class="bul">•</span>' : ''}${b.t === 'chk' ? `<button class="cbx" data-cbx>${ic('check', 3)}</button>` : ''}
      <textarea rows="1" placeholder="${{ h: 'Tiêu đề mục', p: 'Nhập nội dung…', li: 'Gạch đầu dòng', chk: 'Việc cần làm' }[b.t]}">${esc(b.text || '')}</textarea>
      <button class="bdel" data-bm="${b.id}">${ic('dots')}</button></div>`;
  }).join('');
  $$('textarea', box).forEach(autoGrow);
  for (const el of $$('[data-bid]', box)) {
    const b = n.blocks.find(x => x.id === el.dataset.bid);
    el.querySelector('[data-bm]') && (el.querySelector('[data-bm]').onclick = () => blockMenu(v, n, b));
    if (b.t === 'img') bindImg(v, n, b, el);
    else {
      const ta = el.querySelector('textarea');
      ta.oninput = () => { b.text = ta.value; autoGrow(ta); touch(n); };
      ta.onkeydown = e => {
        if (e.key === 'Enter' && (b.t === 'li' || b.t === 'chk' || b.t === 'h')) {
          e.preventDefault();
          if (!ta.value && b.t !== 'h') { b.t = 'p'; renderBlocks(v, n); focusBlock(v, b.id); touch(n); return; }
          const nb = { id: uid(), t: b.t === 'h' ? 'p' : b.t, text: '', done: false }; n.blocks.splice(n.blocks.indexOf(b) + 1, 0, nb); touch(n); renderBlocks(v, n); focusBlock(v, nb.id);
        } else if (e.key === 'Backspace' && !ta.value && n.blocks.length > 1) {
          e.preventDefault(); const i = n.blocks.indexOf(b); n.blocks.splice(i, 1); touch(n); renderBlocks(v, n);
          const prev = n.blocks[Math.max(0, i - 1)]; if (prev && prev.t !== 'img') focusBlock(v, prev.id);
        }
      };
      const cb = el.querySelector('[data-cbx]'); if (cb) cb.onclick = () => { b.done = !b.done; el.classList.toggle('checked', b.done); touch(n); };
    }
  }
  $$('img[data-src]', box).forEach(async im => { im.src = await fileSrc(im.dataset.src); });
}
function bindImg(v, n, b, el) {
  if (b.locked) {
    $$('img[data-i]', el).forEach(im => im.onclick = () => viewPhoto(im.src));
    el.querySelector('[data-unlock]').onclick = () => { b.locked = false; touch(n); renderBlocks(v, n); };
    return;
  }
  const dn = el.querySelector('[data-done]'); if (dn) dn.onclick = () => { if (ci.value.trim()) addCodeSilently(); b.locked = true; touch(n); renderBlocks(v, n); };
  const addCodeSilently = () => { const vals = ci.value.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean); b.codes = [...(b.codes || []), ...vals.filter(x => !(b.codes || []).includes(x))]; ci.value = ''; };
  el.querySelector('[data-addph]').onclick = () => addPhoto(v, n, b);
  $$('[data-rmph]', el).forEach(x => x.onclick = async () => {
    if (!await confirmBox('Xóa ảnh?', 'Ảnh sẽ bị gỡ khỏi khối này.', 'Xóa', true)) return;
    const p = b.photos.splice(+x.dataset.rmph, 1)[0]; touch(n); if (!pathInUse(p)) deletePath(p); renderBlocks(v, n);
  });
  $$('img[data-i]', el).forEach(im => im.onclick = () => viewPhoto(im.src));
  $$('[data-rmc]', el).forEach(x => x.onclick = () => { b.codes.splice(+x.dataset.rmc, 1); touch(n); renderBlocks(v, n); });
  const ci = el.querySelector('.cinp');
  const addCode = () => { const vals = ci.value.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean); if (!vals.length) return false; b.codes = [...(b.codes || []), ...vals.filter(x => !(b.codes || []).includes(x))]; touch(n); renderBlocks(v, n); setTimeout(() => v.querySelector(`[data-bid="${b.id}"] .cinp`)?.focus(), 30); return true; };
  ci.onkeydown = e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addCode(); } };
  // gợi ý tối đa 3 mã
  const sg = el.querySelector('.csug');
  const showSug = () => {
    const list = suggestCodes(ci.value, b.codes);
    sg.hidden = !list.length;
    sg.innerHTML = list.length ? `<span class="muted">${ci.value.trim() ? 'Gợi ý' : 'Gần đây'}:</span>` + list.map(c => `<button data-sg="${esc(c)}">${esc(c)}</button>`).join('') : '';
    $$('[data-sg]', sg).forEach(x => { x.onpointerdown = e => e.preventDefault(); x.onclick = () => { ci.value = x.dataset.sg; addCode(); }; });
  };
  ci.addEventListener('focus', showSug); ci.addEventListener('input', showSug);
  ci.addEventListener('blur', () => setTimeout(() => { sg.hidden = true; }, 150));
  ci.onchange = () => { if (ci.value && S.state && ci.value.length > 2) addCode(); };
  ci.onblur = () => { if (ci.value.trim()) addCode(); };
  const cap = el.querySelector('.bi-cap'); cap.oninput = () => { b.caption = cap.value; autoGrow(cap); touch(n); };
  const nm = el.querySelector('.bi-name'); nm.oninput = () => { b.name = nm.value.replace(/\n/g, ' '); autoGrow(nm); touch(n); };
  const oc = el.querySelector('[data-ocr]'); if (oc) oc.onclick = () => readLabel(v, n, b);
  el.querySelector('.bi-qty').oninput = e => { b.qty = e.target.value; touch(n); };
  $$('[data-qa]', el).forEach(x => x.onclick = () => { b.qa = b.qa === x.dataset.qa ? '' : x.dataset.qa; touch(n); renderBlocks(v, n); });
  const blb = el.querySelector('[data-bl]'); if (blb) blb.onclick = () => {
    if (b.backlogId) { toast('Tồn đọng đã được tạo – xem ở Nhật ký'); return; }
    const nb = newBacklog({ deviceId: n.deviceId, desc: `QA không đạt: ${(b.codes || []).join(', ') || 'vật tư'}${b.name ? ' ' + b.name : ''}${b.caption ? ' – ' + b.caption : ''}`, reason: 'khac', reasonText: 'Chờ đổi hàng / khiếu nại nhà cung cấp', parts: (b.codes || []).join(', '), photos: [...(b.photos || [])], fromNote: n.id, severity: 2 });
    b.backlogId = nb.id; touch(n); renderBlocks(v, n); toast('Đã tạo tồn đọng – xem ở tab Nhật ký');
  };
}
// ---------- đọc tem vật tư: lấy mã + tên ----------
function readLabel(v, n, b) {
  const has = (b.photos || []).length;
  openSheet('Đọc tem vật tư', `<p class="muted" style="margin:0 0 10px;font-size:13.5px">Chụp gần, thẳng, rõ chữ, tránh lóa nilon. App lấy <b>mã vật tư</b> và <b>tên vật tư</b> trên tem.</p>
    <button class="menu-item" data-k="cam">${ic('camera')}<span>Chụp tem</span></button>
    <button class="menu-item" data-k="lib">${ic('grid')}<span>Chọn ảnh tem trong thư viện</span></button>
    ${has ? `<button class="menu-item" data-k="have">${ic('scan')}<span>Đọc từ ảnh đã có trong mục này</span></button>` : ''}`, (body, close) => {
    body.querySelectorAll('[data-k]').forEach(x => x.onclick = () => { close(); setTimeout(() => runOcr(v, n, b, x.dataset.k), 250); });
  });
}
async function runOcr(v, n, b, kind) {
  let paths = [];
  try { paths = kind === 'cam' ? await capturePhotos(null, 1) : kind === 'lib' ? await pickPhotos(null, 1) : [...(b.photos || [])].reverse(); }
  catch (e) { paths = []; }
  if (!paths.length) return;
  if (kind !== 'have') { b.photos = [...(b.photos || []), paths[0]]; touch(n); renderBlocks(v, n); }
  const bz = busy('Đang đọc chữ trên tem…'); let best = null;
  try {
    for (const p of paths.slice(0, 6)) {
      const r = await ocrPhoto(p); const pr = parseLabel(r.text);
      if (!best || (pr.code && !best.code)) best = { ...pr, raw: r.text };
      if (pr.code) break;
    }
  } catch (e) { bz.done(); toast('Không đọc được chữ trên ảnh: ' + (e.message || e), 3500); return; }
  bz.done();
  const r = best || { code: '', name: '', raw: '' };
  openSheet('Kết quả đọc tem', `
    ${r.code ? '' : `<div class="card" style="border-color:var(--p2);color:var(--p2t);font-size:13.5px;margin-bottom:12px">${ic('alert')} Không nhận ra mã vật tư. Sửa tay bên dưới, hoặc chụp lại gần hơn, thẳng hơn.</div>`}
    <div class="field"><label class="lb">Mã vật tư</label><input class="inp" id="oC" value="${esc(r.code)}" inputmode="numeric" style="font-family:ui-monospace,monospace;font-weight:700"></div>
    <div class="field"><label class="lb">Tên vật tư</label><textarea class="inp" id="oN" rows="2">${esc(r.name)}</textarea></div>
    ${r.raw ? `<details class="ocr-raw"><summary>Chữ đọc được trên tem</summary><pre>${esc(r.raw)}</pre></details>` : ''}
    <button class="btn pri" id="oOk">${ic('check')} Điền vào</button>`, (body, close) => {
    body.querySelector('#oOk').onclick = () => {
      const code = body.querySelector('#oC').value.trim(); const name = body.querySelector('#oN').value.replace(/\s+/g, ' ').trim();
      if (code && !(b.codes || []).includes(code)) b.codes = [...(b.codes || []), code];
      if (name) b.name = name;
      touch(n); close(); renderBlocks(v, n); toast(code || name ? 'Đã điền mã và tên vật tư' : 'Không có gì để điền');
    };
  });
}

async function addPhoto(v, n, b) {
  await addPhotos(p => { b.photos.push(p); touch(n); renderBlocks(v, n); });
}
function blockMenu(v, n, b) {
  const i = n.blocks.indexOf(b);
  const items = [];
  if (i > 0) items.push({ icon: 'back', label: 'Chuyển lên trên', run: () => { n.blocks.splice(i, 1); n.blocks.splice(i - 1, 0, b); touch(n); renderBlocks(v, n); } });
  if (i < n.blocks.length - 1) items.push({ icon: 'chev', label: 'Chuyển xuống dưới', run: () => { n.blocks.splice(i, 1); n.blocks.splice(i + 1, 0, b); touch(n); renderBlocks(v, n); } });
  if (b.t === 'img' && b.locked) { items.push({ icon: 'lock', label: 'Mở khóa để sửa', run: () => { b.locked = false; touch(n); renderBlocks(v, n); } }); menu('Khối ảnh vật tư (đã khóa)', items); return; }
  if (b.t !== 'img') for (const [t, l] of [['h', 'Đổi thành Tiêu đề mục'], ['p', 'Đổi thành Đoạn văn'], ['li', 'Đổi thành Gạch đầu dòng'], ['chk', 'Đổi thành Checklist']]) if (t !== b.t) items.push({ icon: 'edit', label: l, run: () => { b.t = t; touch(n); renderBlocks(v, n); } });
  items.push({ icon: 'trash', label: b.t === 'img' ? 'Xóa khối ảnh này' : 'Xóa dòng này', danger: true, run: async () => {
    if (b.t === 'img' && b.photos?.length && !await confirmBox('Xóa khối ảnh?', `${b.photos.length} ảnh, mã và chú thích trong khối sẽ bị xóa.`, 'Xóa', true)) return;
    n.blocks.splice(n.blocks.indexOf(b), 1); if (!n.blocks.length) n.blocks.push({ id: uid(), t: 'p', text: '' });
    if (b.t === 'img') (b.photos || []).forEach(p => { if (!pathInUse(p)) deletePath(p); });
    touch(n); renderBlocks(v, n);
  } });
  menu(b.t === 'img' ? 'Khối ảnh vật tư' : 'Dòng', items);
}

function metaAction(n, k) {
  if (k === 'cat') menu('Chọn mục', S.state.noteCats.map(c => ({ icon: n.cat === c.id ? 'check' : 'tag', label: c.name, run: () => { n.cat = c.id; touch(n); nav.render(); } })));
  else if (k === 'dev') menu('Gắn thiết bị', [{ icon: 'x', label: 'Không gắn thiết bị', run: () => { n.deviceId = ''; touch(n); nav.render(); } },
    ...S.state.devices.map(d => ({ icon: n.deviceId === d.id ? 'check' : 'device', label: d.name, run: () => { n.deviceId = d.id; touch(n); nav.render(); } }))]);
  else if (k === 'pin') { n.pinned = !n.pinned; touch(n); nav.render(); }
  else if (k === 'qa') qaForm(n);
}
function qaForm(n) {
  const isNewQa = !n.qa; const q0 = n.qa || { po: '', supplier: '', inspector: S.state.settings.name || '', date: today() };
  const sups = [...new Set(S.state.notes.map(x => x.qa?.supplier).filter(Boolean))];
  openSheet('Thông tin phiếu QA', `
    <div class="field"><label class="lb">Số biên bản</label><input class="inp" id="qNo" value="${esc(q0.no || '')}" placeholder="Để trống – app tự đánh số khi xuất (${tpl().qaPrefix}${today().slice(0, 4)}-…)"></div>
    <div class="field"><label class="lb">Số PO / phiếu nhập</label><input class="inp" id="qPo" value="${esc(q0.po)}" placeholder="VD: PO-2026-0915"></div>
    <div class="field"><label class="lb">Nhà cung cấp</label><input class="inp" id="qSu" list="qSuL" value="${esc(q0.supplier)}"><datalist id="qSuL">${sups.map(s => `<option value="${esc(s)}">`).join('')}</datalist></div>
    <div class="field"><label class="lb">Người kiểm tra</label><input class="inp" id="qIn" value="${esc(q0.inspector)}"></div>
    <div class="field"><label class="lb">Ngày kiểm tra</label><input type="date" class="inp" id="qDa" value="${q0.date}"></div>
    <button class="btn pri" id="qS">${ic('check')} Lưu</button>${n.qa ? `<button class="btn dan" id="qD">${ic('trash')} Bỏ thông tin QA</button>` : ''}`, (b, close) => {
    b.querySelector('#qS').onclick = () => { n.qa = { no: b.querySelector('#qNo').value.trim(), po: b.querySelector('#qPo').value.trim(), supplier: b.querySelector('#qSu').value.trim(), inspector: b.querySelector('#qIn').value.trim(), date: b.querySelector('#qDa').value };
      if (isNewQa && S.state.noteCats.some(c => c.id === 'qa')) n.cat = 'qa'; touch(n); close(); nav.render(); };
    const d = b.querySelector('#qD'); if (d) d.onclick = () => { n.qa = null; touch(n); close(); nav.render(); };
  });
}
export function noteMenu(id) {
  const n = note(id); if (!n) return;
  menu(n.title || 'Ghi chú', [
    { icon: 'file', label: isQA(n) ? 'Xuất biên bản PDF' : 'Xuất PDF', run: () => runExport([n], 'pdf') },
    { icon: 'file', label: 'Xuất Word (.docx)', run: () => runExport([n], 'docx') },
    { icon: 'file', label: 'Xuất Excel (.xlsx)', run: () => runExport([n], 'xlsx') },
    { icon: 'trash', label: 'Xóa ghi chú', danger: true, run: async () => {
      if (!await confirmBox('Xóa ghi chú?', `“${esc(n.title || 'Ghi chú không tên')}” và ảnh trong đó sẽ bị xóa.`, 'Xóa', true)) return;
      S.state.notes = S.state.notes.filter(x => x !== n);
      n.blocks.forEach(b => (b.photos || []).forEach(p => { if (!pathInUse(p)) deletePath(p); })); save(); pop(); toast('Đã xóa ghi chú');
    } },
  ]);
}
function exportMenu(list, name) { menu(`Xuất ${list.length} ghi chú`, [{ icon: 'file', label: 'Xuất PDF', run: () => runExport(list, 'pdf', name) }, { icon: 'file', label: 'Xuất Word (.docx)', run: () => runExport(list, 'docx', name) }, { icon: 'file', label: 'Xuất Excel (.xlsx)', run: () => runExport(list, 'xlsx', name) }]); }

// ---------------- dựng biên bản / báo cáo để xuất file ----------------
const RESULT_TXT = { ok: 'Đạt', ng: 'Không đạt', chk: 'Cần xem lại' };
const dmy = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '';
const isQA = n => !!n.qa || n.blocks.some(b => b.t === 'img' && b.qa);
function qaNo(n) {
  if (!n.qa) n.qa = { po: '', supplier: '', inspector: S.state.settings.name || '', date: n.updated.slice(0, 10) };
  if (!n.qa.no) {
    const y = (n.qa.date || today()).slice(0, 4); const st = S.state.settings; st.qaSeq = st.qaSeq || {};
    st.qaSeq[y] = (st.qaSeq[y] || 0) + 1; n.qa.no = `${tpl().qaPrefix}${y}-${String(st.qaSeq[y]).padStart(3, '0')}`; save();
  }
  return n.qa.no;
}
function textItems(n, multi) {
  const out = [];
  for (const b of n.blocks) {
    if (b.t === 'img' || !(b.text || '').trim()) continue;
    if (b.t === 'h') out.push({ subh: b.text }); else if (b.t === 'p') out.push({ p: b.text });
    else if (b.t === 'li') out.push({ li: b.text }); else if (b.t === 'chk') out.push({ chk: b.text, done: b.done });
  }
  return out;
}
function cardsOf(n) { let no = 0; return n.blocks.filter(b => b.t === 'img').map(b => ({ no: ++no, title: `Mục ${no}`, codes: b.codes || [], name: b.name || '', qty: b.qty, result: b.qa, caption: b.caption, paths: b.photos || [] })); }
function buildDocs(list, groupName) {
  const st = S.state.settings; const org = st.org || ''; const dept = st.dept || '';
  if (list.length === 1 && isQA(list[0])) {
    const n = list[0]; const no = qaNo(n); const q = n.qa; const dev = device(n.deviceId);
    const imgs = n.blocks.filter(b => b.t === 'img'); const cnt = k => imgs.filter(b => b.qa === k).length;
    const verdict = cnt('ng') ? 'KHÔNG ĐẠT (có mục không đạt)' : cnt('chk') ? 'CẦN XEM LẠI' : imgs.length ? 'ĐẠT' : '—';
    const T = tpl();
    const info = [[T.qaLblPo, q.po || '—'], [T.qaLblSup, q.supplier || '—'], [T.qaLblDate, q.date ? fmtD(q.date) : '—'], [T.qaLblIns, q.inspector || '—'],
      [T.qaLblDev, dev ? dev.name + (dev.location ? ' · ' + dev.location : '') : '—'], [T.qaLblRes, `${verdict} · ${imgs.length} mục: ${cnt('ok')} đạt, ${cnt('ng')} không đạt, ${cnt('chk')} cần xem lại`]];
    const rows = imgs.map((b, i) => [String(i + 1), (b.codes || []).join('\n') || '—', b.name || '', b.caption || '', b.qty || '', String((b.photos || []).length), b.qa ? { t: RESULT_TXT[b.qa], result: b.qa } : '—']);
    const texts = textItems(n);
    const doc = { org, dept, label: T.qaLabel, title: T.qaTitle, subtitle: n.title || '', docNo: no, dateText: 'Ngày ' + dmy(q.date || today()),
      fileBase: `BienBanQA_${no}_${dmy(q.date || today()).replace(/\//g, '-')}`, info,
      sections: [
        { heading: T.qaSec1, items: [imgs.length ? { table: { cols: ['STT', 'Mã vật tư', 'Tên vật tư', 'Chú thích', 'SL', 'Số ảnh', 'Kết quả'], widths: [7, 16, 25, 24, 6, 8, 14], rows } } : { p: 'Chưa có mục vật tư nào.' }] },
        ...(imgs.length ? [{ heading: T.qaSec2, items: cardsOf(n).map(c => ({ card: c })) }] : []),
        ...(texts.length ? [{ heading: T.qaSec3, items: texts }] : []),
      ],
      signers: signersOf(T.qaSigners, q.inspector) };
    const sheets = [{ name: 'Bien ban QA', title: T.qaTitle, info,
      cols: [{ h: 'STT', w: 6, center: true, num: true }, { h: 'Mã vật tư', w: 18 }, { h: 'Tên vật tư', w: 34 }, { h: 'Chú thích', w: 30 }, { h: 'SL', w: 7, center: true }, { h: 'Kết quả', w: 14, center: true }],
      rows: imgs.map((b, i) => [String(i + 1), (b.codes || []).join('\n'), b.name || '', b.caption || '', b.qty || '', b.qa ? { t: RESULT_TXT[b.qa], result: b.qa } : '']), photos: imgs.map(b => b.photos || []), landscape: true }];
    return { doc, sheets };
  }
  // ghi chú thường (1 hoặc nhiều)
  const multi = list.length > 1; const one = list[0]; const c = cat(one.cat);
  const sections = list.map((n, i) => {
    const dev = device(n.deviceId); const items = [];
    if (multi) items.push({ p: [`Cập nhật ${fmtD(n.updated.slice(0, 10))}`, dev ? 'Thiết bị: ' + dev.name : '', n.qa?.po ? 'PO: ' + n.qa.po : ''].filter(Boolean).join('  ·  ') });
    let no = 0;
    for (const b of n.blocks) {
      if (b.t === 'img') { no++; items.push({ card: { no: multi ? `${i + 1}.${no}` : no, title: `Hình ${multi ? `${i + 1}.${no}` : no}`, codes: b.codes || [], name: b.name || '', qty: b.qty, result: b.qa, caption: b.caption, paths: b.photos || [] } }); }
      else if ((b.text || '').trim()) items.push(b.t === 'h' ? { subh: b.text } : b.t === 'p' ? { p: b.text } : b.t === 'li' ? { li: b.text } : { chk: b.text, done: b.done });
    }
    return { heading: multi ? `${i + 1}. ${(n.title || 'Ghi chú không tên').toUpperCase()}` : '', items };
  });
  const dev = device(one.deviceId);
  const doc = { org, dept, label: multi ? 'TỔNG HỢP GHI CHÚ' : ((c?.name || 'Ghi chú') + '').toUpperCase(), title: multi ? `GHI CHÚ – ${(groupName || 'TỔNG HỢP').toUpperCase()}` : (one.title || 'Ghi chú'),
    subtitle: multi ? `${list.length} ghi chú` : '', docNo: '', dateText: 'Ngày ' + dmy(today()),
    fileBase: multi ? `GhiChu_${groupName || 'TongHop'}_${dmy(today()).replace(/\//g, '-')}` : `GhiChu_${one.title || 'ghi-chu'}`,
    info: multi ? [['Mục', groupName || '—'], ['Số ghi chú', String(list.length)], ['Người lập', st.name || '—'], ['Ngày xuất', fmtD(today())]]
      : [['Mục', c?.name || '—'], ['Thiết bị', dev ? dev.name : '—'], ['Người lập', st.name || '—'], ['Cập nhật', fmtD(one.updated.slice(0, 10))]],
    sections, signers: signersOf(tpl().noteSigners, st.name) };
  const rows = [], photos = [];
  list.forEach((n, i) => { let no = 0; n.blocks.forEach(b => {
    if (b.t === 'img') { no++; rows.push([String(rows.length + 1), multi ? n.title || '' : '', 'Ảnh ' + no, [(b.codes || []).join(', '), b.name, b.caption].filter(Boolean).join(' – '), b.qty || '', b.qa ? { t: RESULT_TXT[b.qa], result: b.qa } : '']); photos.push(b.photos || []); }
    else if ((b.text || '').trim()) { rows.push([String(rows.length + 1), multi ? n.title || '' : '', { h: 'Tiêu đề', p: 'Đoạn', li: 'Gạch đầu dòng', chk: b.done ? 'Việc – đã xong' : 'Việc' }[b.t], b.text, '', '']); photos.push([]); }
  }); });
  const cols = [{ h: 'STT', w: 6, center: true, num: true }, { h: 'Ghi chú', w: multi ? 26 : 4 }, { h: 'Loại', w: 13 }, { h: 'Nội dung / mã vật tư', w: 48 }, { h: 'SL', w: 7, center: true }, { h: 'Kết quả', w: 13, center: true }];
  const sheets = [{ name: 'Ghi chu', title: doc.title, info: doc.info, cols, rows, photos, landscape: true }];
  return { doc, sheets };
}
async function runExport(list, kind, groupName) {
  const { doc, sheets } = buildDocs(list, groupName);
  const bz = busy('Đang tạo file…');
  try {
    const step = (i, t) => bz.set(`Đang xử lý ảnh ${i}/${t}…`);
    if (kind === 'pdf') await exportPdf(doc, step); else if (kind === 'docx') await exportDocx(doc, step); else await exportXlsx(doc, sheets, step);
  } catch (e) { if (!String(e).match(/cancel/i)) toast('Lỗi xuất file: ' + (e.message || e)); console.error(e); }
  finally { bz.done(); }
}
export { runExport as exportNotes };

export function cleanupNote(id) {
  const n = note(id); if (!n) return;
  lockDone(n); // rời ghi chú → khóa các mục ảnh đã nhập
  const empty = !n.title.trim() && !n.qa && n.blocks.every(b => b.t === 'img' ? !(b.photos || []).length && !(b.codes || []).length && !b.caption && !b.name : !(b.text || '').trim());
  if (empty) { S.state.notes = S.state.notes.filter(x => x !== n); save(); }
}
