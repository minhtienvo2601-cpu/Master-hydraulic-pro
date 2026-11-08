'use strict';
/* Quét cây thư mục hồ sơ bằng Node.js.
   Trên Windows, fs của Node tự chuyển đường dẫn sang dạng \\?\C:\... nên KHÔNG bị giới hạn
   260 ký tự như trình duyệt: đọc đủ mọi thư mục, kể cả thư mục rỗng và thư mục rất sâu. */
const fs = require('fs');
const path = require('path');

const SKIP = /^(desktop\.ini|thumbs\.db|\.ds_store)$|^~\$/i;
const errText = e => `${e && e.code ? e.code + ': ' : ''}${(e && e.message) || e}`;

async function scanTree(rootAbs, opt = {}) {
  const conc = opt.concurrency || 16;
  const rootName = path.basename(rootAbs) || rootAbs;
  const dirs = [], files = [], errs = [];
  const queue = [[rootAbs, rootName]];
  let active = 0, last = 0;

  const st = await fs.promises.stat(rootAbs);
  if (!st.isDirectory()) throw new Error('Không phải thư mục: ' + rootAbs);

  async function one(abs, rel) {
    dirs.push(rel);
    let ents;
    try { ents = await fs.promises.readdir(abs, { withFileTypes: true }); }
    catch (e) { errs.push({ path: rel, msg: errText(e) }); return; }
    await Promise.all(ents.map(async e => {
      if (SKIP.test(e.name)) return;
      const a = path.join(abs, e.name), r = rel + '/' + e.name;
      let isDir = e.isDirectory(), isFile = e.isFile();
      if (e.isSymbolicLink()) {
        try { const s = await fs.promises.stat(a); isDir = s.isDirectory(); isFile = s.isFile(); }
        catch (er) { errs.push({ path: r, msg: errText(er) }); return; }
      }
      if (isDir) { queue.push([a, r]); return; }
      if (!isFile) return;
      try { const s = await fs.promises.stat(a); files.push({ abs: a, rel: r, size: s.size, mtime: s.mtimeMs }); }
      catch (er) { files.push({ abs: a, rel: r, size: 0, mtime: 0, err: errText(er) }); }
    }));
    if (opt.onProgress && Date.now() - last > 150) { last = Date.now(); opt.onProgress({ dirs: dirs.length, files: files.length }); }
  }

  await new Promise(resolve => {
    const pump = () => {
      while (active < conc && queue.length) {
        const [a, r] = queue.shift(); active++;
        one(a, r).catch(() => {}).finally(() => { active--; if (!queue.length && !active) resolve(); else pump(); });
      }
    };
    pump();
  });
  return { rootName, rootPath: rootAbs, sep: path.sep, dirs, files, errs };
}

/* Có nằm trong một thư mục được phép không (chặn đọc file ngoài hồ sơ) */
function isInside(abs, roots) {
  const a = path.resolve(abs).toLowerCase();
  for (const r of roots) {
    const rr = path.resolve(r).toLowerCase();
    if (a === rr || a.startsWith(rr.endsWith(path.sep) ? rr : rr + path.sep)) return true;
  }
  return false;
}

/* Ghi gói xuất: entries = [{path:'BOM/x.pdf', src:'C:\\...'} | {path:'a.xlsx', data:Uint8Array|string}] */
async function writeExport(destDir, entries) {
  const errors = [];
  for (const e of entries) {
    const out = path.join(destDir, ...String(e.path).split('/'));
    try {
      await fs.promises.mkdir(path.dirname(out), { recursive: true });
      if (e.src) await fs.promises.copyFile(e.src, out);
      else await fs.promises.writeFile(out, typeof e.data === 'string' ? e.data : Buffer.from(e.data));
    } catch (er) { errors.push({ path: e.path, msg: errText(er) }); }
  }
  return { dir: destDir, errors };
}

module.exports = { scanTree, isInside, writeExport, errText };
