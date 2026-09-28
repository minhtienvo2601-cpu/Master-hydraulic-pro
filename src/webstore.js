// Kho lưu trữ cho bản máy tính (chạy trên Chrome/Edge): dùng IndexedDB của trình duyệt.
// kv    : dữ liệu JSON (db.json, index.json, viewer.json)
// files : ảnh, tài liệu, logo… (Blob) theo đường dẫn giống bản điện thoại
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open('baotri', 1);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv'); if (!d.objectStoreNames.contains('files')) d.createObjectStore('files'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => { dbp = null; rej(r.error); };
  });
  return dbp;
}
function tx(store, mode, fn) {
  return db().then(d => new Promise((res, rej) => {
    const t = d.transaction(store, mode); const req = fn(t.objectStore(store));
    t.oncomplete = () => res(req ? req.result : undefined);
    t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  }));
}
export const idbGet = (store, k) => tx(store, 'readonly', s => s.get(k));
export const idbPut = (store, k, v) => tx(store, 'readwrite', s => s.put(v, k));
export const idbDel = (store, k) => tx(store, 'readwrite', s => s.delete(k));
export const idbKeys = store => tx(store, 'readonly', s => s.getAllKeys());

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel', doc: 'application/msword', zip: 'application/zip', txt: 'text/plain', csv: 'text/csv', dwg: 'application/acad' };
export const mimeOf = name => MIME[(String(name).toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1]] || 'application/octet-stream';

// Xin trình duyệt giữ dữ liệu lâu dài (không tự xóa khi ổ đầy)
export async function persist() { try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) {} return false; }
export async function usage() { try { const e = await navigator.storage.estimate(); return e; } catch (e) { return null; } }
