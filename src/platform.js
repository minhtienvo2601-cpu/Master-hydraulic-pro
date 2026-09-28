// Lớp nền tảng: chạy thật trên Android (Capacitor) hoặc chạy thử trên trình duyệt.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Camera } from '@capacitor/camera';
import { Share } from '@capacitor/share';
import { AppLauncher } from '@capacitor/app-launcher';
import { App } from '@capacitor/app';
import { FileOpener } from '@capacitor-community/file-opener';

import { idbGet, idbPut, idbDel, mimeOf } from './webstore.js';

export const native = Capacitor.isNativePlatform();
const webFiles = new Map(); // bản máy tính: đường dẫn -> objectURL (dữ liệu thật nằm trong IndexedDB)
function webSet(path, blob) { const o = webFiles.get(path); if (o && o.startsWith('blob:')) URL.revokeObjectURL(o); const u = URL.createObjectURL(blob); webFiles.set(path, u); return u; }
async function webBlob(path) {
  try { const b = await idbGet('files', path); if (b) return b; } catch (e) {}
  const u = webFiles.get(path); if (u) return await (await fetch(u)).blob();
  return null;
}

// ---------- JSON store ----------
export async function readJSON(name, fallback) {
  try {
    if (native) {
      const r = await Filesystem.readFile({ path: name, directory: Directory.Data, encoding: 'utf8' });
      return JSON.parse(r.data);
    }
    try { const v = await idbGet('kv', name); if (v != null) return JSON.parse(v); } catch (e) {}
    const s = localStorage.getItem('bt_' + name); // dữ liệu cũ / chạy thử
    return s ? JSON.parse(s) : fallback;
  } catch (e) { return fallback; }
}
export async function writeJSON(name, obj) {
  const data = JSON.stringify(obj);
  if (native) {
    // ghi file tạm rồi đổi tên để tránh hỏng dữ liệu khi đang ghi thì tắt app
    await Filesystem.writeFile({ path: name + '.tmp', directory: Directory.Data, encoding: 'utf8', data });
    try { await Filesystem.deleteFile({ path: name, directory: Directory.Data }); } catch (e) {}
    await Filesystem.rename({ from: name + '.tmp', to: name, directory: Directory.Data, toDirectory: Directory.Data });
  } else {
    try { await idbPut('kv', name, data); }
    catch (e) { try { localStorage.setItem('bt_' + name, data); } catch (e2) {} }
  }
}

// ---------- files ----------
const CHUNK = 3 * 1024 * 1024; // bội số của 3 để nối base64 an toàn
function blobToB64(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1] || '');
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
}
export async function saveBlob(path, blob, onProgress) {
  if (!native) { await idbPut('files', path, blob); webSet(path, blob); return; }
  await Filesystem.mkdir({ path: path.split('/').slice(0, -1).join('/'), directory: Directory.Data, recursive: true }).catch(() => {});
  if (blob.size === 0) { await Filesystem.writeFile({ path, directory: Directory.Data, data: '' }); return; }
  for (let off = 0; off < blob.size; off += CHUNK) {
    const b64 = await blobToB64(blob.slice(off, off + CHUNK));
    if (off === 0) await Filesystem.writeFile({ path, directory: Directory.Data, data: b64 });
    else await Filesystem.appendFile({ path, directory: Directory.Data, data: b64 });
    onProgress && onProgress(Math.min(1, (off + CHUNK) / blob.size));
  }
}
export async function saveB64(path, b64) {
  if (!native) { const blob = new Blob([b64ToBytes(b64)], { type: mimeOf(path) }); await idbPut('files', path, blob); webSet(path, blob); return; }
  await Filesystem.mkdir({ path: path.split('/').slice(0, -1).join('/'), directory: Directory.Data, recursive: true }).catch(() => {});
  await Filesystem.writeFile({ path, directory: Directory.Data, data: b64 });
}
export async function readB64(path) {
  if (!native) {
    const b = await webBlob(path); return b ? blobToB64(b) : null;
  }
  const r = await Filesystem.readFile({ path, directory: Directory.Data });
  return typeof r.data === 'string' ? r.data : await blobToB64(r.data);
}
export async function deletePath(path) {
  if (!native) { const o = webFiles.get(path); if (o && o.startsWith('blob:')) URL.revokeObjectURL(o); webFiles.delete(path); try { await idbDel('files', path); } catch (e) {} return; }
  try { await Filesystem.deleteFile({ path, directory: Directory.Data }); } catch (e) {}
}
const uriCache = new Map();
export async function fileSrc(path) {
  if (!native) { if (webFiles.has(path)) return webFiles.get(path); const b = await webBlob(path); return b ? webSet(path, b) : ''; }
  if (uriCache.has(path)) return uriCache.get(path);
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Data });
  const s = Capacitor.convertFileSrc(uri); uriCache.set(path, s); return s;
}
export async function openFile(path, mime, name) {
  if (!native) {
    const u = await fileSrc(path); if (!u) throw new Error('Không tìm thấy file');
    const a = document.createElement('a'); a.href = u; a.download = name || 'file'; a.click();
    return;
  }
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Data });
  await FileOpener.open({ filePath: uri, contentType: mime || 'application/octet-stream', openWithDefault: true });
}
export async function openUrl(url) {
  if (!native) { window.open(url, '_blank'); return; }
  try { await AppLauncher.openUrl({ url }); } catch (e) { window.open(url, '_system'); }
}

// ---------- camera ----------
// Lưu 1 ảnh (Blob) vào bộ nhớ app, trả về đường dẫn
async function storePhoto(blob, uid) { const p = `photos/${uid}.jpg`; await saveBlob(p, blob); return p; }
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
// Chụp ảnh liên tục: sau mỗi tấm tự mở lại camera, bấm Quay lại để dừng. onEach(path) gọi sau mỗi tấm.
export async function capturePhotos(onEach, max = 30) {
  const out = [];
  if (!native) { const fs = await pickFiles('image/*', max > 1); for (const f of fs.slice(0, max)) { const p = await storePhoto(f, rid()); out.push(p); onEach && onEach(p); } return out; }
  for (let i = 0; i < max; i++) {
    let r;
    try { r = await Camera.takePhoto({ quality: 72, targetWidth: 1600, targetHeight: 1600, correctOrientation: true, saveToGallery: false }); }
    catch (e) { break; } // người dùng bấm Quay lại / hủy
    if (!r || !r.webPath) break;
    const blob = await (await fetch(r.webPath)).blob();
    const p = await storePhoto(blob, rid()); out.push(p); onEach && onEach(p);
  }
  return out;
}
// Chọn nhiều ảnh từ thư viện cùng lúc
export async function pickPhotos(onEach, max = 0) {
  const out = [];
  if (!native) { const fs = await pickFiles('image/*', max !== 1); for (const f of (max ? fs.slice(0, max) : fs)) { const p = await storePhoto(f, rid()); out.push(p); onEach && onEach(p); } return out; }
  let res;
  try { res = await Camera.chooseFromGallery({ allowMultipleSelection: max !== 1, limit: max, quality: 72, targetWidth: 1600, targetHeight: 1600, correctOrientation: true }); }
  catch (e) { return out; }
  for (const r of (res && res.results) || []) {
    try { const blob = await (await fetch(r.webPath)).blob(); const p = await storePhoto(blob, rid()); out.push(p); onEach && onEach(p); } catch (e) { console.warn(e); }
  }
  return out;
}

// ---------- file picker ----------
export function pickFiles(accept = '*/*', multiple = true) {
  return new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = multiple;
    i.style.display = 'none'; document.body.appendChild(i);
    i.onchange = () => { res([...i.files]); i.remove(); };
    window.addEventListener('focus', () => setTimeout(() => { if (!i.files || !i.files.length) { res([]); i.remove(); } }, 1500), { once: true });
    i.click();
  });
}

// ---------- đọc từng đoạn file (plugin riêng của app, dùng cho PDF lớn) ----------
const FileRange = registerPlugin('FileRange');
// trả về kích thước file (byte) hoặc null nếu bản app cũ chưa có plugin
export async function rangeSize(path) {
  if (!native) return null;
  try { const r = await FileRange.size({ path }); const n = +r.size; return n > 0 ? n : null; } catch (e) { return null; }
}
export async function rangeRead(path, offset, length) {
  const r = await FileRange.read({ path, offset: String(offset), length: String(length) });
  return b64ToBytes(r.data || '');
}

// ---------- đọc chữ trên ảnh (ML Kit, chỉ có trên điện thoại) ----------
const TextOcr = registerPlugin('TextOcr');
export const ocrAvailable = native || !!globalThis.__ocrMock; // __ocrMock: chỉ dùng khi chạy thử trên máy tính
export async function ocrPhoto(path) {
  if (globalThis.__ocrMock) return globalThis.__ocrMock(path);
  const r = await TextOcr.recognize({ path }); return { text: r.text || '', lines: r.lines || [] };
}

// ---------- share / export ----------
// Chia sẻ (Zalo, Drive, Gmail…) từ dữ liệu base64
export async function shareFile(name, b64, mime) {
  if (!native) { await webShare(name, new Blob([b64ToBytes(b64)], { type: mime || mimeOf(name) })); return; }
  await Filesystem.writeFile({ path: name, directory: Directory.Cache, data: b64 });
  const { uri } = await Filesystem.getUri({ path: name, directory: Directory.Cache });
  await Share.share({ title: name, files: [uri], dialogTitle: 'Chia sẻ / gửi file' });
}
function downloadBlob(name, blob) {
  const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 30000);
}
// Máy tính: dùng khung chia sẻ của Windows nếu có, không thì tải file về
async function webShare(name, blob) {
  const file = new File([blob], name, { type: blob.type || mimeOf(name) });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  downloadBlob(name, blob);
}
// Lưu thẳng vào bộ nhớ máy: Documents/BaoTriThuyLuc/<tên file>. Trả về đường dẫn để báo cho người dùng.
export const SAVE_DIR = 'BaoTriThuyLuc';
export async function saveToDevice(name, b64, mime) {
  if (!native) {
    const blob = new Blob([b64ToBytes(b64)], { type: mime || mimeOf(name) });
    if (window.showSaveFilePicker) { // Chrome/Edge trên máy tính: hộp thoại "Lưu thành…"
      const ext = (name.match(/\.[^.]+$/) || [''])[0];
      const h = await window.showSaveFilePicker({ suggestedName: name, types: ext ? [{ description: 'File ' + ext.slice(1).toUpperCase(), accept: { [blob.type || 'application/octet-stream']: [ext] } }] : undefined });
      const w = await h.createWritable(); await w.write(blob); await w.close();
      return h.name;
    }
    downloadBlob(name, blob); return 'thư mục Tải về (Downloads)';
  }
  let nm = name, err;
  for (let k = 2; k < 30; k++) {
    try {
      await Filesystem.writeFile({ path: `${SAVE_DIR}/${nm}`, directory: Directory.Documents, data: b64, recursive: true });
      return `Documents/${SAVE_DIR}/${nm}`;
    } catch (e) {
      err = e;
      if (/permission|denied/i.test(String(e && e.message)) && k > 3) break;
      nm = name.replace(/(\.[^.]*)?$/, m => ` (${k})` + m); // trùng tên với file cũ không ghi đè được → đặt tên mới
    }
  }
  throw err;
}
// File xuất tạm để xem trước (xóa khi mở app lần sau)
export async function writeExport(name, b64) {
  const path = `exports/${name}`;
  if (!native) { webSet(path, new Blob([b64ToBytes(b64)], { type: mimeOf(name) })); return path; }
  await Filesystem.writeFile({ path, directory: Directory.Data, data: b64, recursive: true });
  return path;
}
export async function clearExports() {
  if (!native) return;
  try { await Filesystem.rmdir({ path: 'exports', directory: Directory.Data, recursive: true }); } catch (e) {}
}
// Đọc file trong bộ nhớ app thành ArrayBuffer (dùng cho trình xem)
export async function readBytes(path) {
  const src = await fileSrc(path);
  if (src) { try { const r = await fetch(src); if (r.ok) return await r.arrayBuffer(); } catch (e) {} }
  const b64 = await readB64(path); if (b64 == null) throw new Error('Không đọc được file');
  return b64ToBytes(b64).buffer;
}
export function b64ToBytes(b64) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
export async function sharePath(path, name, mime) {
  if (!native) { const b = await webBlob(path); if (b) await webShare(name, b); return; }
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Data });
  await Share.share({ title: name, files: [uri], dialogTitle: 'Chia sẻ / gửi file' });
}

// ---------- notifications ----------
export async function notifInit(onTap) {
  if (!native) return;
  try {
    let p = await LocalNotifications.checkPermissions();
    if (p.display !== 'granted') p = await LocalNotifications.requestPermissions();
    await LocalNotifications.createChannel({ id: 'nhacviec', name: 'Nhắc việc bảo trì', description: 'Nhắc công việc sắp đến hạn', importance: 5, visibility: 1, vibration: true });
    LocalNotifications.addListener('localNotificationActionPerformed', ev => onTap && onTap(ev.notification.extra || {}));
  } catch (e) { console.warn(e); }
}
export async function exactAlarmStatus() {
  if (!native) return 'granted';
  try { const r = await LocalNotifications.checkExactNotificationSetting(); return r.exact_alarm; } catch (e) { return 'granted'; }
}
export async function openExactAlarmSetting() {
  if (!native) return;
  try { await LocalNotifications.changeExactNotificationSetting(); } catch (e) {}
}
export async function notifReschedule(list) {
  if (!native) return;
  try {
    const pend = await LocalNotifications.getPending();
    if (pend.notifications.length) await LocalNotifications.cancel({ notifications: pend.notifications.map(n => ({ id: n.id })) });
    if (!list.length) return;
    await LocalNotifications.schedule({
      notifications: list.slice(0, 400).map(n => ({
        id: n.id, title: n.title, body: n.body, channelId: 'nhacviec', smallIcon: 'ic_stat_notify', iconColor: '#1E6FFF',
        schedule: n.on ? { on: n.on, allowWhileIdle: true } : { at: n.at, allowWhileIdle: true }, extra: n.extra,
      })),
    });
  } catch (e) { console.warn('notif', e); }
}
export async function testNotif() {
  if (!native) return false;
  await LocalNotifications.schedule({ notifications: [{ id: 999999, title: 'Thông báo thử', body: 'Nhắc việc đang hoạt động bình thường ✔', channelId: 'nhacviec', smallIcon: 'ic_stat_notify', schedule: { at: new Date(Date.now() + 3000), allowWhileIdle: true } }] });
  return true;
}

// ---------- back button ----------
export function onBack(fn) {
  if (!native) return;
  App.addListener('backButton', () => { if (!fn()) App.minimizeApp(); });
}
