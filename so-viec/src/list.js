// Màn hình chính: ghi nhanh, tìm kiếm, lọc theo thẻ / trạng thái / ngày, danh sách & dòng thời gian
import { S, alive, newNote, touch, tagsOf, progress, allTags, photoUrl, saveKV } from './store.js';
import { nav, push } from './nav.js';
import { F, setF, emptyF, sameF, applyF, activeParts, dropPart, countActive, RANGES, SORTS } from './filter.js';
import { STATUS } from './templates.js';
import { statusMenu, trashNote, duplicate, shareNote, templatePicker } from './actions.js';
import { openSheet, menu, toast, promptBox, confirmBox } from './ui.js';
import { $, $$, esc, highlight, whenLabel, dayLabel, parseTags, uid, today } from './util.js';
import { ic } from './icons.js';

const PRESETS = [
  { id: 'all', label: 'Tất cả', f: {} },
  { id: 'open', label: 'Chưa xong', icon: 'checkbox', f: { open: true } },
  { id: 'today', label: 'Hôm nay', icon: 'cal', f: { range: 'today' } },
  { id: 'pinned', label: 'Đã ghim', icon: 'pin', f: { pinned: true } },
];
let quickDraft = '';

export function viewHome(v) {
  const list = applyF(); const total = alive().length;
  const tags = allTags(); const nAct = countActive();
  const presetOn = p => sameF(F, p.f);
  const anyPreset = PRESETS.some(presetOn) || S.filters.some(sf => sameF(F, sf.f));
  const parts = anyPreset ? [] : activeParts();
  v.innerHTML = `<div class="fade-in">
    <div class="quick">
      <textarea id="qIn" rows="1" placeholder="Ghi nhanh… (gõ #thẻ để gắn thẻ)" enterkeyhint="send">${esc(quickDraft)}</textarea>
      <button class="q-tpl" id="qTpl" aria-label="Tạo từ mẫu" title="Tạo từ mẫu">${ic('layers')}</button>
      <button class="q-send" id="qSend" aria-label="Lưu ghi chú nhanh">${ic('send')}</button>
    </div>
    <div class="searchrow">
      <div class="searchbox">${ic('search')}<input id="sIn" placeholder="Tìm trong ghi chú (không cần dấu)" value="${esc(F.q)}" autocomplete="off" enterkeyhint="search">${F.q ? `<button id="sX" aria-label="Xóa tìm">${ic('x')}</button>` : ''}</div>
      <button class="fbtn ${nAct ? 'on' : ''}" id="fBtn" aria-label="Bộ lọc">${ic('filter')}${nAct ? `<span class="bdg">${nAct}</span>` : ''}</button>
    </div>
    <div class="chips">
      ${PRESETS.map(p => `<button class="chip ${presetOn(p) ? 'on' : ''}" data-pre="${p.id}">${p.icon ? ic(p.icon) : ''}${p.label}</button>`).join('')}
      ${S.filters.map(sf => `<button class="chip saved ${sameF(F, sf.f) ? 'on' : ''}" data-sf="${sf.id}">${ic('bookmark')}${esc(sf.name)}</button>`).join('')}
    </div>
    ${tags.length ? `<div class="chips tags">${tags.slice(0, 30).map(([t, c]) => `<button class="tchip ${F.tags.includes(t) ? 'on' : ''}" data-tag="${esc(t)}">#${esc(t)}<span>${c}</span></button>`).join('')}${tags.length > 30 ? `<button class="tchip more" data-alltags>Tất cả thẻ…</button>` : ''}</div>` : ''}
    ${parts.length ? `<div class="active-f">${parts.map((p, i) => `<button class="af" data-part="${i}">${esc(p.label)}${ic('x', 2.4)}</button>`).join('')}
      <button class="link" id="fSave">${ic('bookmark')}Lưu bộ lọc</button></div>` : ''}
    <div class="listhead"><span>${list.length === total ? `${total} ghi chú` : `${list.length} / ${total} ghi chú`}</span>
      <button class="link" id="sortBtn">${ic('down')}${esc(SORTS[F.sort])}</button></div>
    <div id="nlist"></div>
  </div>`;

  const box = $('#nlist', v);
  if (!list.length) box.innerHTML = `<div class="empty">${ic('note')}<div>${total ? 'Không có ghi chú phù hợp.' : 'Chưa có ghi chú nào.'}</div><small>${total ? 'Thử bỏ bớt điều kiện lọc.' : 'Gõ vào ô <b>Ghi nhanh</b> ở trên, hoặc bấm <b>+</b> để tạo từ mẫu (bàn giao ca, sự cố, kiểm tra…).'}</small>${total ? '<button class="btn sec sm" id="fClear">Bỏ lọc</button>' : ''}</div>`;
  else if (S.settings.view === 'timeline') {
    let html = '', last = '';
    for (const n of list) { if (n.date !== last) { last = n.date; html += `<div class="dayhead"><span>${dayLabel(n.date)}</span><small>${list.filter(x => x.date === n.date).length}</small></div>`; } html += cardHtml(n, true); }
    box.innerHTML = `<div class="timeline">${html}</div>`;
  } else box.innerHTML = list.map(n => cardHtml(n)).join('');
  thumbs(box);

  // ----- sự kiện -----
  const qi = $('#qIn', v);
  const grow = () => { qi.style.height = 'auto'; qi.style.height = Math.min(qi.scrollHeight, 160) + 'px'; }; grow();
  qi.oninput = () => { quickDraft = qi.value; grow(); };
  qi.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); quickSave(); } };
  $('#qSend', v).onclick = quickSave;
  $('#qTpl', v).onclick = () => templatePicker({ tags: F.tags });

  const si = $('#sIn', v); let t;
  si.oninput = () => { clearTimeout(t); t = setTimeout(() => { F.q = si.value; const pos = si.selectionStart; nav.render(); const s2 = $('#sIn'); if (s2) { s2.focus(); s2.setSelectionRange(pos, pos); } }, 220); };
  const sx = $('#sX', v); if (sx) sx.onclick = () => { F.q = ''; nav.render(); };
  $('#fBtn', v).onclick = () => filterSheet();
  $$('[data-pre]', v).forEach(b => b.onclick = () => { const q = F.q, s = F.sort; setF(PRESETS.find(p => p.id === b.dataset.pre).f); F.q = q; F.sort = s; nav.render(); });
  $$('[data-sf]', v).forEach(b => {
    const sf = S.filters.find(x => x.id === b.dataset.sf);
    b.onclick = () => { const q = F.q; setF(sf.f); F.q = q; nav.render(); };
    longPress(b, () => savedFilterMenu(sf));
  });
  $$('[data-tag]', v).forEach(b => b.onclick = () => { const tg = b.dataset.tag; F.tags = F.tags.includes(tg) ? F.tags.filter(x => x !== tg) : [...F.tags, tg]; nav.render(); });
  const at = $('[data-alltags]', v); if (at) at.onclick = () => push({ v: 'tags' });
  $$('[data-part]', v).forEach(b => b.onclick = () => { dropPart(parts[+b.dataset.part]); nav.render(); });
  const fs = $('#fSave', v); if (fs) fs.onclick = saveFilter;
  const fc = $('#fClear', v); if (fc) fc.onclick = () => { setF({}); nav.render(); };
  $('#sortBtn', v).onclick = () => menu('Sắp xếp', Object.entries(SORTS).map(([k, l]) => ({ icon: 'list', label: l, on: F.sort === k, run: () => { F.sort = k; nav.render(); } })));
  $$('[data-n]', box).forEach(el => {
    const n = S.notes.find(x => x.id === el.dataset.n);
    el.onclick = e => { if (e.target.closest('[data-pin]')) { n.pinned = !n.pinned; touch(n, true); nav.render(); return; } push({ v: 'note', id: n.id }); };
    longPress(el, () => cardMenu(n));
  });
}

function cardHtml(n, tl) {
  const q = F.q; const p = progress(n); const ts = tagsOf(n); const st = STATUS[n.status];
  const lines = n.body.split('\n').map(l => l.trim()).filter(Boolean);
  const title = n.title.trim() || lines.shift() || 'Ghi chú không tên';
  const snip = lines.map(l => l.replace(/^##\s*/, '')).join(' · ').slice(0, 160);
  return `<article class="ncard ${n.status === 'done' ? 'is-done' : ''}" data-n="${n.id}">
    <div class="nc-main">
      <div class="nc-top">${st ? `<span class="st ${st.cls}">${st.label}</span>` : ''}<h4>${highlight(title, q)}</h4>
        <button class="nc-pin ${n.pinned ? 'on' : ''}" data-pin aria-label="${n.pinned ? 'Bỏ ghim' : 'Ghim'}">${ic('pin')}</button></div>
      ${snip ? `<p class="nc-snip">${highlight(snip, q)}</p>` : ''}
      <div class="nc-meta">
        ${p.total ? `<span class="prog ${p.done === p.total ? 'full' : ''}"><i style="width:${Math.round(p.done / p.total * 100)}%"></i></span><span>${p.done}/${p.total}</span>` : ''}
        ${(n.photos || []).length ? `<span>${ic('image')}${n.photos.length}</span>` : ''}
        ${ts.slice(0, 3).map(t => `<span class="tg ${F.tags.includes(t) ? 'on' : ''}">#${esc(t)}</span>`).join('')}${ts.length > 3 ? `<span class="tg">+${ts.length - 3}</span>` : ''}
        <span class="grow"></span><span class="when">${tl ? whenLabel(n.updated).replace(/^Hôm qua /, '') : (n.date !== today() ? dayLabel(n.date) : whenLabel(n.updated))}</span>
      </div>
    </div>
    ${(n.photos || []).length ? `<img class="nc-th" data-ph="${n.photos[0]}" alt="">` : ''}
  </article>`;
}
async function thumbs(box) { for (const im of $$('img[data-ph]', box)) im.src = await photoUrl(im.dataset.ph); }

function quickSave() {
  const el = $('#qIn'); const text = (el ? el.value : quickDraft).trim();
  if (!text) { templatePicker({ tags: F.tags }); return; }
  // dòng đầu thành tiêu đề nếu ghi nhiều dòng
  const ls = text.split('\n'); const multi = ls.length > 1;
  const n = newNote({ title: multi ? ls[0].trim() : '', body: multi ? ls.slice(1).join('\n').trim() : text, tags: [...F.tags] });
  if (F.status.length === 1 && F.status[0] !== 'none') n.status = F.status[0];
  touch(n); quickDraft = '';
  const extra = parseTags(text).length ? ` · ${parseTags(text).map(t => '#' + t).join(' ')}` : '';
  nav.render(); toast('Đã lưu ghi chú' + extra, { label: 'Mở', run: () => push({ v: 'note', id: n.id }) });
  setTimeout(() => $('#qIn') && $('#qIn').focus(), 50);
}

export function longPress(el, fn) {
  let t = null, x0 = 0, y0 = 0, fired = false;
  el.addEventListener('pointerdown', e => { fired = false; x0 = e.clientX; y0 = e.clientY; t = setTimeout(() => { fired = true; t = null; navigator.vibrate && navigator.vibrate(15); fn(); }, 520); });
  const cancel = () => { clearTimeout(t); t = null; };
  el.addEventListener('pointermove', e => { if (t && (Math.abs(e.clientX - x0) > 8 || Math.abs(e.clientY - y0) > 8)) cancel(); });
  el.addEventListener('pointerup', cancel); el.addEventListener('pointercancel', cancel); el.addEventListener('pointerleave', cancel);
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('click', e => { if (fired) { e.stopImmediatePropagation(); e.preventDefault(); fired = false; } }, true);
}

function cardMenu(n) {
  const r = () => nav.render();
  menu(n.title || 'Ghi chú', [
    { icon: 'pin', label: n.pinned ? 'Bỏ ghim' : 'Ghim lên đầu', run: () => { n.pinned = !n.pinned; touch(n, true); r(); } },
    { icon: 'status', label: 'Đổi trạng thái', hint: STATUS[n.status]?.label || '', run: () => statusMenu(n, r) },
    ...(n.status !== 'done' ? [{ icon: 'check', label: 'Đánh dấu đã xong', run: () => { n.status = 'done'; touch(n); r(); toast('Đã xong ✔'); } }] : []),
    { icon: 'share', label: 'Gửi / chia sẻ', run: () => shareNote(n) },
    { icon: 'copy', label: 'Nhân bản', run: () => { duplicate(n); r(); } },
    { icon: 'trash', label: 'Xóa', danger: true, run: () => trashNote(n, r) },
  ]);
}

// ---------- bảng bộ lọc ----------
export function filterSheet() {
  const draw = b => {
    const tags = allTags(); const cnt = applyF().length;
    b.innerHTML = `
      <div class="fs-sec"><div class="fs-h">Trạng thái</div><div class="chips wrap">
        ${[...Object.entries(STATUS).map(([k, s]) => [k, s.label]), ['none', 'Không trạng thái']].map(([k, l]) => `<button class="chip ${F.status.includes(k) ? 'on' : ''}" data-st="${k}">${l}</button>`).join('')}</div></div>
      <div class="fs-sec"><div class="fs-h">Thời gian (ngày công việc)</div><div class="chips wrap">
        ${Object.entries(RANGES).map(([k, l]) => `<button class="chip ${F.range === k ? 'on' : ''}" data-rg="${k}">${l}</button>`).join('')}</div>
        ${F.range === 'custom' ? `<div class="daterow"><label>Từ<input type="date" class="inp" id="fFrom" value="${F.from}"></label><label>Đến<input type="date" class="inp" id="fTo" value="${F.to}"></label></div>` : ''}</div>
      <div class="fs-sec"><div class="fs-h">Khác</div><div class="chips wrap">
        <button class="chip ${F.open ? 'on' : ''}" data-tg="open">${ic('checkbox')}Còn việc chưa xong</button>
        <button class="chip ${F.pinned ? 'on' : ''}" data-tg="pinned">${ic('pin')}Đã ghim</button>
        <button class="chip ${F.photo ? 'on' : ''}" data-tg="photo">${ic('image')}Có ảnh</button></div></div>
      <div class="fs-sec"><div class="fs-h">Thẻ ${F.tags.length > 1 ? `<span class="seg"><button class="${F.tagMode === 'all' ? 'on' : ''}" data-tm="all">Có đủ</button><button class="${F.tagMode === 'any' ? 'on' : ''}" data-tm="any">Có 1 trong</button></span>` : ''}</div>
        ${tags.length ? `<div class="chips wrap">${tags.map(([t, c]) => `<button class="tchip ${F.tags.includes(t) ? 'on' : ''}" data-tag="${esc(t)}">#${esc(t)}<span>${c}</span></button>`).join('')}</div>` : '<p class="help">Chưa có thẻ. Gõ <b>#tên-thẻ</b> trong ghi chú, ví dụ #bơm, #máy-ép-1.</p>'}</div>
      <div class="btn-row sticky"><button class="btn sec" data-reset>Đặt lại</button><button class="btn pri" data-ok>Xem ${cnt} ghi chú</button></div>
      ${countActive() ? `<button class="link center" data-savef>${ic('bookmark')} Lưu bộ lọc này thành nút nhanh</button>` : ''}`;
    const upd = () => { nav.render(); draw(b); };
    $$('[data-st]', b).forEach(x => x.onclick = () => { const k = x.dataset.st; F.status = F.status.includes(k) ? F.status.filter(s => s !== k) : [...F.status, k]; upd(); });
    $$('[data-rg]', b).forEach(x => x.onclick = () => { const k = x.dataset.rg; F.range = F.range === k ? '' : k; if (k === 'custom' && !F.from) { F.from = today().slice(0, 8) + '01'; F.to = today(); } upd(); });
    $$('[data-tg]', b).forEach(x => x.onclick = () => { F[x.dataset.tg] = !F[x.dataset.tg]; upd(); });
    $$('[data-tag]', b).forEach(x => x.onclick = () => { const tg = x.dataset.tag; F.tags = F.tags.includes(tg) ? F.tags.filter(t => t !== tg) : [...F.tags, tg]; upd(); });
    $$('[data-tm]', b).forEach(x => x.onclick = () => { F.tagMode = x.dataset.tm; upd(); });
    const fr = $('#fFrom', b), to = $('#fTo', b);
    if (fr) fr.onchange = () => { F.from = fr.value; upd(); };
    if (to) to.onchange = () => { F.to = to.value; upd(); };
    b.querySelector('[data-reset]').onclick = () => { const q = F.q, s = F.sort; setF({}); F.q = q; F.sort = s; upd(); };
    b.querySelector('[data-ok]').onclick = () => close();
    const sv = b.querySelector('[data-savef]'); if (sv) sv.onclick = () => { close(); saveFilter(); };
  };
  let close = null;
  openSheet('Bộ lọc', '<div id="fs"></div>', (b, cl) => { close = cl; draw(b.querySelector('#fs')); }, { tall: true });
}

async function saveFilter() {
  const sug = activeParts().filter(p => p.k !== 'tagMode').map(p => p.label).join(' + ').slice(0, 30);
  const name = await promptBox('Lưu bộ lọc', 'Tên nút lọc nhanh', sug, { help: 'Nút sẽ hiện ở hàng chip trên màn hình chính. Bấm giữ nút để đổi tên hoặc xóa.' });
  if (!name) return;
  const f = JSON.parse(JSON.stringify(F)); f.q = ''; f.sort = 'updated';
  S.filters.push({ id: uid(), name, f }); await saveKV('filters'); nav.render(); toast('Đã lưu bộ lọc “' + name + '”');
}
function savedFilterMenu(sf) {
  menu(sf.name, [
    { icon: 'edit', label: 'Đổi tên', run: async () => { const nm = await promptBox('Đổi tên bộ lọc', 'Tên', sf.name); if (nm) { sf.name = nm; await saveKV('filters'); nav.render(); } } },
    { icon: 'filter', label: 'Cập nhật theo bộ lọc đang chọn', run: async () => { const f = JSON.parse(JSON.stringify(F)); f.q = ''; f.sort = 'updated'; sf.f = f; await saveKV('filters'); nav.render(); toast('Đã cập nhật'); } },
    { icon: 'trash', label: 'Xóa bộ lọc', danger: true, run: async () => { if (!await confirmBox('Xóa bộ lọc?', `Xóa nút “${esc(sf.name)}”. Ghi chú không bị ảnh hưởng.`, 'Xóa', true)) return; S.filters = S.filters.filter(x => x !== sf); await saveKV('filters'); nav.render(); } },
  ]);
}
