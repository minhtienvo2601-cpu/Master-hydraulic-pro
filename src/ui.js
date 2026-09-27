import { $, esc } from './util.js';
import { ic } from './icons.js';

const stack = [];
export function openSheet(title, html, mount, opts = {}) {
  const root = $('#sheetRoot');
  const bg = document.createElement('div'); bg.className = 'sheet-bg';
  const sh = document.createElement('div'); sh.className = 'sheet';
  sh.innerHTML = `<div class="grab"></div><div class="sh-head"><h3>${esc(title)}</h3><button class="icon-btn" data-x>${ic('x')}</button></div><div class="sh-body">${html}</div>`;
  root.append(bg, sh);
  requestAnimationFrame(() => { bg.classList.add('show'); sh.classList.add('show'); });
  const entry = { close: () => close(), onClose: opts.onClose };
  function close() {
    const i = stack.indexOf(entry); if (i >= 0) stack.splice(i, 1);
    bg.classList.remove('show'); sh.classList.remove('show');
    setTimeout(() => { bg.remove(); sh.remove(); }, 260);
    entry.onClose && entry.onClose();
  }
  bg.onclick = close; sh.querySelector('[data-x]').onclick = close;
  // kéo xuống để đóng
  let y0 = null; const grab = sh.querySelector('.grab'), head = sh.querySelector('.sh-head');
  [grab, head].forEach(el => {
    el.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; }, { passive: true });
    el.addEventListener('touchmove', e => { if (y0 == null) return; const dy = e.touches[0].clientY - y0; if (dy > 0) { sh.style.transition = 'none'; sh.style.transform = `translateY(${dy}px)`; } }, { passive: true });
    el.addEventListener('touchend', e => { if (y0 == null) return; const dy = e.changedTouches[0].clientY - y0; sh.style.transition = ''; sh.style.transform = ''; y0 = null; if (dy > 90) close(); });
  });
  stack.push(entry);
  mount && mount(sh.querySelector('.sh-body'), close);
  return close;
}
export const sheetOpen = () => stack.length > 0;
export function closeTopSheet() { const e = stack[stack.length - 1]; if (e) { e.close(); return true; } return false; }

export function confirmBox(title, msg, okText = 'Đồng ý', danger = false) {
  return new Promise(res => {
    let done = false;
    const close = openSheet(title, `<p style="color:var(--tx2);margin:0 0 18px">${msg}</p>
      <button class="btn ${danger ? 'dan' : 'pri'}" data-ok>${esc(okText)}</button><button class="btn sec" data-no>Hủy</button>`, (b, cl) => {
      b.querySelector('[data-ok]').onclick = () => { done = true; res(true); cl(); };
      b.querySelector('[data-no]').onclick = () => cl();
    }, { onClose: () => { if (!done) res(false); } });
  });
}
export function promptBox(title, label, value = '', opts = {}) {
  return new Promise(res => {
    let done = false;
    openSheet(title, `<div class="field"><label class="lb">${esc(label)}</label>
      ${opts.multi ? `<textarea class="inp" data-v rows="5" placeholder="${esc(opts.ph || '')}">${esc(value)}</textarea>` : `<input class="inp" data-v value="${esc(value)}" placeholder="${esc(opts.ph || '')}">`}
      ${opts.hint ? `<div class="muted" style="font-size:12.5px;margin:6px 2px 0">${opts.hint}</div>` : ''}</div>
      <button class="btn pri" data-ok>${ic('check')} Lưu</button>`, (b, cl) => {
      const inp = b.querySelector('[data-v]'); setTimeout(() => inp.focus(), 300);
      b.querySelector('[data-ok]').onclick = () => { done = true; res(inp.value.trim()); cl(); };
      if (!opts.multi) inp.onkeydown = e => { if (e.key === 'Enter') b.querySelector('[data-ok]').click(); };
    }, { onClose: () => { if (!done) res(null); } });
  });
}
export function menu(title, items) {
  openSheet(title, items.map((it, i) => `<button class="menu-item ${it.danger ? 'red' : ''}" data-i="${i}">${ic(it.icon)}<span>${esc(it.label)}</span></button>`).join(''), (b, cl) => {
    b.querySelectorAll('[data-i]').forEach(el => el.onclick = () => { cl(); setTimeout(() => items[+el.dataset.i].run(), 200); });
  });
}
let tt = null;
export function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2400); }
export function busy(msg) {
  const d = document.createElement('div'); d.className = 'busy'; d.innerHTML = `<div style="text-align:center"><div class="spin"></div><div data-m>${esc(msg)}</div></div>`;
  document.body.appendChild(d);
  return { set: m => { d.querySelector('[data-m]').textContent = m; }, done: () => d.remove() };
}
let pv = null;
export function viewPhoto(src) {
  pv = document.createElement('div'); pv.className = 'photo-view'; pv.innerHTML = `<img src="${src}"><button>${ic('x')}</button>`;
  pv.onclick = closePhoto; document.body.appendChild(pv);
}
export function closePhoto() { if (pv) { pv.remove(); pv = null; return true; } return false; }
