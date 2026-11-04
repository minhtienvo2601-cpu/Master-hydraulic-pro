// Hộp thoại, bảng trượt, thông báo nhỏ, xem ảnh
import { $, $$, esc } from './util.js';
import { ic } from './icons.js';

const sheets = [];
export const sheetOpen = () => sheets.length > 0;
export function openSheet(title, html, bind, opt = {}) {
  const root = $('#sheetRoot');
  const bg = document.createElement('div'); bg.className = 'sheet-bg';
  const sh = document.createElement('div'); sh.className = 'sheet' + (opt.tall ? ' tall' : '');
  sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-label', title);
  sh.innerHTML = `<div class="grab"></div><div class="sh-head"><h3>${esc(title)}</h3><button class="icon-btn sm" data-close aria-label="Đóng">${ic('x')}</button></div><div class="sh-body"></div>`;
  sh.querySelector('.sh-body').innerHTML = html;
  root.append(bg, sh);
  requestAnimationFrame(() => { bg.classList.add('show'); sh.classList.add('show'); });
  const entry = { bg, sh, onClose: opt.onClose };
  const close = () => {
    const i = sheets.indexOf(entry); if (i < 0) return; sheets.splice(i, 1);
    bg.classList.remove('show'); sh.classList.remove('show');
    setTimeout(() => { bg.remove(); sh.remove(); }, 220);
    entry.onClose && entry.onClose();
  };
  entry.close = close; sheets.push(entry);
  bg.onclick = close; sh.querySelector('[data-close]').onclick = close;
  bind && bind(sh.querySelector('.sh-body'), close);
  return close;
}
export function closeTopSheet() { const s = sheets[sheets.length - 1]; if (!s) return false; s.close(); return true; }

export function menu(title, items) {
  openSheet(title, items.map((it, i) => it.sep ? '<div class="menu-sep"></div>' :
    `<button class="menu-item ${it.danger ? 'danger' : ''} ${it.on ? 'on' : ''}" data-i="${i}">${it.emoji ? `<span class="emo">${it.emoji}</span>` : ic(it.icon || 'chev')}<span class="grow">${esc(it.label)}</span>${it.hint ? `<small>${esc(it.hint)}</small>` : ''}${it.on ? ic('check') : ''}</button>`).join(''), (b, close) => {
    $$('[data-i]', b).forEach(el => el.onclick = () => { close(); items[+el.dataset.i].run(); });
  });
}

export function confirmBox(title, msg, okLabel = 'Đồng ý', danger = false) {
  return new Promise(res => {
    let done = false;
    const close = openSheet(title, `<p class="sh-msg">${msg}</p><div class="btn-row"><button class="btn sec" data-n>Hủy</button><button class="btn ${danger ? 'dan' : 'pri'}" data-y>${esc(okLabel)}</button></div>`, (b, cl) => {
      b.querySelector('[data-n]').onclick = () => cl();
      b.querySelector('[data-y]').onclick = () => { done = true; res(true); cl(); };
    }, { onClose: () => { if (!done) res(false); } });
  });
}

export function promptBox(title, label, value = '', opt = {}) {
  return new Promise(res => {
    let done = false;
    openSheet(title, `<label class="field"><span class="lb">${esc(label)}</span>${opt.multi ? `<textarea class="inp" rows="5" id="pv" placeholder="${esc(opt.ph || '')}">${esc(value)}</textarea>` : `<input class="inp" id="pv" value="${esc(value)}" placeholder="${esc(opt.ph || '')}" autocomplete="off" enterkeyhint="done">`}</label>
      ${opt.help ? `<p class="help">${opt.help}</p>` : ''}<button class="btn pri" data-y>${ic('check')} ${esc(opt.ok || 'Lưu')}</button>`, (b, cl) => {
      const i = b.querySelector('#pv'); setTimeout(() => { i.focus(); i.setSelectionRange && i.setSelectionRange(i.value.length, i.value.length); }, 250);
      const ok = () => { done = true; res(i.value.trim()); cl(); };
      b.querySelector('[data-y]').onclick = ok;
      if (!opt.multi) i.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } };
    }, { onClose: () => { if (!done) res(null); } });
  });
}

let toastT;
export function toast(msg, action) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  t.classList.add('show');
  if (action) t.querySelector('button').onclick = () => { t.classList.remove('show'); action.run(); };
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), action ? 5000 : 2400);
}

export function busy(msg) {
  const el = document.createElement('div'); el.className = 'busy';
  el.innerHTML = `<div><div class="spin"></div><div class="bm">${esc(msg)}</div></div>`;
  document.body.append(el);
  return { set: m => { el.querySelector('.bm').textContent = m; }, done: () => el.remove() };
}

// xem ảnh toàn màn hình, vuốt/bấm mũi tên để chuyển ảnh
let viewer = null;
export function viewPhotos(urls, start, actions = []) {
  closePhoto(); let i = start;
  const el = document.createElement('div'); el.className = 'pviewer';
  const draw = () => {
    el.innerHTML = `<img src="${urls[i]}" alt="">
      <div class="pv-top"><span>${i + 1}/${urls.length}</span><span class="grow"></span>
        ${actions.map((a, k) => `<button class="icon-btn" data-a="${k}" aria-label="${esc(a.label)}">${ic(a.icon)}</button>`).join('')}
        <button class="icon-btn" data-x aria-label="Đóng">${ic('x')}</button></div>
      ${urls.length > 1 ? `<button class="pv-nav l" data-p aria-label="Ảnh trước">${ic('back')}</button><button class="pv-nav r" data-n aria-label="Ảnh sau">${ic('chev')}</button>` : ''}`;
    el.querySelector('[data-x]').onclick = closePhoto;
    $$('[data-a]', el).forEach(b => b.onclick = () => { const a = actions[+b.dataset.a]; closePhoto(); a.run(i); });
    const p = el.querySelector('[data-p]'), n = el.querySelector('[data-n]');
    if (p) p.onclick = () => { i = (i - 1 + urls.length) % urls.length; draw(); };
    if (n) n.onclick = () => { i = (i + 1) % urls.length; draw(); };
  };
  let x0 = null;
  el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', e => { if (x0 == null || urls.length < 2) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 60) { i = (i + (dx < 0 ? 1 : -1) + urls.length) % urls.length; draw(); } });
  draw(); document.body.append(el); viewer = el;
}
export function closePhoto() { if (!viewer) return false; viewer.remove(); viewer = null; return true; }
