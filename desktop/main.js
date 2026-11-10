'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Readable } = require('stream');
const { pathToFileURL } = require('url');
const { scanTree, isInside, writeExport, errText } = require('./scanner');

if (process.env.BOCVT_USERDATA) app.setPath('userData', process.env.BOCVT_USERDATA);

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  { scheme: 'bfile', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

if (!app.requestSingleInstanceLock()) { app.quit(); }

const APP_DIR = path.join(__dirname, 'app');
const CFG = () => path.join(app.getPath('userData'), 'config.json');
const roots = new Set();          // thư mục hồ sơ đã mở: chỉ cho đọc file trong đây
let win = null;

function readCfg() { try { return JSON.parse(fs.readFileSync(CFG(), 'utf8')); } catch (e) { return {}; } }
function writeCfg(patch) {
  const c = Object.assign(readCfg(), patch);
  try { fs.mkdirSync(path.dirname(CFG()), { recursive: true }); fs.writeFileSync(CFG(), JSON.stringify(c, null, 1)); } catch (e) {}
  return c;
}
const allowed = abs => !!abs && isInside(abs, [...roots, path.join(os.tmpdir(), 'BocTachVatTu')]);
const MIME = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.txt': 'text/plain; charset=utf-8' };

function createWindow() {
  const c = readCfg(), b = c.bounds || {};
  win = new BrowserWindow({
    width: b.width || 1440, height: b.height || 900, x: b.x, y: b.y, minWidth: 900, minHeight: 560,
    show: false, backgroundColor: '#0d1825', title: 'Bóc Tách Vật Tư',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  if (c.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  const saveBounds = () => { if (!win.isMinimized()) writeCfg({ bounds: win.isMaximized() ? c.bounds : win.getBounds(), maximized: win.isMaximized() }); };
  win.on('close', saveBounds);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) { shell.openExternal(url); return { action: 'deny' }; }
    if (/^(blob|bfile):/i.test(url)) return { action: 'allow', overrideBrowserWindowOptions: { width: 1100, height: 850, autoHideMenuBar: true, title: 'Xem PDF' } };
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) e.preventDefault(); });
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    if (i.key === 'F12' || (i.control && i.shift && i.key.toLowerCase() === 'i')) { win.webContents.toggleDevTools(); e.preventDefault(); }
    if (i.key === 'F5' || (i.control && i.key.toLowerCase() === 'r')) { win.webContents.reload(); e.preventDefault(); }
  });
  win.loadURL('app://bocvt/index.html');
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  protocol.handle('app', req => {
    let p = decodeURIComponent(new URL(req.url).pathname);
    if (!p || p === '/') p = '/index.html';
    const f = path.normalize(path.join(APP_DIR, p));
    if (!f.startsWith(APP_DIR)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(f).toString());
  });
  /* bfile://f/?p=<đường dẫn>: đưa file PDF trong hồ sơ vào khung xem song song */
  protocol.handle('bfile', async req => {
    const abs = new URL(req.url).searchParams.get('p') || '';
    if (!allowed(abs)) return new Response('Forbidden', { status: 403 });
    try {
      const st = await fs.promises.stat(abs);
      return new Response(Readable.toWeb(fs.createReadStream(abs)), { headers: { 'content-type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream', 'content-length': String(st.size) } });
    } catch (e) { return new Response(errText(e), { status: 404 }); }
  });
  session.defaultSession.on('will-download', (e, item) => {
    item.setSaveDialogOptions({ title: 'Lưu file', defaultPath: path.join(readCfg().saveDir || app.getPath('documents'), item.getFilename()) });
    item.once('done', (ev, state) => { if (state === 'completed') writeCfg({ saveDir: path.dirname(item.getSavePath()) }); });
  });
  createWindow();
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());

/* ================= IPC ================= */
ipcMain.handle('pick-folder', async (e, o = {}) => {
  const c = readCfg();
  const r = await dialog.showOpenDialog(win, {
    title: o.title || 'Chọn thư mục', defaultPath: o.export ? (c.exportDir || app.getPath('desktop')) : (c.lastRoot ? path.dirname(c.lastRoot) : undefined),
    properties: ['openDirectory', 'createDirectory', 'dontAddToRecent'],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  if (o.export) writeCfg({ exportDir: r.filePaths[0] });
  return r.filePaths[0];
});
ipcMain.handle('scan', async (e, abs) => {
  try {
    const t0 = Date.now();
    const r = await scanTree(abs, { onProgress: p => e.sender.send('scan-progress', p) });
    roots.add(abs);
    const rec = (readCfg().recent || []).filter(x => x && x.path !== abs);
    rec.unshift({ path: abs, name: r.rootName, at: Date.now() });
    writeCfg({ lastRoot: abs, recent: rec.slice(0, 10) });
    r.ms = Date.now() - t0;
    return r;
  } catch (er) { return { error: 'Không mở được thư mục: ' + errText(er) }; }
});
ipcMain.handle('read-file', async (e, abs) => {
  if (!allowed(abs)) throw new Error('Không được phép đọc file ngoài thư mục hồ sơ');
  return fs.promises.readFile(abs);
});
ipcMain.handle('stat', async (e, abs) => {
  if (!allowed(abs)) return { ok: false, msg: 'ngoài thư mục hồ sơ' };
  try { const s = await fs.promises.stat(abs); return { ok: true, size: s.size }; } catch (er) { return { ok: false, msg: errText(er) }; }
});
/* Mở bằng phần mềm mặc định (Adobe / Edge…). Đường dẫn quá dài thì chép ra thư mục tạm rồi mở. */
ipcMain.handle('open-path', async (e, abs) => {
  if (!allowed(abs)) return 'Không được phép mở file ngoài thư mục hồ sơ';
  let p = abs;
  if (process.platform === 'win32' && abs.length >= 250) {
    const tmp = path.join(os.tmpdir(), 'BocTachVatTu');
    await fs.promises.mkdir(tmp, { recursive: true });
    p = path.join(tmp, path.basename(abs));
    try { await fs.promises.copyFile(abs, p); } catch (er) { return errText(er); }
  }
  return shell.openPath(p);
});
ipcMain.handle('show-item', (e, abs) => { if (allowed(abs)) shell.showItemInFolder(abs); });
ipcMain.handle('is-dir', async (e, abs) => { try { return (await fs.promises.stat(abs)).isDirectory(); } catch (er) { return false; } });
ipcMain.handle('export', async (e, destParent, folder, entries) => {
  for (const x of entries) if (x.src && !allowed(x.src)) return { errors: [{ path: x.path, msg: 'file ngoài thư mục hồ sơ' }] };
  const dest = path.join(destParent, folder);
  const r = await writeExport(dest, entries);
  shell.openPath(dest);
  return r;
});
ipcMain.handle('config-get', () => readCfg());
ipcMain.handle('config-set', (e, patch) => writeCfg(patch));
ipcMain.handle('app-info', () => ({ version: app.getVersion(), electron: process.versions.electron, userData: app.getPath('userData') }));
