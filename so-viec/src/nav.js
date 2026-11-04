// Điều hướng đơn giản: màn hình chính + chồng màn hình con
export const nav = { stack: [], render: () => {} };
export const cur = () => nav.stack[nav.stack.length - 1] || { v: 'home' };
const view = () => document.getElementById('view');
export function push(r) { nav.stack.push(r); nav.render(); view().scrollTop = 0; }
export function replace(r) { nav.stack[nav.stack.length - 1] = r; nav.render(); }
export function pop() { if (!nav.stack.length) return false; const r = nav.stack.pop(); nav.onLeave && nav.onLeave(r); nav.render(); return true; }
export function home() { while (nav.stack.length) pop(); }
