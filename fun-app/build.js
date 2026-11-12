// Tạo thư mục www cho Capacitor từ đúng file tools/BiKipTanGai.html (một nguồn duy nhất)
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', 'tools', 'BiKipTanGai.html');
const out = path.join(__dirname, 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const html = fs.readFileSync(src, 'utf8');
const ext = html.match(/(src|href)="https?:\/\/[^"]+"/g);
if (ext) throw new Error('App phải chạy offline, còn tài nguyên tải từ mạng: ' + ext.join(', '));
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log('fun-app: đã tạo www/index.html (' + Math.round(html.length / 1024) + ' KB)');
