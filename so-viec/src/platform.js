// Phần riêng cho điện thoại (Capacitor) – trên trình duyệt máy tính dùng cách thay thế
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Camera } from '@capacitor/camera';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export const native = Capacitor.isNativePlatform();

export function onBack(fn) {
  if (native) App.addListener('backButton', () => { if (!fn()) App.minimizeApp(); });
  else window.addEventListener('keydown', e => { if (e.key === 'Escape') fn(); });
}
export function onPause(fn) {
  if (native) App.addListener('pause', fn);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') fn(); });
}
export function setBars(theme) {
  if (native) SystemBars.setStyle({ style: theme === 'light' ? SystemBarsStyle.Light : SystemBarsStyle.Dark }).catch(() => {});
}

// chọn file bằng hộp chọn của hệ thống
export function pickFiles(accept, multiple) {
  return new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = !!multiple;
    i.style.display = 'none'; document.body.append(i);
    i.onchange = () => { res([...i.files]); i.remove(); };
    window.addEventListener('focus', () => setTimeout(() => { if (!i.files || !i.files.length) { res([]); i.remove(); } }, 800), { once: true });
    i.click();
  });
}

// trả về danh sách Blob ảnh
export async function takePhoto() {
  if (!native) return pickFiles('image/*', false);
  try {
    const r = await Camera.takePhoto({ quality: 80, targetWidth: 1600, targetHeight: 1600, correctOrientation: true, saveToGallery: false });
    if (!r || !r.webPath) return [];
    return [await (await fetch(r.webPath)).blob()];
  } catch (e) { return []; }
}
export async function pickPhotos() {
  if (!native) return pickFiles('image/*', true);
  try {
    const res = await Camera.chooseFromGallery({ allowMultipleSelection: true, limit: 0, quality: 80, targetWidth: 1600, targetHeight: 1600, correctOrientation: true });
    const out = [];
    for (const r of (res && res.results) || []) { try { out.push(await (await fetch(r.webPath)).blob()); } catch (e) {} }
    return out;
  } catch (e) { return []; }
}

// chia sẻ văn bản (Zalo, Messenger, email…); máy tính: chép vào bộ nhớ tạm
export async function shareText(title, text) {
  if (native) { await Share.share({ title, text, dialogTitle: 'Gửi ghi chú' }); return 'shared'; }
  if (navigator.share) { try { await navigator.share({ title, text }); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'cancel'; } }
  await navigator.clipboard.writeText(text); return 'copied';
}

// lưu/gửi file văn bản (bản sao lưu)
export async function shareFile(name, text, mime = 'application/json') {
  if (native) {
    await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    const { uri } = await Filesystem.getUri({ path: name, directory: Directory.Cache });
    await Share.share({ title: name, files: [uri], dialogTitle: 'Lưu / gửi bản sao lưu' });
    return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name;
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
