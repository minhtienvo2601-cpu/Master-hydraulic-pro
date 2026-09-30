// Tải ảnh "lười": chỉ tải ảnh sắp cuộn tới (trước ~2 màn hình), dùng ảnh thu nhỏ để cuộn mượt.
// <img data-src="photos/abc.jpg">           → ảnh thu nhỏ
// <img data-src="photos/abc.jpg" data-hq>   → ảnh gốc (ảnh lớn như ảnh tem)
// Sau khi tải: im.dataset.full = đường dẫn ảnh gốc (dùng khi bấm xem phóng to).
import { fileSrc, thumbSrc } from './platform.js';

const done = new Map(); // path -> { t: thumb url, f: full url }
const queue = []; let running = 0;
function pump() {
  while (running < 3 && queue.length) {
    const job = queue.shift(); running++;
    job().finally(() => { running--; pump(); });
  }
}
function apply(im, d) { im.dataset.full = d.f; const u = im.hasAttribute('data-hq') ? d.f : (d.t || d.f); if (u && im.getAttribute('src') !== u) im.src = u; }
function load(im) {
  if (im.dataset.ld) return; im.dataset.ld = '1';
  const p = im.dataset.src; if (!p) return;
  const d = done.get(p); if (d && (d.t || im.hasAttribute('data-hq'))) { apply(im, d); return; }
  queue.push(async () => {
    try {
      const f = await fileSrc(p); const e = done.get(p) || { f, t: '' }; e.f = f;
      if (!im.hasAttribute('data-hq')) e.t = await thumbSrc(p);
      done.set(p, e); apply(im, e);
    } catch (x) { /* bỏ qua ảnh lỗi */ }
  });
  pump();
}
const obs = new WeakMap(); let obsVp = null; // khung cuộn -> IntersectionObserver
function observerFor(root) {
  const got = root ? obs.get(root) : obsVp; if (got) return got;
  const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { io.unobserve(e.target); load(e.target); } }, { root, rootMargin: '200% 0px 200% 0px' });
  if (root) obs.set(root, io); else obsVp = io; return io;
}
export function lazyImgs(box) {
  const imgs = box.querySelectorAll('img[data-src]:not([data-ld])'); if (!imgs.length) return;
  if (!('IntersectionObserver' in window)) { imgs.forEach(load); return; }
  for (const im of imgs) {
    im.decoding = 'async';
    const d = done.get(im.dataset.src); if (d && (d.t || im.hasAttribute('data-hq'))) { im.dataset.ld = '1'; apply(im, d); continue; } // đã có sẵn → hiện ngay
    observerFor(im.closest('#view,.sh-body')).observe(im);
  }
}
// ảnh gốc để xem phóng to
export const fullOf = im => im.dataset.full || im.src;
// xóa ảnh khỏi bộ nhớ đệm (sau khi xóa file)
export const forget = p => done.delete(p);
