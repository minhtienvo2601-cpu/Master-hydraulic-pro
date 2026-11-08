'use strict';
/* Kiểm tra bộ quét thư mục: thư mục rỗng, tên có # và (See Order Spec), đường dẫn > 260 ký tự.
   Chạy trên Windows (GitHub Actions) để chắc chắn đọc được đường dẫn dài. */
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const { scanTree, writeExport } = require('../scanner');
(async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'bocvt-'));
  const root = path.join(base, '80037697-05#A HYDRAULIC UNIT');
  const levels = ['001 80056657-01#A HYDRAULIC EQUIPMENT', '003 80037698-04#- HYDRAULIC EQUIPMENT', '012 80041234-02#B MANIFOLD BLOCK ASSEMBLY', '004 80051111-01#A VALVE BLOCK SUB ASSEMBLY', '002 80059999-03#C CARTRIDGE VALVE ASSEMBLY', '001 80060000-01#A SEAL KIT FOR CARTRIDGE'];
  let deep = root; for (const l of levels) deep = path.join(deep, l);
  fs.mkdirSync(deep, { recursive: true });
  fs.writeFileSync(path.join(deep, '80060000-01#A 2D Drawing.pdf'), '%PDF-1.4 deep');
  fs.mkdirSync(path.join(root, '014  (See Order Spec) HYDRAULIC CYLINDER'));
  fs.mkdirSync(path.join(root, '016 513732#- HEXAGON HEAD SCREW'));
  fs.writeFileSync(path.join(root, '80037697-05#A ASSEMBLED ITEM REPORT.pdf'), '%PDF-1.4 bom');
  fs.writeFileSync(path.join(root, 'desktop.ini'), '');
  const deepFile = path.join(deep, '80060000-01#A 2D Drawing.pdf');
  console.log('Đường dẫn sâu nhất:', deepFile.length, 'ký tự');
  assert.ok(deepFile.length > 300, 'fixture phải dài hơn 300 ký tự');

  const r = await scanTree(root);
  console.log(`Quét: ${r.dirs.length} thư mục, ${r.files.length} file, ${r.errs.length} lỗi`);
  assert.strictEqual(r.errs.length, 0, JSON.stringify(r.errs));
  assert.strictEqual(r.dirs.length, 1 + levels.length + 2);
  assert.ok(r.dirs.includes('80037697-05#A HYDRAULIC UNIT/014  (See Order Spec) HYDRAULIC CYLINDER'));
  assert.ok(r.dirs.includes('80037697-05#A HYDRAULIC UNIT/016 513732#- HEXAGON HEAD SCREW'));
  assert.strictEqual(r.files.length, 2, 'bỏ qua desktop.ini');
  const f = r.files.find(x => x.rel.endsWith('2D Drawing.pdf'));
  assert.ok(f && f.size > 0 && !f.err, 'đọc được thông tin file sâu');
  assert.strictEqual(fs.readFileSync(f.abs, 'utf8'), '%PDF-1.4 deep');

  const out = path.join(base, 'xuat');
  const w = await writeExport(out, [{ path: 'BanVe_Lap/a_A 2D Drawing.pdf', src: f.abs }, { path: 'x.txt', data: 'ok' }, { path: 'y.bin', data: new Uint8Array([1, 2, 3]) }]);
  assert.strictEqual(w.errors.length, 0, JSON.stringify(w.errors));
  assert.strictEqual(fs.readFileSync(path.join(out, 'BanVe_Lap', 'a_A 2D Drawing.pdf'), 'utf8'), '%PDF-1.4 deep');
  fs.rmSync(base, { recursive: true, force: true });
  console.log('OK – bộ quét đọc đủ thư mục rỗng và đường dẫn dài');
})().catch(e => { console.error('LỖI:', e); process.exit(1); });
