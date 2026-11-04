// Trình soạn ghi chú: chế độ Xem (bấm tick checklist) và chế độ Sửa (thanh công cụ nhanh)
import { S, note, touch, tagsOf, progress, allTags, addPhotoBlob, delPhoto, photoUrl, isEmpty, purgeNote } from './store.js';
import { nav, pop, home } from './nav.js';
import { F, setF } from './filter.js';
import { STATUS } from './templates.js';
import { statusMenu, trashNote, duplicate, shareNote, saveAsTemplate, noteText } from './actions.js';
import { openSheet, menu, toast, viewPhotos, busy } from './ui.js';
import { takePhoto, pickPhotos } from './platform.js';
import { $, $$, esc, highlight, dayLabel, fullTime, today, addDays, hm, normTag, TAG_RE, CHK_RE, isChecked } from './util.js';
import { ic } from './icons.js';

const modeOf = {}; // id → 'edit' | 'view'

export function viewNote(v, r) {
  const n = note(r.id); if (!n || n.deleted) { pop(); return; }
  if (!modeOf[n.id]) modeOf[n.id] = r.edit || isEmpty(n) ? 'edit' : 'view';
  const mode = modeOf[n.id]; const st = STATUS[n.status];
  document.body.classList.toggle('editing', true);
  v.innerHTML = `<div class="editor">
    <input class="ed-title" id="eT" placeholder="Tiêu đề" value="${esc(n.title)}" autocomplete="off" enterkeyhint="next">
    <div class="ed-meta">
      <button class="mchip ${st ? st.cls : ''}" data-m="status">${ic('status')}${st ? st.label : 'Trạng thái'}</button>
      <button class="mchip" data-m="date">${ic('cal')}${dayLabel(n.date)}</button>
      <button class="mchip ${n.pinned ? 'on' : ''}" data-m="pin">${ic('pin')}${n.pinned ? 'Đã ghim' : 'Ghim'}</button>
    </div>
    <div class="ed-tags" id="eTags"></div>
    <div id="eBody"></div>
    <div class="ed-photos" id="ePh"></div>
    <div class="ed-foot">Tạo ${fullTime(n.created)} · sửa ${fullTime(n.updated)}</div>
  </div>
  <div class="tag-sug" id="tSug" hidden></div>
  <div class="ed-bar ${mode}" id="eBar">${mode === 'edit' ? `
    <button data-b="chk">${ic('checkbox')}<span>Việc</span></button>
    <button data-b="li">${ic('bullet')}<span>Dòng</span></button>
    <button data-b="h">${ic('heading')}<span>Mục</span></button>
    <button data-b="tag">${ic('hash')}<span>Thẻ</span></button>
    <button data-b="time">${ic('clock')}<span>Giờ</span></button>
    <button data-b="photo">${ic('camera')}<span>Ảnh</span></button>
    <button data-b="view" class="pri">${ic('check')}<span>Xong</span></button>` : `
    <button data-b="edit">${ic('edit')}<span>Sửa</span></button>
    <button data-b="photo">${ic('camera')}<span>Ảnh</span></button>
    <button data-b="share">${ic('share')}<span>Gửi</span></button>
    <button data-b="done" class="${n.status === 'done' ? 'on' : ''}">${ic('check')}<span>${n.status === 'done' ? 'Đã xong' : 'Xong việc'}</span></button>`}
  </div>`;
  const ti = $('#eT', v);
  ti.oninput = () => { n.title = ti.value; touch(n); };
  ti.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); if (modeOf[n.id] !== 'edit') { modeOf[n.id] = 'edit'; nav.render(); } setTimeout(() => focusBody(0), 30); } };
  $$('[data-m]', v).forEach(b => b.onclick = () => meta(n, b.dataset.m));
  drawTags(v, n); drawPhotos(v, n);
  if (mode === 'edit') drawEdit(v, n, r); else drawView(v, n);
  $$('[data-b]', $('#eBar', v)).forEach(b => { b.onmousedown = e => e.preventDefault(); b.onclick = () => bar(v, n, b.dataset.b); });
  if (r.fresh) { r.fresh = false; setTimeout(() => { if (!n.title || n.body) focusBody(firstBlank(n.body)); else ti.focus(); }, 220); }
}
export function leaveNote(id) {
  const n = note(id); delete modeOf[id]; document.body.classList.remove('editing');
  if (n && isEmpty(n)) purgeNote(n);
}
export function noteMenu(id) {
  const n = note(id); if (!n) return;
  menu(n.title || 'Ghi chú', [
    { icon: 'share', label: 'Gửi / chia sẻ nội dung', run: () => shareNote(n) },
    { icon: 'copy', label: 'Chép nội dung', run: async () => { try { await navigator.clipboard.writeText(noteText(n)); toast('Đã chép'); } catch (e) { toast('Không chép được'); } } },
    { icon: 'layers', label: 'Lưu làm mẫu', run: () => saveAsTemplate(n) },
    { icon: 'copy', label: 'Nhân bản ghi chú', run: () => { const c = duplicate(n); nav.stack[nav.stack.length - 1] = { v: 'note', id: c.id }; nav.render(); } },
    { icon: 'trash', label: 'Xóa ghi chú', danger: true, run: () => trashNote(n, () => pop()) },
  ]);
}

// vị trí con trỏ hợp lý khi mở ghi chú từ mẫu: sau dấu ":" trống đầu tiên, hoặc cuối bài
function firstBlank(body) {
  const m = /: ?(\n|$)/.exec(body); if (m) return m.index + (body[m.index + 1] === ' ' ? 2 : 1);
  const c = /☐ ?(\n|$)/.exec(body); if (c) return c.index + 2;
  return body.length;
}
function focusBody(pos) {
  const ta = $('#eTa'); if (!ta) return;
  ta.focus(); const p = Math.min(pos ?? ta.value.length, ta.value.length); ta.setSelectionRange(p, p);
  setTimeout(() => ta.scrollIntoView && caretIntoView(ta), 80);
}
function caretIntoView(ta) {
  const v = $('#view'); const before = ta.value.slice(0, ta.selectionStart).split('\n').length;
  const lh = parseFloat(getComputedStyle(ta).lineHeight) || 22; const y = ta.offsetTop + before * lh;
  if (y > v.scrollTop + v.clientHeight - 140 || y < v.scrollTop + 40) v.scrollTop = y - v.clientHeight / 2;
}

// ---------- thẻ ----------
function drawTags(v, n) {
  const box = $('#eTags', v); const auto = tagsOf(n).filter(t => !n.tags.includes(t));
  box.innerHTML = n.tags.map(t => `<span class="etag">#${esc(t)}<button data-rm="${esc(t)}" aria-label="Bỏ thẻ">${ic('x', 2.6)}</button></span>`).join('') +
    auto.map(t => `<span class="etag auto" title="Thẻ viết trong nội dung">#${esc(t)}</span>`).join('') +
    `<button class="etag add" data-add>${ic('plus')}Thẻ</button>`;
  $$('[data-rm]', box).forEach(b => b.onclick = () => { n.tags = n.tags.filter(t => t !== b.dataset.rm); touch(n); drawTags(v, n); });
  box.querySelector('[data-add]').onclick = () => tagSheet(v, n);
}
function tagSheet(v, n) {
  const draw = (b, q = '') => {
    const nq = normTag(q); const have = tagsOf(n);
    const list = allTags().map(x => x[0]).filter(t => !nq || t.includes(nq));
    b.querySelector('#tl').innerHTML = (nq && !list.includes(nq) ? `<button class="tchip new" data-t="${esc(nq)}">${ic('plus')}Tạo #${esc(nq)}</button>` : '') +
      list.map(t => `<button class="tchip ${have.includes(t) ? 'on' : ''}" data-t="${esc(t)}">#${esc(t)}</button>`).join('') || '<p class="help">Gõ tên thẻ mới ở trên.</p>';
    $$('[data-t]', b).forEach(x => x.onclick = () => {
      const t = x.dataset.t;
      if (n.tags.includes(t)) n.tags = n.tags.filter(z => z !== t);
      else if (!have.includes(t)) n.tags.push(t);
      else { toast('Thẻ này đang viết trong nội dung'); return; }
      touch(n); drawTags(v, n); const i = b.querySelector('#tq'); i.value = ''; draw(b); i.focus();
    });
  };
  openSheet('Gắn thẻ', `<input class="inp" id="tq" placeholder="Tìm hoặc tạo thẻ mới (VD: máy-ép-2)" autocomplete="off" enterkeyhint="done"><div class="chips wrap" id="tl" style="margin-top:12px"></div>
    <p class="help">Mẹo: gõ <b>#thẻ</b> ngay trong nội dung cũng tự gắn thẻ.</p>`, b => {
    const i = b.querySelector('#tq'); draw(b);
    i.oninput = () => draw(b, i.value);
    i.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const t = normTag(i.value); if (t && !tagsOf(n).includes(t)) { n.tags.push(t); touch(n); drawTags(v, n); } i.value = ''; draw(b); } };
  });
}

// ---------- ảnh ----------
async function drawPhotos(v, n) {
  const box = $('#ePh', v); const ps = n.photos || [];
  box.innerHTML = ps.map((p, i) => `<button class="ph" data-i="${i}"><img data-ph="${p}" alt="Ảnh ${i + 1}"></button>`).join('');
  box.hidden = !ps.length;
  for (const im of $$('img[data-ph]', box)) im.src = await photoUrl(im.dataset.ph);
  $$('[data-i]', box).forEach(b => b.onclick = async () => {
    const urls = await Promise.all(ps.map(photoUrl));
    viewPhotos(urls, +b.dataset.i, [{ icon: 'trash', label: 'Xóa ảnh', run: async i => { const id = n.photos.splice(i, 1)[0]; touch(n); await delPhoto(id); drawPhotos(v, n); toast('Đã xóa ảnh'); } }]);
  });
}
function photoMenu(v, n) {
  const add = async blobs => {
    if (!blobs.length) return; const bz = busy('Đang lưu ảnh…');
    try { for (const bl of blobs) n.photos.push(await addPhotoBlob(bl)); touch(n); } finally { bz.done(); }
    drawPhotos(v, n); setTimeout(() => { const p = $('#ePh'); p && p.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 100);
  };
  menu('Thêm ảnh', [
    { icon: 'camera', label: 'Chụp ảnh', run: async () => add(await takePhoto()) },
    { icon: 'image', label: 'Chọn từ thư viện', run: async () => add(await pickPhotos()) },
  ]);
}

// ---------- trạng thái, ngày, ghim ----------
function meta(n, k) {
  const r = () => nav.render();
  if (k === 'status') statusMenu(n, r);
  else if (k === 'pin') { n.pinned = !n.pinned; touch(n, true); r(); }
  else if (k === 'date') {
    openSheet('Ngày công việc', `<div class="chips wrap">
      <button class="chip" data-d="${today()}">Hôm nay</button><button class="chip" data-d="${addDays(today(), -1)}">Hôm qua</button><button class="chip" data-d="${addDays(today(), 1)}">Ngày mai</button></div>
      <label class="field" style="margin-top:14px"><span class="lb">Hoặc chọn ngày</span><input type="date" class="inp" id="dIn" value="${n.date}"></label>
      <p class="help">Ngày công việc dùng để lọc theo thời gian và xếp nhóm trong Dòng thời gian.</p>`, (b, close) => {
      $$('[data-d]', b).forEach(x => x.onclick = () => { n.date = x.dataset.d; touch(n); close(); r(); });
      b.querySelector('#dIn').onchange = e => { if (e.target.value) { n.date = e.target.value; touch(n); close(); r(); } };
    });
  }
}

// ---------- chế độ Xem ----------
function inline(text) {
  // tách #thẻ để bấm được; phần chữ còn lại tô sáng từ khóa đang tìm
  let out = '', last = 0, m; TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(text))) {
    const s = m.index + m[1].length; out += highlight(text.slice(last, s), F.q);
    const t = normTag(m[2]); out += `<button class="tg" data-tag="${esc(t)}">#${esc(m[2])}</button>`; last = s + 1 + m[2].length;
  }
  return out + highlight(text.slice(last), F.q);
}
function drawView(v, n) {
  const box = $('#eBody', v); const lines = n.body.split('\n');
  const p = progress(n);
  let html = p.total ? `<div class="v-prog"><span class="prog ${p.done === p.total ? 'full' : ''}"><i style="width:${Math.round(p.done / p.total * 100)}%"></i></span><b>${p.done}/${p.total}</b> việc đã xong</div>` : '';
  html += lines.map((l, i) => {
    const c = l.match(CHK_RE);
    if (c) { const on = isChecked(c[2]); return `<div class="v-chk ${on ? 'on' : ''}" data-l="${i}" style="padding-left:${c[1].length * 8}px"><button class="cbx" data-tick="${i}" aria-label="Đánh dấu">${ic('check', 3)}</button><span>${inline(l.slice(c[0].length)) || '&nbsp;'}</span></div>`; }
    if (/^##\s?/.test(l)) return `<h5 data-l="${i}">${inline(l.replace(/^##\s?/, ''))}</h5>`;
    const b = l.match(/^(\s*)[-•*]\s+/);
    if (b) return `<div class="v-li" data-l="${i}" style="padding-left:${14 + b[1].length * 8}px">${inline(l.slice(b[0].length))}</div>`;
    if (!l.trim()) return `<div class="v-sp" data-l="${i}"></div>`;
    return `<p data-l="${i}">${inline(l)}</p>`;
  }).join('');
  box.innerHTML = `<div class="v-body">${n.body.trim() ? html : '<p class="muted">Chạm để viết nội dung…</p>'}</div>`;
  box.querySelector('.v-body').onclick = e => {
    const tk = e.target.closest('[data-tick]');
    if (tk) { toggleLine(n, +tk.dataset.tick); drawView(v, n); return; }
    const tg = e.target.closest('[data-tag]');
    if (tg) { setF({ tags: [tg.dataset.tag] }); home(); return; }
    const ln = e.target.closest('[data-l]'); const i = ln ? +ln.dataset.l : lines.length - 1;
    const pos = lines.slice(0, i + 1).join('\n').length;
    modeOf[n.id] = 'edit'; nav.render(); setTimeout(() => focusBody(pos), 30);
  };
}
function toggleLine(n, i) {
  const ls = n.body.split('\n'); const m = ls[i].match(CHK_RE); if (!m) return;
  ls[i] = m[1] + (isChecked(m[2]) ? '☐ ' : '☑ ') + ls[i].slice(m[0].length);
  n.body = ls.join('\n'); touch(n);
  const p = progress(n);
  if (p.total && p.done === p.total && n.status && n.status !== 'done') toast('Đã tick hết – đánh dấu xong?', { label: 'Xong', run: () => { n.status = 'done'; touch(n); nav.render(); } });
}

// ---------- chế độ Sửa ----------
function drawEdit(v, n) {
  const box = $('#eBody', v);
  box.innerHTML = `<textarea id="eTa" class="ed-ta" placeholder="Nội dung… &#10;Mẹo: dùng thanh dưới để thêm ☐ việc cần làm, #thẻ, giờ ghi." spellcheck="false">${esc(n.body)}</textarea>`;
  const ta = $('#eTa', box); let prevLen = ta.value.length;
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.max(ta.scrollHeight, 160) + 'px'; };
  requestAnimationFrame(grow);
  ta.addEventListener('input', () => {
    const c = ta.selectionStart;
    if (ta.value.length === prevLen + 1 && ta.value[c - 1] === '\n') continueList(ta, c);
    n.body = ta.value; prevLen = ta.value.length; touch(n); grow(); tagSuggest(v, n, ta);
  });
  ta.addEventListener('keyup', () => tagSuggest(v, n, ta));
  ta.addEventListener('click', () => tagSuggest(v, n, ta));
  ta.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== ta) $('#tSug') && ($('#tSug').hidden = true); }, 150));
  ta._sync = () => { n.body = ta.value; prevLen = ta.value.length; touch(n); grow(); };
}
// Xuống dòng trong danh sách → tự thêm ☐ / - / số / [giờ] cho dòng mới; dòng trống thì thoát danh sách
function continueList(ta, c) {
  const v = ta.value; const ls = v.lastIndexOf('\n', c - 2) + 1; const prev = v.slice(ls, c - 1);
  let m, pre = null;
  if ((m = prev.match(CHK_RE))) pre = [m[0], m[1] + '☐ '];
  else if ((m = prev.match(/^(\s*)([-•*])\s+/))) pre = [m[0], m[0]];
  else if ((m = prev.match(/^(\s*)(\d+)([.)])\s+/))) pre = [m[0], `${m[1]}${+m[2] + 1}${m[3]} `];
  else if ((m = prev.match(/^\[\d{1,2}:\d{2}\]\s?/))) pre = [m[0], `[${hm()}] `];
  if (!pre) return;
  if (!prev.slice(pre[0].length).trim()) { ta.setSelectionRange(ls, c); insert(ta, ''); return; } // dòng chỉ có ký hiệu → bỏ
  insert(ta, pre[1]);
}
function insert(ta, text) {
  ta.focus();
  // execCommand giữ được lịch sử Hoàn tác của bàn phím; không được thì ghi thẳng
  let ok = false;
  try { ok = text ? document.execCommand('insertText', false, text) : (ta.selectionStart === ta.selectionEnd || document.execCommand('delete')); } catch (e) { ok = false; }
  if (!ok) ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
}
function lineRange(ta) { const v = ta.value, c = ta.selectionStart; const s = v.lastIndexOf('\n', c - 1) + 1; let e = v.indexOf('\n', c); if (e < 0) e = v.length; return [s, e]; }
function setPrefix(ta, kind) {
  const [s, e] = lineRange(ta); const line = ta.value.slice(s, e);
  const ind = line.match(/^\s*/)[0];
  const rest = line.slice(ind.length).replace(/^(?:[-*]\s+)?(?:☐|☑|\[ \]|\[[xX]\])\s?/, '').replace(/^[-•*]\s+/, '').replace(/^##\s?/, '');
  const had = kind === 'chk' ? CHK_RE.test(line) : kind === 'li' ? /^\s*[-•*]\s+/.test(line) && !CHK_RE.test(line) : /^##\s?/.test(line.trim());
  const pre = had ? '' : { chk: '☐ ', li: '- ', h: '## ' }[kind];
  const nl = (kind === 'h' ? '' : ind) + pre + rest;
  ta.setSelectionRange(s, e); insert(ta, nl);
  const p = s + nl.length; ta.setSelectionRange(p, p);
}
function bar(v, n, k) {
  const ta = $('#eTa');
  if (k === 'edit') { modeOf[n.id] = 'edit'; nav.render(); setTimeout(() => focusBody(), 30); return; }
  if (k === 'view') { if (ta) n.body = ta.value; touch(n); modeOf[n.id] = 'view'; nav.render(); return; }
  if (k === 'photo') { photoMenu(v, n); return; }
  if (k === 'share') { shareNote(n); return; }
  if (k === 'done') { n.status = n.status === 'done' ? '' : 'done'; touch(n); nav.render(); if (n.status === 'done') toast('Đã xong ✔'); return; }
  if (!ta) return;
  if (document.activeElement !== ta) { ta.focus(); }
  if (k === 'chk' || k === 'li' || k === 'h') setPrefix(ta, k);
  else if (k === 'tag') { const c = ta.selectionStart; const before = ta.value[c - 1]; insert(ta, (c && before && !/\s/.test(before) ? ' ' : '') + '#'); }
  else if (k === 'time') { const c = ta.selectionStart; const atStart = c === 0 || ta.value[c - 1] === '\n'; insert(ta, (atStart ? '' : '\n') + `[${hm()}] `); }
  ta._sync(); tagSuggest(v, n, ta);
}
// gợi ý thẻ khi đang gõ "#..."
function tagSuggest(v, n, ta) {
  const sg = $('#tSug'); if (!sg) return;
  const before = ta.value.slice(0, ta.selectionStart); const m = before.match(/(^|[\s(,;])#([\p{L}\p{N}_\-./]*)$/u);
  if (!m) { sg.hidden = true; return; }
  const q = normTag(m[2]); const list = allTags().map(x => x[0]).filter(t => t !== q && (!q || t.startsWith(q) || t.includes(q))).slice(0, 8);
  if (!list.length) { sg.hidden = true; return; }
  sg.hidden = false;
  sg.innerHTML = list.map(t => `<button data-s="${esc(t)}">#${esc(t)}</button>`).join('');
  $$('[data-s]', sg).forEach(b => { b.onmousedown = e => e.preventDefault(); b.onclick = () => {
    const c = ta.selectionStart; ta.setSelectionRange(c - m[2].length, c); insert(ta, b.dataset.s + ' '); ta._sync(); sg.hidden = true;
  }; });
}
