// Xuất biên bản / báo cáo chuyên nghiệp ra PDF, Word (.docx) và Excel (.xlsx).
//
// doc = {
//   landscape, org, dept, label, title, subtitle, docNo, dateText, fileBase,
//   info: [[nhãn, giá trị], ...],
//   sections: [{ heading, items: [
//     {p} | {li} | {chk, done} | {subh} |
//     {table: {cols, rows, widths}}        // ô có thể là chuỗi hoặc {t, result:'ok'|'ng'|'chk'|'hold'|'doing'|'todo'}
//     {card: {no, title, codes, qty, result, caption, paths}}
//   ]}],
//   signers: [{title, name}],
// }
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ShadingType,
  Header, Footer, PageNumber, PageOrientation, VerticalAlign, TabStopType, TableLayoutType } from 'docx';
import ExcelJS from 'exceljs';
import { FONT_REGULAR, FONT_BOLD, FONT_ITALIC } from './fontdata.js';
import { readB64, shareFile } from './platform.js';
import { S } from './store.js';

// ---------------- màu & nhãn ----------------
const NAVY = [11, 42, 102], BLUE = [30, 111, 255], GREY = [105, 116, 136], LIGHT = [238, 244, 255], TILE = [242, 245, 250], LINE = [206, 217, 235];
const RES = {
  ok: { t: 'ĐẠT', c: [22, 150, 95] }, ng: { t: 'KHÔNG ĐẠT', c: [214, 52, 45] }, chk: { t: 'CẦN XEM LẠI', c: [214, 128, 12] },
  done: { t: 'Hoàn thành', c: [22, 150, 95] }, doing: { t: 'Đang làm', c: [30, 111, 255] }, hold: { t: 'Hoãn', c: [214, 128, 12] }, todo: { t: 'Chưa làm', c: [105, 116, 136] },
  open: { t: 'Đang tồn', c: [214, 52, 45] }, fixed: { t: 'Đã xử lý', c: [22, 150, 95] },
};
const hex = c => c.map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
const cellText = c => (c && typeof c === 'object') ? (c.t ?? '') : String(c ?? '');
const cellRes = c => (c && typeof c === 'object' && c.result) ? RES[c.result] : null;
const safeName = s => (s || 'bao-cao').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 70) || 'bao-cao';

// ---------------- ảnh ----------------
async function loadImg(path, max = 1400, q = 0.82) {
  const b64 = await readB64(path); if (!b64) return null;
  const mime = b64.startsWith('iVBOR') ? 'image/png' : 'image/jpeg';
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = `data:${mime};base64,${b64}`; });
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
  return { b64: c.toDataURL('image/jpeg', q).split(',')[1], w, h };
}
// Logo in trên biên bản: logo riêng (Cài đặt) hoặc logo mặc định của app. Trả về {b64, w, h}
async function logo() {
  const st = S.state.settings;
  if (st.logoPath) { try { const b64 = await readB64(st.logoPath); if (b64) { const d = await dims(b64); return { b64, ...d }; } } catch (e) { console.warn(e); } }
  try { const b = await (await fetch('logo.png')).blob(); const b64 = await new Promise(r => { const f = new FileReader(); f.onload = () => r(String(f.result).split(',')[1]); f.readAsDataURL(b); }); return { b64, w: 256, h: 256 }; }
  catch (e) { return null; }
}
function dims(b64) { return new Promise(res => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res({ w: 1, h: 1 }); i.src = 'data:image/png;base64,' + b64; }); }
const footerText = doc => { const f = S.state.settings.footer; const t = f == null ? 'Lập bằng ứng dụng Bảo Trì Thủy Lực' : f; return [doc.docNo, t].filter(Boolean).join(' · '); };
async function prepare(doc, onStep) {
  const cards = doc.sections.flatMap(s => s.items.filter(i => i.card).map(i => i.card));
  const total = cards.reduce((s, c) => s + (c.paths || []).length, 0); let n = 0;
  for (const c of cards) { c.data = []; for (const p of c.paths || []) { try { const d = await loadImg(p); if (d) c.data.push(d); } catch (e) { console.warn(e); } onStep && onStep(++n, total); } }
}
const b64ToBytes = b64 => { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
function bufToB64(buf) { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
const fit = (w, h, bw, bh) => { const k = Math.min(bw / w, bh / h); return [w * k, h * k]; };

// =====================================================================
//                                PDF
// =====================================================================
export async function exportPdf(doc, onStep) {
  await prepare(doc, onStep);
  const lg = await logo();
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: doc.landscape ? 'landscape' : 'portrait' });
  pdf.addFileToVFS('dv.ttf', FONT_REGULAR); pdf.addFont('dv.ttf', 'DV', 'normal');
  pdf.addFileToVFS('dvb.ttf', FONT_BOLD); pdf.addFont('dvb.ttf', 'DV', 'bold');
  pdf.addFileToVFS('dvi.ttf', FONT_ITALIC); pdf.addFont('dvi.ttf', 'DV', 'italic');
  const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight(), M = 14, CW = W - 2 * M;
  const TOP2 = M + 9, BOT = H - 14; // lề trên trang 2+ (có header nhỏ), lề dưới (chừa chân trang)
  let y = M;
  const font = (size, style = 'normal', color = [22, 30, 46]) => { pdf.setFont('DV', style); pdf.setFontSize(size); pdf.setTextColor(...color); };
  const lh = size => size * 0.42;
  const newPage = () => { pdf.addPage(); y = TOP2; };
  const need = h => { if (y + h > BOT) newPage(); };
  const para = (t, size = 10, style = 'normal', color, indent = 0, align = 'left', gapAfter = 1.6) => {
    font(size, style, color); const lines = pdf.splitTextToSize(String(t), CW - indent);
    for (const l of lines) { need(lh(size)); pdf.text(l, align === 'center' ? W / 2 : align === 'right' ? W - M : M + indent, y + lh(size) * 0.8, { align }); y += lh(size) * 1.05; }
    y += gapAfter;
  };

  // ---- khối đầu trang 1 ----
  let lx = M; if (lg) { const [w, h] = fit(lg.w, lg.h, 30, 15); pdf.addImage(lg.b64, 'PNG', M, y + (15 - h) / 2, w, h); lx = M + w + 4; }
  font(10.5, 'bold', NAVY); pdf.text(doc.org.toUpperCase(), lx, y + 5.5, { maxWidth: CW * 0.62 });
  if (doc.dept) { font(8.8, 'normal', GREY); pdf.text(doc.dept, lx, y + 10.5); }
  font(9, 'normal', GREY);
  if (doc.docNo) { font(9, 'bold', NAVY); const nw = pdf.getTextWidth(doc.docNo); pdf.text(doc.docNo, W - M, y + 5.5, { align: 'right' }); font(9, 'normal', GREY); pdf.text('Số:', W - M - nw - 1.5, y + 5.5, { align: 'right' }); }
  font(9, 'normal', GREY); pdf.text(doc.dateText, W - M, y + 10.5, { align: 'right' });
  y += 18; pdf.setDrawColor(...BLUE); pdf.setLineWidth(0.7); pdf.line(M, y, W - M, y); pdf.setLineWidth(0.2); y += 7;
  if (doc.label && doc.label !== doc.title) para(doc.label, 8.5, 'bold', BLUE, 0, 'center', 0.5);
  para(doc.title, doc.landscape ? 16 : 15, 'bold', NAVY, 0, 'center', 1);
  if (doc.subtitle) para(doc.subtitle, 10.5, 'italic', GREY, 0, 'center', 1);
  y += 3;

  // ---- bảng thông tin ----
  if (doc.info?.length) {
    const rows = []; for (let i = 0; i < doc.info.length; i += 2) rows.push([doc.info[i][0], doc.info[i][1], doc.info[i + 1]?.[0] || '', doc.info[i + 1]?.[1] || '']);
    const lw = doc.landscape ? 42 : 36;
    autoTable(pdf, { startY: y, margin: { left: M, right: M, top: TOP2, bottom: 16 }, body: rows, theme: 'grid',
      styles: { font: 'DV', fontSize: 9, cellPadding: 2, lineColor: LINE, lineWidth: 0.2, textColor: [22, 30, 46], valign: 'middle' },
      columnStyles: { 0: { fontStyle: 'bold', fillColor: LIGHT, textColor: NAVY, cellWidth: lw }, 2: { fontStyle: 'bold', fillColor: LIGHT, textColor: NAVY, cellWidth: lw } } });
    y = pdf.lastAutoTable.finalY + 6;
  }

  // ---- các phần ----
  for (const sec of doc.sections) {
    let pendingH = sec.heading;
    const drawHeading = reserve => { need(12 + reserve); font(11.5, 'bold', NAVY); pdf.text(pendingH, M, y + 4.5); pdf.setDrawColor(...LINE); pdf.line(M, y + 7, W - M, y + 7); y += 11; pendingH = null; };
    if (!sec.items.length && pendingH) drawHeading(0);
    for (const it of sec.items) {
      if (pendingH) { const m = it.card ? measureCard(it.card) : null; drawHeading(m ? (m.fits ? m.total : m.headH + m.rowH) : it.table ? 28 : 10); }
      if (it.subh) { need(10); para(it.subh, 10.5, 'bold', BLUE, 0, 'left', 1); }
      else if (it.p) para(it.p, 10, 'normal', undefined, 0, 'left', 2);
      else if (it.li) para('•   ' + it.li, 10, 'normal', undefined, 3, 'left', 1);
      else if (it.chk != null) para((it.done ? '☑   ' : '☐   ') + it.chk, 10, 'normal', it.done ? GREY : undefined, 3, 'left', 1);
      else if (it.table) {
        const t = it.table; const colStyles = {};
        if (t.widths) { const tot = t.widths.reduce((a, b) => a + b, 0); t.widths.forEach((w, i) => colStyles[i] = { cellWidth: CW * w / tot }); }
        autoTable(pdf, { startY: y, margin: { left: M, right: M, top: TOP2, bottom: 16 }, head: [t.cols], body: t.rows.map(r => r.map(cellText)), theme: 'grid',
          styles: { font: 'DV', fontSize: doc.landscape ? 8.6 : 8.4, cellPadding: 1.8, lineColor: LINE, lineWidth: 0.2, valign: 'top', textColor: [22, 30, 46] },
          headStyles: { font: 'DV', fontStyle: 'bold', fillColor: BLUE, textColor: 255, valign: 'middle', halign: 'center' },
          alternateRowStyles: { fillColor: [247, 250, 255] }, columnStyles: colStyles, rowPageBreak: 'avoid',
          didParseCell: d => { if (d.section === 'body') { const r = cellRes(t.rows[d.row.index][d.column.index]); if (r) { d.cell.styles.textColor = r.c; d.cell.styles.fontStyle = 'bold'; } } } });
        y = pdf.lastAutoTable.finalY + 5;
      } else if (it.card) drawCard(it.card);
    }
    y += 2;
  }

  // ---- ký tên ----
  if (doc.signers?.length) {
    need(42); y += 4; const n = doc.signers.length; const cw = CW / n;
    doc.signers.forEach((s, i) => {
      const cx = M + cw * i + cw / 2;
      font(9.5, 'bold', NAVY); const tl = pdf.splitTextToSize(s.title.toUpperCase(), cw - 6); tl.forEach((l, k) => pdf.text(l, cx, y + 4 + k * 4.2, { align: 'center' }));
      font(8, 'italic', GREY); pdf.text('(Ký, ghi rõ họ tên)', cx, y + 8.5 + (tl.length - 1) * 4.2, { align: 'center' });
      if (s.name) { font(9.5, 'bold', [22, 30, 46]); pdf.text(s.name, cx, y + 34, { align: 'center' }); }
    });
    y += 40;
  }

  // ---- header nhỏ & chân trang ----
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    if (i > 1) { font(7.8, 'bold', NAVY); pdf.text(doc.org.toUpperCase(), M, M + 3); font(7.8, 'normal', GREY); pdf.text(`${doc.title}${doc.docNo ? ' · ' + doc.docNo : ''}`, W - M, M + 3, { align: 'right' }); pdf.setDrawColor(...LINE); pdf.line(M, M + 5, W - M, M + 5); }
    pdf.setDrawColor(...LINE); pdf.line(M, H - 11, W - M, H - 11);
    font(7.8, 'normal', GREY); pdf.text(footerText(doc), M, H - 7);
    pdf.text(`Trang ${i}/${pages}`, W - M, H - 7, { align: 'right' });
  }
  await shareFile(safeName(doc.fileBase || doc.title) + '.pdf', pdf.output('datauristring').split(',')[1], 'application/pdf');

  // ---- khung ảnh vật tư ----
  function measureCard(c) {
    const pad = 3, headH = 9, gap = 4, labelH = 4.5;
    const d = c.data || []; const cols = d.length <= 1 ? 1 : (doc.landscape ? 3 : 2);
    const innerW = CW - 2 * pad; const tileW = cols === 1 ? innerW : (innerW - gap * (cols - 1)) / cols;
    const tileH = cols === 1 ? Math.min(92, innerW * 0.55) : tileW * 0.72;
    font(9.2, 'italic'); const capLines = c.caption ? pdf.splitTextToSize(c.caption, innerW) : [];
    const capH = capLines.length ? capLines.length * lh(9.2) * 1.1 + 2 : 0; const rowH = tileH + labelH + 2;
    const total = headH + pad + Math.max(1, Math.ceil(d.length / cols)) * rowH + capH + pad;
    return { total: total + 3, fits: total <= BOT - TOP2, headH, rowH };
  }
  function drawCard(c) {
    const pad = 3, headH = 9, gap = 4, labelH = 4.5;
    const d = c.data || []; const cols = d.length <= 1 ? 1 : (doc.landscape ? 3 : 2);
    const innerW = CW - 2 * pad; const tileW = cols === 1 ? innerW : (innerW - gap * (cols - 1)) / cols;
    const tileH = cols === 1 ? Math.min(92, innerW * 0.55) : tileW * 0.72;
    const rowsN = Math.ceil(d.length / cols);
    font(9.2, 'italic'); const capLines = c.caption ? pdf.splitTextToSize(c.caption, innerW) : [];
    const capH = capLines.length ? capLines.length * lh(9.2) * 1.1 + 2 : 0;
    const rowH = tileH + labelH + 2;
    const total = headH + pad + rowsN * rowH + capH + pad;
    const fits = total <= BOT - TOP2;
    need(fits ? total + 3 : headH + rowH + 3);
    const y0 = y;
    // thanh tiêu đề
    pdf.setFillColor(...LIGHT); pdf.setDrawColor(...LINE); pdf.rect(M, y, CW, headH, 'FD');
    font(9.6, 'bold', NAVY); let hx = M + pad; pdf.text(c.title, hx, y + 6); hx += pdf.getTextWidth(c.title) + 3;
    if (c.codes?.length) { font(9.6, 'normal', GREY); pdf.text('Mã:', hx, y + 6); hx += pdf.getTextWidth('Mã: '); font(9.6, 'bold', [22, 30, 46]); const ct = c.codes.join(', '); pdf.text(ct, hx, y + 6, { maxWidth: CW * 0.52 }); hx += Math.min(pdf.getTextWidth(ct), CW * 0.52) + 3; }
    if (c.qty) { font(9.6, 'normal', GREY); pdf.text(`· SL: ${c.qty}`, hx, y + 6); }
    const r = RES[c.result];
    if (r) { font(8.4, 'bold', [255, 255, 255]); const bw = pdf.getTextWidth(r.t) + 6; pdf.setFillColor(...r.c); pdf.roundedRect(W - M - pad - bw, y + 1.8, bw, 5.4, 1.2, 1.2, 'F'); pdf.text(r.t, W - M - pad - bw / 2, y + 5.6, { align: 'center' }); }
    y += headH + pad;
    // ảnh
    for (let rI = 0; rI < rowsN; rI++) {
      if (!fits) need(rowH);
      for (let cI = 0; cI < cols; cI++) {
        const k = rI * cols + cI; const im = d[k]; if (!im) continue;
        const tx = M + pad + cI * (tileW + gap);
        pdf.setFillColor(...TILE); pdf.rect(tx, y, tileW, tileH, 'F');
        const [iw, ih] = fit(im.w, im.h, tileW - 2, tileH - 2);
        pdf.addImage(im.b64, 'JPEG', tx + (tileW - iw) / 2, y + (tileH - ih) / 2, iw, ih);
        font(7.8, 'italic', GREY); pdf.text(`Hình ${c.no}.${k + 1}`, tx + tileW / 2, y + tileH + 3.6, { align: 'center' });
      }
      y += rowH;
    }
    if (!d.length) { font(9, 'italic', GREY); pdf.text('(không có ảnh)', M + pad, y + 3); y += 6; }
    if (capLines.length) { font(9.2, 'italic', [60, 70, 90]); capLines.forEach(l => { pdf.text(l, M + pad, y + lh(9.2) * 0.8); y += lh(9.2) * 1.1; }); y += 2; }
    y += pad - 1;
    if (fits) { pdf.setDrawColor(...LINE); pdf.rect(M, y0, CW, y - y0, 'S'); }
    y += 5;
  }
}

// =====================================================================
//                                WORD
// =====================================================================
const R = (t, o = {}) => new TextRun({ text: String(t ?? ''), font: 'Arial', size: o.size || 20, bold: o.bold, italics: o.italics, color: o.color, allCaps: o.caps });
const B = c => ({ style: BorderStyle.SINGLE, size: 4, color: c || 'CED9EB' });
const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const allB = c => ({ top: B(c), bottom: B(c), left: B(c), right: B(c) });
const noB = { top: NONE, bottom: NONE, left: NONE, right: NONE };
const P = (children, o = {}) => new Paragraph({ children: Array.isArray(children) ? children : [children], alignment: o.align, spacing: { before: o.before || 0, after: o.after ?? 60 }, keepNext: o.keepNext, keepLines: true, indent: o.indent, border: o.border });

export async function exportDocx(doc, onStep) {
  await prepare(doc, onStep);
  const lg = await logo();
  const pageW = doc.landscape ? 16838 : 11906, pageH = doc.landscape ? 11906 : 16838, mar = 800; // twip
  const contentPx = Math.round((pageW - 2 * mar) / 15); // 1px = 15 twip
  const CWt = pageW - 2 * mar; // độ rộng vùng chữ (twip)
  const pct = n => ({ size: Math.round(CWt * n / 100), type: WidthType.DXA });
  const cols = arr => { const tot = arr.reduce((a, b) => a + b, 0); return arr.map(w => Math.round(CWt * w / tot)); };
  const kids = [];
  // ---- khối đầu ----
  kids.push(new Table({ width: pct(100), columnWidths: cols(lg && lg.w / lg.h > 1.4 ? [16, 52, 32] : [9, 59, 32]), layout: TableLayoutType.FIXED, borders: { ...noB, insideHorizontal: NONE, insideVertical: NONE }, rows: [new TableRow({ children: [
    new TableCell({ borders: noB, width: pct(lg && lg.w / lg.h > 1.4 ? 16 : 9), verticalAlign: VerticalAlign.CENTER, children: [P(lg ? [(() => { const [w, h] = fit(lg.w, lg.h, 110, 54); return new ImageRun({ type: 'png', data: b64ToBytes(lg.b64), transformation: { width: Math.round(w), height: Math.round(h) } }); })()] : [])] }),
    new TableCell({ borders: noB, width: pct(lg && lg.w / lg.h > 1.4 ? 52 : 59), verticalAlign: VerticalAlign.CENTER, children: [P(R(doc.org.toUpperCase(), { bold: true, size: 21, color: hex(NAVY) }), { after: 20 }), ...(doc.dept ? [P(R(doc.dept, { size: 17, color: hex(GREY) }))] : [])] }),
    new TableCell({ borders: noB, width: pct(32), verticalAlign: VerticalAlign.CENTER, children: [
      ...(doc.docNo ? [P([R('Số: ', { size: 18, color: hex(GREY) }), R(doc.docNo, { bold: true, size: 18, color: hex(NAVY) })], { align: AlignmentType.RIGHT, after: 20 })] : []),
      P(R(doc.dateText, { size: 18, color: hex(GREY) }), { align: AlignmentType.RIGHT })] }),
  ] })] }));
  kids.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 14, color: hex(BLUE), space: 1 } }, spacing: { after: 240 }, children: [] }));
  if (doc.label && doc.label !== doc.title) kids.push(P(R(doc.label, { bold: true, size: 17, color: hex(BLUE) }), { align: AlignmentType.CENTER, after: 40 }));
  kids.push(P(R(doc.title, { bold: true, size: 32, color: hex(NAVY) }), { align: AlignmentType.CENTER, after: 60 }));
  if (doc.subtitle) kids.push(P(R(doc.subtitle, { italics: true, size: 21, color: hex(GREY) }), { align: AlignmentType.CENTER, after: 200 }));
  // ---- thông tin ----
  if (doc.info?.length) {
    const rows = []; for (let i = 0; i < doc.info.length; i += 2) rows.push([doc.info[i], doc.info[i + 1] || ['', '']]);
    const lab = t => new TableCell({ borders: allB(), width: pct(17), shading: { type: ShadingType.CLEAR, fill: hex(LIGHT), color: 'auto' }, verticalAlign: VerticalAlign.CENTER, children: [P(R(t, { bold: true, size: 18, color: hex(NAVY) }), { after: 0 })], margins: { top: 60, bottom: 60, left: 100, right: 100 } });
    const val = t => new TableCell({ borders: allB(), width: pct(33), verticalAlign: VerticalAlign.CENTER, children: [P(R(t, { size: 19 }), { after: 0 })], margins: { top: 60, bottom: 60, left: 100, right: 100 } });
    kids.push(new Table({ width: pct(100), columnWidths: cols([17, 33, 17, 33]), layout: TableLayoutType.FIXED, rows: rows.map(([a, b]) => new TableRow({ cantSplit: true, children: [lab(a[0]), val(a[1]), lab(b[0]), val(b[1])] })) }));
    kids.push(P([], { after: 160 }));
  }
  // ---- các phần ----
  for (const sec of doc.sections) {
    if (sec.heading) kids.push(P(R(sec.heading, { bold: true, size: 23, color: hex(NAVY) }), { before: 200, after: 120, keepNext: true, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CED9EB', space: 2 } } }));
    for (const it of sec.items) {
      if (it.subh) kids.push(P(R(it.subh, { bold: true, size: 21, color: hex(BLUE) }), { before: 120, keepNext: true }));
      else if (it.p) kids.push(P(R(it.p), { after: 100 }));
      else if (it.li) kids.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: [R(it.li)] }));
      else if (it.chk != null) kids.push(P(R((it.done ? '☑  ' : '☐  ') + it.chk, { color: it.done ? hex(GREY) : undefined }), { indent: { left: 300 }, after: 40 }));
      else if (it.table) kids.push(docxTable(it.table, CWt), P([], { after: 120 }));
      else if (it.card) kids.push(docxCard(it.card, contentPx, doc.landscape, CWt), P([], { after: 160 }));
    }
  }
  // ---- ký tên ----
  if (doc.signers?.length) {
    kids.push(P([], { after: 200 }));
    const w = Math.floor(100 / doc.signers.length);
    kids.push(new Table({ width: pct(100), columnWidths: cols(doc.signers.map(() => 1)), layout: TableLayoutType.FIXED, borders: { ...noB, insideHorizontal: NONE, insideVertical: NONE }, rows: [new TableRow({ cantSplit: true, children: doc.signers.map(s => new TableCell({ borders: noB, width: pct(w), children: [
      P(R(s.title.toUpperCase(), { bold: true, size: 18, color: hex(NAVY) }), { align: AlignmentType.CENTER, after: 20, keepNext: true }),
      P(R('(Ký, ghi rõ họ tên)', { italics: true, size: 16, color: hex(GREY) }), { align: AlignmentType.CENTER, after: 1100, keepNext: true }),
      P(R(s.name || '', { bold: true, size: 19 }), { align: AlignmentType.CENTER })] })) })] }));
  }
  const header = new Header({ children: [new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: pageW - 2 * mar }], border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CED9EB', space: 2 } },
    children: [R(doc.org.toUpperCase(), { bold: true, size: 15, color: hex(NAVY) }), R(`\t${doc.title}${doc.docNo ? ' · ' + doc.docNo : ''}`, { size: 15, color: hex(GREY) })] })] });
  const footer = new Footer({ children: [new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: pageW - 2 * mar }], border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'CED9EB', space: 2 } },
    children: [R(footerText(doc), { size: 15, color: hex(GREY) }),
      new TextRun({ children: ['\tTrang ', PageNumber.CURRENT, '/', PageNumber.TOTAL_PAGES], font: 'Arial', size: 15, color: hex(GREY) })] })] });
  const d = new Document({ creator: 'Bảo Trì Thủy Lực', title: doc.title, styles: { default: { document: { run: { font: 'Arial' } } } },
    sections: [{ properties: { titlePage: true, page: { size: { width: pageW, height: pageH, orientation: doc.landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT }, margin: { top: mar, bottom: mar, left: mar, right: mar, header: 400, footer: 400 } } },
      headers: { default: header, first: new Header({ children: [new Paragraph({ children: [] })] }) }, footers: { default: footer, first: footer }, children: kids }] });
  await shareFile(safeName(doc.fileBase || doc.title) + '.docx', await Packer.toBase64String(d), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}
function docxTable(t, CWt) {
  const W0 = t.widths || t.cols.map(() => 1); const tot = W0.reduce((a, b) => a + b, 0); const tw = W0.map(w => Math.round(CWt * w / tot));
  const W = W0; const pct = n => ({ size: Math.round(CWt * n / 100), type: WidthType.DXA });
  const cm = { top: 50, bottom: 50, left: 80, right: 80 };
  return new Table({ width: pct(100), columnWidths: tw, layout: TableLayoutType.FIXED, rows: [
    new TableRow({ tableHeader: true, cantSplit: true, children: t.cols.map((c, i) => new TableCell({ borders: allB('1E6FFF'), width: { size: tw[i], type: WidthType.DXA }, margins: cm, verticalAlign: VerticalAlign.CENTER, shading: { type: ShadingType.CLEAR, fill: '1E6FFF', color: 'auto' }, children: [P(R(c, { bold: true, color: 'FFFFFF', size: 17 }), { align: AlignmentType.CENTER, after: 0 })] })) }),
    ...t.rows.map((r, ri) => new TableRow({ cantSplit: true, children: r.map((c, i) => { const res = cellRes(c); return new TableCell({ borders: allB(), width: { size: tw[i], type: WidthType.DXA }, margins: cm,
      shading: ri % 2 ? { type: ShadingType.CLEAR, fill: 'F7FAFF', color: 'auto' } : undefined,
      children: cellText(c).split('\n').map(line => P(R(line, { size: 17, bold: !!res, color: res ? hex(res.c) : undefined }), { after: 0 })) }); }) }))] });
}
function docxCard(c, contentPx, landscape, CWt) {
  const pct = n => ({ size: Math.round(CWt * n / 100), type: WidthType.DXA });
  const d = c.data || []; const cols = d.length <= 1 ? 1 : (landscape ? 3 : 2);
  const tileW = cols === 1 ? Math.round(contentPx * 0.72) : Math.floor((contentPx - 40) / cols - 12); const tileH = cols === 1 ? Math.round(tileW * 0.62) : Math.round(tileW * 0.72);
  const res = RES[c.result]; const cm = { top: 70, bottom: 70, left: 110, right: 110 };
  const head = new TableRow({ cantSplit: true, children: [new TableCell({ columnSpan: cols, borders: allB(), margins: cm, shading: { type: ShadingType.CLEAR, fill: hex(LIGHT), color: 'auto' }, children: [
    new Paragraph({ keepNext: true, spacing: { after: 0 }, tabStops: [{ type: TabStopType.RIGHT, position: Math.round(contentPx * 15) - 300 }], children: [
      R(c.title, { bold: true, size: 19, color: hex(NAVY) }),
      ...(c.codes?.length ? [R('   Mã: ', { size: 19, color: hex(GREY) }), R(c.codes.join(', '), { bold: true, size: 19 })] : []),
      ...(c.qty ? [R(`   · SL: ${c.qty}`, { size: 19, color: hex(GREY) })] : []),
      ...(res ? [R('\t' + res.t, { bold: true, size: 19, color: hex(res.c) })] : [])] })] })] });
  const rows = [head];
  for (let i = 0; i < d.length; i += cols) {
    rows.push(new TableRow({ cantSplit: true, children: Array.from({ length: cols }, (_, j) => { const im = d[i + j]; const k = i + j + 1;
      if (!im) return new TableCell({ borders: allB(), width: { size: Math.round(CWt / cols), type: WidthType.DXA }, children: [P([])] });
      const [w, h] = fit(im.w, im.h, tileW, tileH);
      return new TableCell({ borders: allB(), width: { size: Math.round(CWt / cols), type: WidthType.DXA }, margins: { top: 80, bottom: 40, left: 60, right: 60 }, shading: { type: ShadingType.CLEAR, fill: hex(TILE), color: 'auto' }, verticalAlign: VerticalAlign.CENTER, children: [
        P(new ImageRun({ type: 'jpg', data: b64ToBytes(im.b64), transformation: { width: Math.round(w), height: Math.round(h) } }), { align: AlignmentType.CENTER, after: 30, keepNext: true }),
        P(R(`Hình ${c.no}.${k}`, { italics: true, size: 15, color: hex(GREY) }), { align: AlignmentType.CENTER, after: 0, keepNext: true })] }); }) }));
  }
  if (c.caption) rows.push(new TableRow({ cantSplit: true, children: [new TableCell({ columnSpan: cols, borders: allB(), margins: cm, children: [P(R(c.caption, { italics: true, size: 18, color: '3C465A' }), { after: 0 })] })] }));
  return new Table({ width: pct(100), columnWidths: Array.from({ length: cols }, () => Math.round(CWt / cols)), layout: TableLayoutType.FIXED, rows });
}

// =====================================================================
//                                EXCEL
// =====================================================================
// sheets: [{ name, title, info:[[k,v]], cols:[{h,w}], rows:[[cell]], photos?: [[path,...] per row], landscape }]
export async function exportXlsx(doc, sheets, onStep) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'Bảo Trì Thủy Lực'; wb.created = new Date();
  const lg = await logo();
  const thin = { style: 'thin', color: { argb: 'FFCED9EB' } }; const border = { top: thin, left: thin, bottom: thin, right: thin };
  let nImg = 0; const totalImg = sheets.reduce((s, sh) => s + (sh.photos || []).reduce((a, p) => a + Math.min(3, p.length), 0), 0);
  for (const sh of sheets) {
    const ws = wb.addWorksheet(sh.name, { views: [{ showGridLines: false }], pageSetup: { paperSize: 9, orientation: sh.landscape ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } } });
    const imgCols = sh.photos ? 3 : 0; const nCols = sh.cols.length + imgCols;
    sh.cols.forEach((c, i) => ws.getColumn(i + 1).width = c.w);
    for (let i = 0; i < imgCols; i++) ws.getColumn(sh.cols.length + 1 + i).width = 17;
    const L = n => ws.getColumn(n).letter;
    // đầu trang: logo · tên đơn vị · bộ phận · số & ngày
    const colW = i => ws.getColumn(i).width || 10;
    ws.getRow(1).height = 20; ws.getRow(2).height = 16; ws.getRow(3).height = 16;
    if (lg) { const id = wb.addImage({ base64: lg.b64, extension: 'png' }); const [w, h] = fit(lg.w, lg.h, Math.max(40, (ws.getColumn(1).width || 8) * 7 - 6), 46); ws.addImage(id, { tl: { col: 0.05, row: 0.1 }, ext: { width: w, height: h } }); }
    const c0 = colW(1) < 9 ? 2 : 1; // chừa cột đầu cho logo nếu cột hẹp
    const hdr = (row, text, font, align = 'left') => { ws.mergeCells(row, c0 + (c0 === 1 ? 1 : 0), row, nCols); const c = ws.getCell(row, c0 + (c0 === 1 ? 1 : 0)); c.value = text; c.font = font; c.alignment = { horizontal: align, vertical: 'middle' }; };
    hdr(1, doc.org.toUpperCase(), { name: 'Arial', bold: true, size: 12, color: { argb: 'FF0B2A66' } });
    hdr(2, doc.dept || '', { name: 'Arial', size: 9.5, color: { argb: 'FF697488' } });
    hdr(3, [doc.docNo ? 'Số: ' + doc.docNo : '', doc.dateText].filter(Boolean).join('   ·   '), { name: 'Arial', bold: true, size: 9.5, color: { argb: 'FF0B2A66' } }, 'right');
    for (let c = 1; c <= nCols; c++) ws.getCell(4, c).border = { bottom: { style: 'medium', color: { argb: 'FF1E6FFF' } } };
    ws.getRow(4).height = 6;
    ws.mergeCells(6, 1, 6, nCols); const t = ws.getCell(6, 1); t.value = sh.title || doc.title; t.font = { name: 'Arial', bold: true, size: 15, color: { argb: 'FF0B2A66' } }; t.alignment = { horizontal: 'center' }; ws.getRow(6).height = 24;
    let r = 7;
    if (doc.subtitle) { ws.mergeCells(r, 1, r, nCols); const s2 = ws.getCell(r, 1); s2.value = doc.subtitle; s2.font = { name: 'Arial', italic: true, size: 10.5, color: { argb: 'FF697488' } }; s2.alignment = { horizontal: 'center' }; r++; }
    r++;
    // thông tin chung: mỗi mục một dòng (nhãn | giá trị)
    const info = sh.info || [];
    let lblEnd = 1; while (lblEnd < nCols - 1 && [...Array(lblEnd).keys()].reduce((a, i) => a + colW(i + 1), 0) < 20) lblEnd++;
    const valChars = [...Array(nCols - lblEnd).keys()].reduce((a, i) => a + colW(lblEnd + 1 + i), 0);
    for (const [k, v] of info) {
      if (lblEnd > 1) ws.mergeCells(r, 1, r, lblEnd); if (nCols > lblEnd + 1) ws.mergeCells(r, lblEnd + 1, r, nCols);
      const a = ws.getCell(r, 1); a.value = k; a.font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FF0B2A66' } }; a.alignment = { vertical: 'middle' };
      a.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF4FF' } };
      const b = ws.getCell(r, lblEnd + 1); b.value = v; b.font = { name: 'Arial', size: 10 }; b.alignment = { vertical: 'middle', wrapText: true };
      for (let c = 1; c <= nCols; c++) ws.getCell(r, c).border = border;
      ws.getRow(r).height = Math.max(18, 15 * Math.ceil(String(v).length * 1.1 / Math.max(10, valChars)));
      r++;
    }
    if (info.length) r++;
    // bảng dữ liệu
    const hr = r; const head = [...sh.cols.map(c => c.h), ...(imgCols ? ['Ảnh 1', 'Ảnh 2', 'Ảnh 3'] : [])];
    head.forEach((h, i) => { const c = ws.getCell(hr, i + 1); c.value = h; c.font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E6FFF' } }; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = border; });
    ws.getRow(hr).height = 24; r++;
    for (let i = 0; i < sh.rows.length; i++) {
      const row = sh.rows[i]; const hasImg = imgCols && (sh.photos[i] || []).length;
      row.forEach((cell, j) => { const c = ws.getCell(r, j + 1); const res = cellRes(cell); const txt = cellText(cell);
        c.value = /^\d+(\.\d+)?$/.test(txt) && sh.cols[j].num ? Number(txt) : txt;
        c.font = { name: 'Arial', size: 10, bold: !!res, color: res ? { argb: 'FF' + hex(res.c) } : undefined };
        c.alignment = { vertical: 'middle', wrapText: true, horizontal: sh.cols[j].center ? 'center' : 'left' }; c.border = border;
        if (i % 2) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7FAFF' } };
        if (res) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex(res.c.map(x => Math.round(x + (255 - x) * 0.85))) } };
      });
      for (let k = 0; k < imgCols; k++) { const c = ws.getCell(r, sh.cols.length + 1 + k); c.border = border; }
      if (hasImg) {
        ws.getRow(r).height = 78;
        const ps = sh.photos[i].slice(0, 3);
        for (let k = 0; k < ps.length; k++) {
          try { const im = await loadImg(ps[k], 360, 0.8); if (!im) continue; const id = wb.addImage({ base64: im.b64, extension: 'jpeg' });
            const [w, h] = fit(im.w, im.h, 112, 96); ws.addImage(id, { tl: { col: sh.cols.length + k + (1 - w / 118) / 2, row: r - 1 + 0.06 }, ext: { width: w, height: h } }); } catch (e) { console.warn(e); }
          onStep && onStep(++nImg, totalImg);
        }
        if (sh.photos[i].length > 3) { const c = ws.getCell(r, nCols); c.note = `Còn ${sh.photos[i].length - 3} ảnh khác trong ghi chú`; }
      } else ws.getRow(r).height = Math.max(20, 15 * Math.max(...row.map(x => cellText(x).split('\n').length)));
      r++;
    }
    ws.views = [{ state: 'frozen', ySplit: hr, showGridLines: false }];
    ws.autoFilter = { from: { row: hr, column: 1 }, to: { row: hr, column: sh.cols.length } };
    ws.headerFooter.oddFooter = `&L&8${footerText(doc).replace(/&/g, '&&')}&R&8Trang &P/&N`;
    ws.pageSetup.printTitlesRow = `${hr}:${hr}`;
  }
  const buf = await wb.xlsx.writeBuffer();
  await shareFile(safeName(doc.fileBase || doc.title) + '.xlsx', bufToB64(buf), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
