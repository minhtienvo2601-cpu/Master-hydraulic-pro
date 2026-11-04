// Các trang phụ: Thẻ, Mẫu, Thùng rác, Sao lưu, Cài đặt
import { S, alive, touch, tagsOf, allTags, saveKV, purgeNote, exportAll, importAll, flush } from './store.js';
import { nav, push, pop, home } from './nav.js';
import { setF } from './filter.js';
import { DEFAULT_TEMPLATES, DEFAULT_SHIFTS, currentShift, fillVars } from './templates.js';
import { createFrom } from './actions.js';
import { openSheet, menu, toast, promptBox, confirmBox, busy } from './ui.js';
import { shareFile, pickFiles } from './platform.js';
import { $, $$, esc, uid, normTag, today, whenLabel, parseTags } from './util.js';
import { ic } from './icons.js';

// ---------- Thẻ ----------
export function viewTags(v) {
  const tags = allTags();
  v.innerHTML = `<div class="fade-in">
    <p class="help">Bấm vào thẻ để xem các ghi chú có thẻ đó. Bấm <b>⋯</b> để đổi tên, gộp hoặc xóa thẻ trên mọi ghi chú.</p>
    ${tags.length ? `<div class="set-group">${tags.map(([t, c]) => `<div class="set-row" data-t="${esc(t)}"><span class="ic">${ic('hash')}</span><div class="grow tt">${esc(t)}</div><span class="badge">${c}</span><button class="more" data-m="${esc(t)}" aria-label="Tùy chọn thẻ">${ic('dots')}</button></div>`).join('')}</div>`
      : `<div class="empty">${ic('hash')}<div>Chưa có thẻ nào.</div><small>Gõ <b>#tên-thẻ</b> trong ghi chú (VD: #bơm, #ca-đêm, #máy-ép-2) hoặc bấm “+ Thẻ” khi soạn.</small></div>`}
  </div>`;
  $$('[data-t]', v).forEach(el => el.onclick = e => { if (e.target.closest('[data-m]')) return; setF({ tags: [el.dataset.t] }); home(); });
  $$('[data-m]', v).forEach(b => b.onclick = () => tagMenu(b.dataset.m));
}
function tagMenu(t) {
  menu('#' + t, [
    { icon: 'edit', label: 'Đổi tên / gộp vào thẻ khác', run: async () => {
      const nn = normTag(await promptBox('Đổi tên thẻ', 'Tên mới', t, { help: 'Nếu tên mới trùng thẻ đã có, hai thẻ sẽ được gộp làm một.' }) || '');
      if (!nn || nn === t) return; const k = renameTag(t, nn); toast(`Đã đổi ở ${k} ghi chú`); nav.render();
    } },
    { icon: 'trash', label: 'Xóa thẻ khỏi mọi ghi chú', danger: true, run: async () => {
      if (!await confirmBox('Xóa thẻ?', `Bỏ #${esc(t)} khỏi các ghi chú (chữ trong nội dung vẫn giữ, chỉ bỏ dấu #). Ghi chú không bị xóa.`, 'Xóa thẻ', true)) return;
      const k = renameTag(t, null); toast(`Đã bỏ thẻ ở ${k} ghi chú`); nav.render();
    } },
  ]);
}
// đổi #cũ → #mới trong cả thẻ gắn tay lẫn chữ trong nội dung (null = bỏ thẻ)
function renameTag(from, to) {
  let k = 0;
  const re = new RegExp(`(^|[\\s(,;])#(${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![\\p{L}\\p{N}_\\-])`, 'giu');
  for (const n of alive()) {
    if (!tagsOf(n).includes(from)) continue;
    n.tags = n.tags.filter(x => x !== from); if (to && !n.tags.includes(to)) n.tags.push(to);
    const rep = (s) => s.replace(re, (m, a, b) => a + (to ? '#' + to : b));
    n.title = rep(n.title); n.body = rep(n.body);
    if (to && parseTags(n.title + '\n' + n.body).includes(to)) n.tags = n.tags.filter(x => x !== to);
    touch(n, true); k++;
  }
  return k;
}

// ---------- Mẫu ----------
export function viewTemplates(v) {
  v.innerHTML = `<div class="fade-in">
    <p class="help">Mẫu giúp ghi nhanh các việc lặp lại. Biến <b>{ngày} {giờ} {người} {ca} {thứ}</b> được điền tự động khi tạo ghi chú.</p>
    <div class="set-group">${S.templates.map(t => `<div class="set-row" data-t="${t.id}"><span class="emo">${esc(t.icon || '📝')}</span><div class="grow"><div class="tt">${esc(t.name)}</div><div class="st2">${esc(fillVars(t.title, S.settings) || '—')}</div></div><button class="more" data-use="${t.id}" aria-label="Dùng mẫu">${ic('plus')}</button></div>`).join('')}</div>
    <button class="btn pri" id="tNew">${ic('plus')} Tạo mẫu mới</button>
    <button class="btn sec" id="tReset">${ic('restore')} Khôi phục các mẫu dựng sẵn</button>
  </div>`;
  $$('[data-t]', v).forEach(el => el.onclick = e => { if (e.target.closest('[data-use]')) return; push({ v: 'tpl', id: el.dataset.t }); });
  $$('[data-use]', v).forEach(b => b.onclick = () => createFrom(S.templates.find(t => t.id === b.dataset.use)));
  $('#tNew', v).onclick = async () => {
    const t = { id: uid(), icon: '📝', name: 'Mẫu mới', title: '{ngày} – ', body: '', tags: [], status: '' };
    S.templates.push(t); await saveKV('templates'); push({ v: 'tpl', id: t.id });
  };
  $('#tReset', v).onclick = async () => {
    let k = 0; for (const d of DEFAULT_TEMPLATES) if (!S.templates.some(t => t.id === d.id)) { S.templates.push({ ...d, builtin: true }); k++; }
    await saveKV('templates'); nav.render(); toast(k ? `Đã thêm lại ${k} mẫu` : 'Các mẫu dựng sẵn vẫn còn đủ');
  };
}
export function viewTemplate(v, id) {
  const t = S.templates.find(x => x.id === id); if (!t) { pop(); return; }
  const save = () => saveKV('templates');
  v.innerHTML = `<div class="fade-in">
    <div class="row2"><label class="field" style="width:76px"><span class="lb">Biểu tượng</span><input class="inp center" id="tIc" value="${esc(t.icon || '')}" maxlength="4"></label>
      <label class="field grow"><span class="lb">Tên mẫu</span><input class="inp" id="tNm" value="${esc(t.name)}"></label></div>
    <label class="field"><span class="lb">Tiêu đề ghi chú</span><input class="inp" id="tTi" value="${esc(t.title)}" placeholder="VD: Bàn giao {ca} – {ngày}"></label>
    <label class="field"><span class="lb">Nội dung</span><textarea class="inp mono" id="tBo" rows="12" placeholder="Dùng ☐ cho việc cần làm, ## cho tiêu đề mục, - cho gạch đầu dòng">${esc(t.body)}</textarea></label>
    <div class="chips wrap" style="margin:-4px 0 12px">${['{ngày}', '{giờ}', '{người}', '{ca}', '{thứ}', '☐ ', '## ', '- '].map(x => `<button class="chip sm" data-ins="${esc(x)}">${esc(x.trim())}</button>`).join('')}</div>
    <label class="field"><span class="lb">Thẻ tự gắn (cách nhau bởi dấu phẩy)</span><input class="inp" id="tTg" value="${esc((t.tags || []).join(', '))}" placeholder="VD: sự-cố, máy-ép"></label>
    <label class="field"><span class="lb">Trạng thái ban đầu</span><select class="inp" id="tSt">
      ${[['', 'Không đặt'], ['todo', 'Cần làm'], ['doing', 'Đang xử lý'], ['done', 'Đã xong']].map(([k, l]) => `<option value="${k}" ${t.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <div class="preview"><div class="lb">Xem trước</div><b>${esc(fillVars(t.title, S.settings))}</b><pre>${esc(fillVars(t.body, S.settings))}</pre></div>
    <button class="btn pri" id="tUse">${ic('plus')} Tạo ghi chú từ mẫu này</button>
    <button class="btn dan" id="tDel">${ic('trash')} Xóa mẫu</button>
  </div>`;
  const bind = (sel, k, fn = x => x) => { const el = $(sel, v); el.oninput = el.onchange = () => { t[k] = fn(el.value); save(); }; };
  bind('#tIc', 'icon'); bind('#tNm', 'name'); bind('#tTi', 'title'); bind('#tBo', 'body'); bind('#tSt', 'status');
  bind('#tTg', 'tags', x => x.split(/[,;\s]+/).map(normTag).filter(Boolean));
  let lastF = $('#tBo', v);
  ['#tTi', '#tBo'].forEach(s => $(s, v).addEventListener('focus', e => { lastF = e.target; }));
  $$('[data-ins]', v).forEach(b => { b.onmousedown = e => e.preventDefault(); b.onclick = () => {
    const el = lastF; el.focus(); const s = el.selectionStart; el.setRangeText(b.dataset.ins, s, el.selectionEnd, 'end'); el.dispatchEvent(new Event('input'));
  }; });
  $('#tUse', v).onclick = () => createFrom(t);
  $('#tDel', v).onclick = async () => {
    if (!await confirmBox('Xóa mẫu?', `Xóa mẫu “${esc(t.name)}”. Các ghi chú đã tạo từ mẫu vẫn giữ nguyên.`, 'Xóa', true)) return;
    S.templates = S.templates.filter(x => x !== t); await save(); pop(); toast('Đã xóa mẫu');
  };
}

// ---------- Thùng rác ----------
export function viewTrash(v) {
  const list = S.notes.filter(n => n.deleted).sort((a, b) => b.deleted.localeCompare(a.deleted));
  v.innerHTML = `<div class="fade-in">
    <p class="help">Ghi chú đã xóa được giữ 30 ngày rồi tự xóa hẳn.</p>
    ${list.length ? list.map(n => `<div class="ncard trash" data-n="${n.id}"><div class="nc-main"><h4>${esc(n.title || n.body.split('\n')[0] || 'Ghi chú không tên')}</h4>
      <div class="nc-meta"><span>Xóa lúc ${whenLabel(n.deleted)}</span><span class="grow"></span>
      <button class="link" data-r="${n.id}">${ic('restore')}Khôi phục</button><button class="link danger" data-x="${n.id}">${ic('trash')}Xóa hẳn</button></div></div></div>`).join('')
      + `<button class="btn dan" id="trEmpty">${ic('trash')} Dọn sạch thùng rác (${list.length})</button>`
      : `<div class="empty">${ic('trash')}<div>Thùng rác trống</div></div>`}
  </div>`;
  $$('[data-r]', v).forEach(b => b.onclick = () => { const n = S.notes.find(x => x.id === b.dataset.r); n.deleted = null; touch(n, true); nav.render(); toast('Đã khôi phục'); });
  $$('[data-x]', v).forEach(b => b.onclick = async () => {
    if (!await confirmBox('Xóa hẳn?', 'Ghi chú và ảnh sẽ bị xóa vĩnh viễn.', 'Xóa hẳn', true)) return;
    await purgeNote(S.notes.find(x => x.id === b.dataset.x)); nav.render();
  });
  const e = $('#trEmpty', v); if (e) e.onclick = async () => {
    if (!await confirmBox('Dọn sạch thùng rác?', `${list.length} ghi chú sẽ bị xóa vĩnh viễn.`, 'Dọn sạch', true)) return;
    for (const n of list) await purgeNote(n); nav.render();
  };
}

// ---------- Cài đặt & sao lưu ----------
export function viewSettings(v) {
  const st = S.settings; const shifts = st.shifts || DEFAULT_SHIFTS;
  const nAlive = alive().length; const nPh = alive().reduce((s, n) => s + (n.photos || []).length, 0);
  v.innerHTML = `<div class="fade-in">
    <div class="sec-h">Thông tin của bạn</div>
    <label class="field"><span class="lb">Tên người ghi (điền vào {người})</span><input class="inp" id="sNm" value="${esc(st.name)}" placeholder="VD: Nguyễn Văn A"></label>
    <div class="field"><span class="lb">Các ca làm việc (điền vào {ca}) · hiện tại: <b>${esc(currentShift(shifts))}</b></span>
      <div id="shifts">${shifts.map((s, i) => `<div class="row2 shift"><input class="inp" data-sn="${i}" value="${esc(s.name)}"><input type="time" class="inp" data-sf="${i}" value="${s.from}"><button class="icon-btn sm" data-sd="${i}" aria-label="Xóa ca">${ic('x')}</button></div>`).join('')}</div>
      <button class="link" id="shAdd">${ic('plus')}Thêm ca</button></div>
    <div class="sec-h">Giao diện</div>
    <div class="seg big">${[['auto', 'Theo máy'], ['dark', 'Tối'], ['light', 'Sáng']].map(([k, l]) => `<button data-th="${k}" class="${st.theme === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="sec-h">Sao lưu dữ liệu</div>
    <p class="help">Dữ liệu chỉ nằm trong máy này (${nAlive} ghi chú, ${nPh} ảnh). Nên sao lưu định kỳ ra Drive / Zalo / email để không mất khi đổi máy.</p>
    <button class="btn pri" id="bkOut">${ic('upload')} Sao lưu ra file</button>
    <button class="btn sec" id="bkIn">${ic('download')} Khôi phục từ file</button>
    ${st.lastBackup ? `<p class="help center">Lần sao lưu gần nhất: ${whenLabel(st.lastBackup)}</p>` : ''}
    <div class="sec-h">Khác</div>
    <div class="set-group">
      <button class="set-row" data-go="tags"><span class="ic">${ic('hash')}</span><div class="grow tt">Quản lý thẻ</div>${ic('chev')}</button>
      <button class="set-row" data-go="templates"><span class="ic">${ic('layers')}</span><div class="grow tt">Quản lý mẫu</div>${ic('chev')}</button>
      <button class="set-row" data-go="trash"><span class="ic">${ic('trash')}</span><div class="grow tt">Thùng rác</div>${ic('chev')}</button>
    </div>
    <p class="help center">Sổ Việc 1.0 · ghi chú công việc offline</p>
  </div>`;
  const sv = () => saveKV('settings');
  $('#sNm', v).oninput = e => { st.name = e.target.value.trim(); sv(); };
  const shs = () => (st.shifts = st.shifts || DEFAULT_SHIFTS.map(s => ({ ...s })));
  $$('[data-sn]', v).forEach(i => i.oninput = () => { shs()[+i.dataset.sn].name = i.value; sv(); });
  $$('[data-sf]', v).forEach(i => i.onchange = () => { shs()[+i.dataset.sf].from = i.value || '00:00'; sv(); nav.render(); });
  $$('[data-sd]', v).forEach(b => b.onclick = () => { if (shs().length <= 1) { toast('Cần ít nhất 1 ca'); return; } shs().splice(+b.dataset.sd, 1); sv(); nav.render(); });
  $('#shAdd', v).onclick = () => { shs().push({ name: 'Ca ' + (shs().length + 1), from: '08:00' }); sv(); nav.render(); };
  $$('[data-th]', v).forEach(b => b.onclick = () => { st.theme = b.dataset.th; sv(); nav.applyTheme(); nav.render(); });
  $$('[data-go]', v).forEach(b => b.onclick = () => push({ v: b.dataset.go }));
  $('#bkOut', v).onclick = backupOut;
  $('#bkIn', v).onclick = backupIn;
}
async function backupOut() {
  const bz = busy('Đang chuẩn bị bản sao lưu…');
  try {
    const json = await exportAll((i, n) => bz.set(`Đang gói ảnh ${i}/${n}…`));
    const name = `SoViec_saoluu_${today()}.json`;
    bz.done(); await shareFile(name, json);
    S.settings.lastBackup = new Date().toISOString(); await saveKV('settings'); nav.render();
  } catch (e) { bz.done(); if (!/cancel/i.test(String(e && e.message || e))) toast('Không sao lưu được: ' + (e.message || e)); }
}
async function backupIn() {
  const fs = await pickFiles('application/json,.json', false); if (!fs.length) return;
  const text = await fs[0].text();
  menu('Khôi phục dữ liệu', [
    { icon: 'download', label: 'Gộp vào dữ liệu hiện có', hint: 'khuyên dùng', run: () => doImport(text, 'merge') },
    { icon: 'restore', label: 'Thay thế toàn bộ', danger: true, run: async () => { if (await confirmBox('Thay thế toàn bộ?', 'Mọi ghi chú hiện có trong máy sẽ bị xóa và thay bằng nội dung trong file.', 'Thay thế', true)) doImport(text, 'replace'); } },
  ]);
}
async function doImport(text, mode) {
  const bz = busy('Đang khôi phục…');
  try { await flush(); const r = await importAll(text, mode); bz.done(); toast(`Xong: thêm ${r.added}, cập nhật ${r.updated} ghi chú`); nav.applyTheme(); nav.render(); }
  catch (e) { bz.done(); toast('Lỗi: ' + (e.message || e)); }
}
