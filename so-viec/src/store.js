// Lưu trữ: IndexedDB (ghi chú, ảnh, cài đặt) – hoạt động offline hoàn toàn
import { uid, today, parseTags, normTag, CHK_RE, isChecked, fold } from './util.js';
import { DEFAULT_TEMPLATES, DEFAULT_SHIFTS } from './templates.js';

const DB = 'soviec', VER = 1;
let db = null;
export const S = { notes: [], templates: [], settings: {}, filters: [] };
const DEF_SETTINGS = { name: '', theme: 'auto', shifts: DEFAULT_SHIFTS, view: 'list', recentTpl: [] };

function openDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('notes')) d.createObjectStore('notes', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos');
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function tx(store, mode, fn) {
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode); const s = t.objectStore(store); let out;
    const r = fn(s); if (r && 'onsuccess' in r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
const kvGet = k => tx('kv', 'readonly', s => s.get(k));
export const saveKV = k => tx('kv', 'readwrite', s => s.put(JSON.parse(JSON.stringify(S[k])), k));

export async function load() {
  db = await openDb();
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
  S.notes = (await tx('notes', 'readonly', s => s.getAll())) || [];
  S.templates = (await kvGet('templates')) || DEFAULT_TEMPLATES.map(t => ({ ...t, builtin: true }));
  S.settings = Object.assign({}, DEF_SETTINGS, (await kvGet('settings')) || {});
  S.filters = (await kvGet('filters')) || [];
  // thùng rác: tự xóa hẳn sau 30 ngày
  const lim = Date.now() - 30 * 864e5;
  for (const n of S.notes.filter(n => n.deleted && Date.parse(n.deleted) < lim)) await purgeNote(n);
}

// ---------- ghi chú ----------
export const note = id => S.notes.find(n => n.id === id);
export const alive = () => S.notes.filter(n => !n.deleted);
export function newNote(p = {}) {
  const now = new Date().toISOString();
  const n = Object.assign({ id: uid(), title: '', body: '', tags: [], status: '', pinned: false, date: today(), photos: [], created: now, updated: now, deleted: null, tpl: '' }, p);
  n.tags = (n.tags || []).map(normTag).filter(Boolean);
  S.notes.unshift(n); return n;
}
const dirty = new Set(); let saveT = null;
export function touch(n, keepTime) {
  if (!keepTime) n.updated = new Date().toISOString();
  n._f = null; dirty.add(n.id);
  clearTimeout(saveT); saveT = setTimeout(flush, 350);
}
export async function flush() {
  clearTimeout(saveT); const ids = [...dirty]; dirty.clear();
  if (!ids.length) return;
  const list = ids.map(note).filter(Boolean).map(clean);
  await tx('notes', 'readwrite', s => { list.forEach(n => s.put(n)); });
}
const clean = n => { const o = { ...n }; delete o._f; return o; };
export async function purgeNote(n) {
  for (const p of n.photos || []) await delPhoto(p);
  S.notes = S.notes.filter(x => x !== n);
  await tx('notes', 'readwrite', s => s.delete(n.id));
}
export const isEmpty = n => !n.title.trim() && !n.body.trim() && !(n.photos || []).length;

// thẻ của ghi chú = thẻ gắn tay + #thẻ viết trong nội dung
export function tagsOf(n) {
  const out = [...(n.tags || [])];
  for (const t of parseTags(n.title + '\n' + n.body)) if (!out.includes(t)) out.push(t);
  return out;
}
export function progress(n) {
  let done = 0, total = 0;
  for (const l of n.body.split('\n')) { const m = l.match(CHK_RE); if (m && l.slice(m[0].length).trim()) { total++; if (isChecked(m[2])) done++; } }
  return { done, total };
}
// văn bản đã bỏ dấu (để tìm), lưu tạm theo lần sửa
export function folded(n) { if (!n._f) n._f = fold([n.title, n.body, tagsOf(n).map(t => '#' + t).join(' ')].join('\n')); return n._f; }
export function allTags() {
  const m = new Map();
  for (const n of alive()) for (const t of tagsOf(n)) m.set(t, (m.get(t) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'vi'));
}

// ---------- ảnh ----------
const urls = new Map();
export const putPhoto = (id, blob) => tx('photos', 'readwrite', s => s.put(blob, id));
export const getPhoto = id => tx('photos', 'readonly', s => s.get(id));
export async function delPhoto(id) { const u = urls.get(id); if (u) { URL.revokeObjectURL(u); urls.delete(id); } await tx('photos', 'readwrite', s => s.delete(id)); }
export async function photoUrl(id) {
  if (urls.has(id)) return urls.get(id);
  const b = await getPhoto(id); if (!b) return '';
  const u = URL.createObjectURL(b); urls.set(id, u); return u;
}
// thu nhỏ ảnh còn tối đa 1600px, JPEG ~ 200–400KB
export async function addPhotoBlob(blob) {
  let out = blob;
  try {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close && bmp.close();
    out = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8)) || blob;
  } catch (e) { /* giữ nguyên ảnh gốc */ }
  const id = 'p' + uid(); await putPhoto(id, out); return id;
}

// ---------- sao lưu / khôi phục ----------
const b64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(blob); });
export async function exportAll(onStep) {
  await flush();
  const photos = {}; const ids = S.notes.flatMap(n => n.photos || []);
  let i = 0;
  for (const id of ids) { const b = await getPhoto(id); if (b) photos[id] = await b64(b); onStep && onStep(++i, ids.length); }
  return JSON.stringify({ app: 'so-viec', ver: 1, at: new Date().toISOString(), notes: S.notes.map(clean), templates: S.templates, settings: S.settings, filters: S.filters, photos });
}
export async function importAll(text, mode) {
  const d = JSON.parse(text);
  if (d.app !== 'so-viec' || !Array.isArray(d.notes)) throw new Error('File không phải bản sao lưu của Sổ Việc');
  if (mode === 'replace') { for (const n of [...S.notes]) await purgeNote(n); }
  let added = 0, updated = 0;
  for (const n of d.notes) {
    const cur = note(n.id);
    if (cur && cur.updated >= n.updated) continue;
    for (const p of n.photos || []) if (d.photos && d.photos[p]) { const blob = await (await fetch(d.photos[p])).blob(); await putPhoto(p, blob); }
    if (cur) { Object.assign(cur, n); cur._f = null; updated++; } else { S.notes.push(n); added++; }
    await tx('notes', 'readwrite', s => s.put(clean(n)));
  }
  if (mode === 'replace') { S.templates = d.templates || S.templates; S.settings = Object.assign({}, DEF_SETTINGS, d.settings || {}); S.filters = d.filters || []; }
  else {
    for (const t of d.templates || []) if (!S.templates.some(x => x.id === t.id)) S.templates.push(t);
    for (const f of d.filters || []) if (!S.filters.some(x => x.id === f.id)) S.filters.push(f);
  }
  await saveKV('templates'); await saveKV('settings'); await saveKV('filters');
  return { added, updated };
}
