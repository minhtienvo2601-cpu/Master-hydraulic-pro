// Chép bộ đọc PDF (PDF.js của Mozilla) vào www/pdfjs để app đọc PDF ngay bên trong, không cần app khác.
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist');
const dst = path.join(__dirname, '..', 'www', 'pdfjs');
fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(dst, { recursive: true });
for (const f of ['pdf.min.mjs', 'pdf.worker.min.mjs']) fs.copyFileSync(path.join(src, 'legacy', 'build', f), path.join(dst, f));
for (const d of ['cmaps', 'standard_fonts', 'wasm']) fs.cpSync(path.join(src, d), path.join(dst, d), { recursive: true, filter: f => !/quickjs/.test(f) });
console.log('pdfjs -> www/pdfjs');
