import { readJSON, writeJSON, notifReschedule } from './platform.js';
import { uid, today, addDays, parseD, fmtD } from './util.js';

export const COLORS = ['#1E6FFF', '#4C9BF5', '#3CC48C', '#F2A33A', '#F0564F', '#B07BF0', '#35C2C9', '#E86FB0'];
export const REASONS = { vattu: 'Chờ vật tư', dungmay: 'Chờ dừng máy', nhathau: 'Chờ nhà thầu', khac: 'Khác' };
export const SEVER = { 1: 'Nặng', 2: 'Trung bình', 3: 'Nhẹ' };
export const STATUS = { todo: 'Chưa làm', doing: 'Đang làm', done: 'Hoàn thành', hold: 'Hoãn' };

function blank() {
  return {
    v: 1, nid: 1,
    tasks: [], devices: [],
    nodes: [
      { id: 'root', parentId: null, name: 'Kho tài liệu', color: '#1E6FFF', codes: '', files: [], links: [] },
      { id: uid(), parentId: 'root', name: 'Máy mài trục', color: '#4C9BF5', codes: '', files: [], links: [] },
      { id: uid(), parentId: 'root', name: 'Trạm thủy lực', color: '#3CC48C', codes: '', files: [], links: [] },
      { id: uid(), parentId: 'root', name: 'Vật tư tiêu hao', color: '#F2A33A', codes: '', files: [], links: [] },
    ],
    notes: [], backlog: [],
    noteCats: [
      { id: 'kt', name: 'Kỹ thuật', color: '#1E6FFF' }, { id: 'qa', name: 'QA vật tư', color: '#3CC48C' },
      { id: 'sc', name: 'Sự cố', color: '#F0564F' }, { id: 'ncc', name: 'Nhà cung cấp', color: '#F2A33A' }, { id: 'cn', name: 'Cá nhân', color: '#B07BF0' },
    ],
    settings: { name: '', remindDays: 2, remindTime: '07:00', dueDay: true, theme: 'dark', backupRemind: true, org: 'CÔNG TY CỔ PHẦN THÉP HÒA PHÁT DUNG QUẤT', dept: '', qaSeq: {} },
  };
}

export const S = { state: blank(), index: {} };

export async function load() {
  const st = await readJSON('db.json', null);
  if (st && st.nodes) S.state = Object.assign(blank(), st, { settings: Object.assign(blank().settings, st.settings || {}) });
  S.index = await readJSON('index.json', {}) || {};
  migrate();
}
function migrate() {
  const st = S.state;
  const r = node('root'); if (r && r.name === 'Kho vật tư') { r.name = 'Kho tài liệu'; }
  if (r && r.color === '#D4B06A') r.color = '#1E6FFF';
  for (const t of st.tasks) { if (!t.status) t.status = t.done ? 'done' : 'todo'; if (t.assignee == null) t.assignee = ''; if (t.result == null) t.result = ''; }
  st.notes = st.notes || []; st.backlog = st.backlog || [];
  if (!st.noteCats || !st.noteCats.length) st.noteCats = blank().noteCats;
  for (const n of st.nodes) for (const f of n.files) if (f.pinned == null) f.pinned = false;
}
let t1 = null;
export function save(opts = {}) {
  clearTimeout(t1);
  t1 = setTimeout(async () => {
    await writeJSON('db.json', S.state);
    if (opts.index) await writeJSON('index.json', S.index);
    reschedule();
  }, 120);
}
export async function saveNow() { clearTimeout(t1); await writeJSON('db.json', S.state); await writeJSON('index.json', S.index); await reschedule(); }

// ---------- tasks ----------
export const task = id => S.state.tasks.find(t => t.id === id);
export function newTask(p) {
  const t = Object.assign({ id: uid(), nid: S.state.nid++, title: '', note: '', priority: 2, due: '', deviceId: '', repeat: null, done: false, doneAt: '', photos: [], createdAt: today(), status: 'todo', assignee: '', result: '' }, p);
  t.nid = S.state.nid - 1; t.status = t.done ? 'done' : (t.status === 'done' ? 'todo' : t.status || 'todo');
  S.state.tasks.push(t); return t;
}
export function completeTask(t) {
  t.done = true; t.doneAt = today(); t.status = 'done';
  let next = null;
  if (t.repeat) {
    const base = t.doneAt;
    next = newTask({ title: t.title, note: t.note, priority: t.priority, deviceId: t.deviceId, assignee: t.assignee, repeat: { ...t.repeat }, due: nextDueFrom(base, t.repeat) });
    t.repeatSpawned = next.id;
  }
  return next;
}
function nextDueFrom(from, r) {
  const d = parseD(from);
  if (r.unit === 'day') d.setDate(d.getDate() + r.n);
  else if (r.unit === 'week') d.setDate(d.getDate() + r.n * 7);
  else { const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + r.n); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); }
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function uncompleteTask(t) {
  t.done = false; t.doneAt = ''; t.status = 'todo';
  if (t.repeatSpawned) {
    const n = task(t.repeatSpawned);
    if (n && !n.done) S.state.tasks = S.state.tasks.filter(x => x.id !== n.id);
    delete t.repeatSpawned;
  }
}
export const openTasks = () => S.state.tasks.filter(t => !t.done);
export function sortTasks(a, b) {
  const da = a.due || '9999', db = b.due || '9999';
  if (da !== db) return da < db ? -1 : 1;
  return a.priority - b.priority;
}

// ---------- tuần (thứ 2 → chủ nhật) ----------
export function weekStart(s) { const d = parseD(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
export function weekNo(s) { const d = parseD(s); d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7); const w1 = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7); }
export const inWeek = (s, ws) => !!s && s >= ws && s <= addDays(ws, 6);

// ---------- tồn đọng ----------
export const bl = id => S.state.backlog.find(b => b.id === id);
export function newBacklog(p) {
  const b = Object.assign({ id: uid(), deviceId: '', desc: '', found: today(), severity: 2, reason: 'vattu', reasonText: '', action: '', parts: '', photos: [], resolved: false, resolvedAt: '', resolveNote: '' }, p);
  S.state.backlog.push(b); return b;
}
export const openBacklog = () => S.state.backlog.filter(b => !b.resolved);

// ---------- file dùng chung (ảnh có thể được nhiều mục tham chiếu) ----------
export function pathInUse(path, except) {
  const st = S.state;
  const inArr = a => (a || []).includes(path);
  if (st.tasks.some(t => t !== except && inArr(t.photos))) return true;
  if (st.backlog.some(b => b !== except && inArr(b.photos))) return true;
  if (st.notes.some(n => n !== except && n.blocks.some(k => k.t === 'img' && inArr(k.photos)))) return true;
  return st.nodes.some(n => n.files.some(f => f.path === path));
}

// ---------- devices ----------
export const device = id => S.state.devices.find(d => d.id === id);

// ---------- nodes ----------
export const node = id => S.state.nodes.find(n => n.id === id);
export const kids = id => S.state.nodes.filter(n => n.parentId === id);
export function pathTo(id) { const p = []; let n = node(id); while (n) { p.unshift(n); n = node(n.parentId); } return p; }
export function descendants(id) { const out = []; const walk = pid => kids(pid).forEach(k => { out.push(k); walk(k.id); }); walk(id); return out; }
export function flatNodes() { const out = []; const walk = (pid, d) => kids(pid).forEach(k => { out.push({ n: k, d }); walk(k.id, d + 1); }); const r = node('root'); out.push({ n: r, d: 0 }); walk('root', 1); return out; }

// ---------- notifications ----------
export async function reschedule() {
  const st = S.state.settings; const [hh, mm] = (st.remindTime || '07:00').split(':').map(Number);
  const now = Date.now(); const list = [];
  const at = s => { const d = parseD(s); d.setHours(hh, mm, 0, 0); return d; };
  for (const t of openTasks()) {
    if (!t.due) continue;
    const pr = ['', 'Ưu tiên 1 · KHẨN', 'Ưu tiên 2', 'Ưu tiên 3'][t.priority];
    const dev = device(t.deviceId);
    const r1 = at(addDays(t.due, -Number(st.remindDays || 2)));
    if (r1.getTime() > now) list.push({ id: t.nid * 2, at: r1, title: `⏰ Còn ${st.remindDays} ngày: ${t.title}`, body: `${pr}${dev ? ' · ' + dev.name : ''} · Hạn ${fmtD(t.due)}`, extra: { taskId: t.id } });
    if (st.dueDay) { const r2 = at(t.due); if (r2.getTime() > now) list.push({ id: t.nid * 2 + 1, at: r2, title: `🔔 Hôm nay đến hạn: ${t.title}`, body: `${pr}${dev ? ' · ' + dev.name : ''}`, extra: { taskId: t.id } }); }
  }
  list.sort((a, b) => a.at - b.at);
  if (st.backupRemind !== false) list.unshift({ id: 900001, on: { weekday: 2, hour: 8, minute: 0 }, title: '💾 Nhắc sao lưu dữ liệu', body: 'Đầu tuần rồi – vào Cài đặt › Sao lưu để gửi bản sao lên OneDrive/Zalo.', extra: { go: 'backup' } });
  await notifReschedule(list);
}
