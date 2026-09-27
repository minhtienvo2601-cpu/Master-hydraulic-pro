// Lớp nền tảng: chạy thật trên Android (Capacitor) hoặc chạy thử trên trình duyệt.
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Share } from '@capacitor/share';
import { AppLauncher } from '@capacitor/app-launcher';
import { App } from '@capacitor/app';
import { FileOpener } from '@capacitor-community/file-opener';

export const native = Capacitor.isNativePlatform();
const webFiles = new Map(); // chạy thử: id -> objectURL

// ---------- JSON store ----------
export async function readJSON(name, fallback) {
  try {
    if (native) {
      const r = await Filesystem.readFile({ path: name, directory: Directory.Data, encoding: 'utf8' });
      return JSON.parse(r.data);
    }
    const s = localStorage.getItem('bt_' + name);
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
    try { localStorage.setItem('bt_' + name, data); } catch (e) {}
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
  if (!native) { webFiles.set(path, URL.createObjectURL(blob)); return; }
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
  if (!native) { webFiles.set(path, 'data:image/jpeg;base64,' + b64); return; }
  await Filesystem.mkdir({ path: path.split('/').slice(0, -1).join('/'), directory: Directory.Data, recursive: true }).catch(() => {});
  await Filesystem.writeFile({ path, directory: Directory.Data, data: b64 });
}
export async function readB64(path) {
  if (!native) {
    const u = webFiles.get(path); if (!u) return null;
    const b = await (await fetch(u)).blob(); return blobToB64(b);
  }
  const r = await Filesystem.readFile({ path, directory: Directory.Data });
  return typeof r.data === 'string' ? r.data : await blobToB64(r.data);
}
export async function deletePath(path) {
  if (!native) { webFiles.delete(path); return; }
  try { await Filesystem.deleteFile({ path, directory: Directory.Data }); } catch (e) {}
}
const uriCache = new Map();
export async function fileSrc(path) {
  if (!native) return webFiles.get(path) || '';
  if (uriCache.has(path)) return uriCache.get(path);
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Data });
  const s = Capacitor.convertFileSrc(uri); uriCache.set(path, s); return s;
}
export async function openFile(path, mime, name) {
  if (!native) {
    const u = webFiles.get(path);
    if (u) { const a = document.createElement('a'); a.href = u; a.download = name || 'file'; a.target = '_blank'; a.click(); }
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
export async function takePhoto() {
  if (native) {
    const p = await Camera.getPhoto({ resultType: CameraResultType.Base64, source: CameraSource.Prompt, quality: 72, width: 1600, correctOrientation: true,
      promptLabelHeader: 'Thêm ảnh', promptLabelPhoto: 'Chọn từ thư viện', promptLabelPicture: 'Chụp ảnh mới', promptLabelCancel: 'Hủy' });
    return p.base64String;
  }
  const f = await pickFiles('image/*', false); if (!f[0]) return null;
  return blobToB64(f[0]);
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

// ---------- share / export ----------
export async function shareFile(name, b64, mime) {
  if (!native) {
    const a = document.createElement('a'); a.href = 'data:' + mime + ';base64,' + b64; a.download = name; a.click(); return;
  }
  await Filesystem.writeFile({ path: name, directory: Directory.Cache, data: b64 });
  const { uri } = await Filesystem.getUri({ path: name, directory: Directory.Cache });
  await Share.share({ title: name, files: [uri], dialogTitle: 'Lưu / gửi file sao lưu' });
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
