// Bộ định tuyến đơn giản dùng chung giữa các màn hình
export const nav = {
  tab: 'home',
  stack: [],          // các màn hình con: {v:'device',id} | {v:'search'} | {v:'settings'}
  partsNode: 'root',  // nhánh đang xem ở sơ đồ vật tư
  taskFilter: 'open',
  render: () => {},
};
export function go(tab) { nav.tab = tab; nav.stack = []; nav.render(); document.getElementById('view').scrollTop = 0; }
export function push(r) { nav.stack.push(r); nav.render(); document.getElementById('view').scrollTop = 0; }
export function pop() { if (!nav.stack.length) return false; nav.stack.pop(); nav.render(); return true; }
export const cur = () => nav.stack[nav.stack.length - 1] || { v: nav.tab };
