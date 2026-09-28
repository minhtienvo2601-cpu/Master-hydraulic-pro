// Bản máy tính: lưu sẵn giao diện để mở được cả khi mất mạng.
// Giao diện (app.js, style.css…) lấy bản mới từ mạng trước, mất mạng thì dùng bản đã lưu.
// Bộ đọc PDF (pdfjs/…) ít thay đổi nên lấy từ bản đã lưu cho nhanh.
const SHELL = 'bt-shell-v1', LIB = 'bt-lib-v1';
const CORE = ['./', 'index.html', 'app.js', 'style.css', 'logo.png', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL && k !== LIB).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;
  if (url.pathname.includes('/pdfjs/')) {
    e.respondWith(caches.open(LIB).then(async c => { const hit = await c.match(req); if (hit) return hit; const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r; }));
    return;
  }
  e.respondWith(fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(SHELL).then(c => c.put(req, cp)); } return r; })
    .catch(() => caches.match(req).then(h => h || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
