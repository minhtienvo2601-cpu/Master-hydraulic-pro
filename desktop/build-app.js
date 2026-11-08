'use strict';
/* Tạo giao diện cho bản Windows từ đúng file tools/QuanLyBocVatTu.html (một nguồn duy nhất):
   thay thư viện tải từ mạng bằng bản đóng gói sẵn để chạy không cần Internet. */
const fs = require('fs'), path = require('path');
const nm = p => path.join(__dirname, 'node_modules', p);
const SRC = path.join(__dirname, '..', 'tools', 'QuanLyBocVatTu.html');
const OUT = path.join(__dirname, 'app');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'vendor', 'fonts'), { recursive: true });

let h = fs.readFileSync(SRC, 'utf8');
const swap = (from, to) => { if (!h.includes(from)) throw new Error('Không thấy trong HTML: ' + from); h = h.split(from).join(to); };
swap('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/', 'vendor/');
swap('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/', 'vendor/');
swap('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/', 'vendor/');
h = h.replace(/<link rel="preconnect"[^>]*>\s*/g, '');
h = h.replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/, '<link href="vendor/fonts/fonts.css" rel="stylesheet">');
h = h.replace('<meta charset="utf-8">', `<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; frame-src 'self' blob: bfile:; worker-src 'self' blob:; connect-src 'self' blob: data:">`);
const left = h.match(/(src|href)="https?:\/\/[^"]+"/g);
if (left) throw new Error('Còn tài nguyên tải từ mạng: ' + left.join(', '));
fs.writeFileSync(path.join(OUT, 'index.html'), h);

for (const [src, dst] of [
  ['pdfjs-dist/build/pdf.min.js', 'pdf.min.js'], ['pdfjs-dist/build/pdf.worker.min.js', 'pdf.worker.min.js'],
  ['xlsx/dist/xlsx.full.min.js', 'xlsx.full.min.js'], ['jszip/dist/jszip.min.js', 'jszip.min.js'],
]) fs.copyFileSync(nm(src), path.join(OUT, 'vendor', dst));

/* Phông chữ: chỉ lấy woff2 của các cỡ chữ app dùng */
let css = '';
for (const [pkg, ws] of [['be-vietnam-pro', [400, 500, 600, 700]], ['jetbrains-mono', [400, 500, 600]]]) {
  for (const w of ws) {
    let c = fs.readFileSync(nm(`@fontsource/${pkg}/${w}.css`), 'utf8');
    c = c.replace(/,\s*url\(\.\/files\/[^)]+\.woff\) format\('woff'\)/g, '');
    for (const m of c.matchAll(/url\(\.\/files\/([^)]+\.woff2)\)/g)) fs.copyFileSync(nm(`@fontsource/${pkg}/files/${m[1]}`), path.join(OUT, 'vendor', 'fonts', m[1]));
    css += c.replace(/url\(\.\/files\//g, 'url(') + '\n';
  }
}
fs.writeFileSync(path.join(OUT, 'vendor', 'fonts', 'fonts.css'), css);
const size = d => fs.readdirSync(d, { withFileTypes: true }).reduce((a, e) => a + (e.isDirectory() ? size(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
console.log(`Đã tạo desktop/app (${(size(OUT) / 1048576).toFixed(1)} MB)`);
