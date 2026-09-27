// Xuất báo cáo ra PDF (jsPDF) và Word (.docx). Dùng chung cho Ghi chú và Nhật ký.
// doc = { title, subtitle, items: [ {h}, {p}, {li}, {chk, done}, {kv:[[k,v]]}, {table:{cols,rows}}, {imgs:{paths, codes, caption, badge, no}} ] }
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ShadingType } from 'docx';
import { FONT_REGULAR, FONT_BOLD, FONT_ITALIC } from './fontdata.js';
import { readB64, shareFile } from './platform.js';

const BLUE = [30, 111, 255], GREY = [110, 120, 140];

// Đọc ảnh, thu nhỏ còn tối đa 1400px, trả về JPEG base64 + kích thước
async function loadImg(path) {
  const b64 = await readB64(path); if (!b64) return null;
  const mime = b64.startsWith('iVBOR') ? 'image/png' : 'image/jpeg';
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = `data:${mime};base64,${b64}`; });
  const k = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
  return { b64: c.toDataURL('image/jpeg', 0.82).split(',')[1], w, h };
}
async function prepare(doc, onStep) {
  let n = 0; const total = doc.items.reduce((s, it) => s + (it.imgs ? it.imgs.paths.length : 0), 0);
  for (const it of doc.items) if (it.imgs) {
    it.imgs.data = [];
    for (const p of it.imgs.paths) { try { const d = await loadImg(p); if (d) it.imgs.data.push(d); } catch (e) { console.warn(e); } onStep && onStep(++n, total); }
  }
}
const b64ToBytes = b64 => { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
const safeName = s => (s || 'bao-cao').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'bao-cao';

// ---------------- PDF ----------------
export async function exportPdf(doc, onStep) {
  await prepare(doc, onStep);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  pdf.addFileToVFS('dv.ttf', FONT_REGULAR); pdf.addFont('dv.ttf', 'DV', 'normal');
  pdf.addFileToVFS('dvb.ttf', FONT_BOLD); pdf.addFont('dvb.ttf', 'DV', 'bold');
  pdf.addFileToVFS('dvi.ttf', FONT_ITALIC); pdf.addFont('dvi.ttf', 'DV', 'italic');
  const W = 210, H = 297, M = 15, CW = W - 2 * M; let y = M;
  const need = h => { if (y + h > H - M) { pdf.addPage(); y = M; } };
  const text = (t, size, style = 'normal', color = [20, 28, 45], indent = 0, align) => {
    pdf.setFont('DV', style); pdf.setFontSize(size); pdf.setTextColor(...color);
    const lines = pdf.splitTextToSize(String(t), CW - indent); const lh = size * 0.42;
    for (const l of lines) { need(lh); pdf.text(l, align === 'center' ? W / 2 : M + indent, y + lh * 0.8, align === 'center' ? { align: 'center' } : undefined); y += lh; }
  };
  // tiêu đề
  pdf.setFillColor(...BLUE); pdf.rect(0, 0, W, 4, 'F');
  y = M + 2; text(doc.title, 17, 'bold', [11, 42, 102]);
  if (doc.subtitle) { y += 1; text(doc.subtitle, 9.5, 'normal', GREY); }
  y += 3; pdf.setDrawColor(215, 225, 240); pdf.line(M, y, W - M, y); y += 5;
  for (const it of doc.items) {
    if (it.h) { y += 3; need(10); text(it.h, 12.5, 'bold', BLUE); y += 1.5; }
    else if (it.p) { text(it.p, 10.5); y += 1.5; }
    else if (it.li) { text('•  ' + it.li, 10.5, 'normal', undefined, 3); y += 0.8; }
    else if (it.chk != null) { text((it.done ? '☑  ' : '☐  ') + it.chk, 10.5, 'normal', it.done ? GREY : undefined, 3); y += 0.8; }
    else if (it.kv) {
      autoTable(pdf, { startY: y, margin: { left: M, right: M }, body: it.kv, theme: 'plain', styles: { font: 'DV', fontSize: 9.5, cellPadding: 1.2 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42, textColor: GREY } } });
      y = pdf.lastAutoTable.finalY + 3;
    } else if (it.table) {
      autoTable(pdf, { startY: y, margin: { left: M, right: M }, head: [it.table.cols], body: it.table.rows, theme: 'grid',
        styles: { font: 'DV', fontSize: 8.8, cellPadding: 1.8, lineColor: [215, 225, 240], lineWidth: 0.2, valign: 'top' },
        headStyles: { font: 'DV', fontStyle: 'bold', fillColor: BLUE, textColor: 255 }, alternateRowStyles: { fillColor: [245, 248, 254] },
        columnStyles: it.table.colStyles || {} });
      y = pdf.lastAutoTable.finalY + 4;
    } else if (it.imgs) {
      const d = it.imgs.data; y += 1;
      if (d.length === 1) {
        let w = Math.min(120, CW), h = w * d[0].h / d[0].w; if (h > 110) { h = 110; w = h * d[0].w / d[0].h; }
        need(h + 2); pdf.addImage(d[0].b64, 'JPEG', (W - w) / 2, y, w, h); y += h + 2;
      } else if (d.length) {
        const gap = 4, cw = (CW - gap) / 2;
        for (let i = 0; i < d.length; i += 2) {
          const pair = d.slice(i, i + 2); const hs = pair.map(x => Math.min(75, cw * x.h / x.w)); const rh = Math.max(...hs);
          need(rh + 2);
          pair.forEach((x, j) => { let h = hs[j], w = h * x.w / x.h; if (w > cw) { w = cw; h = w * x.h / x.w; } pdf.addImage(x.b64, 'JPEG', M + j * (cw + gap) + (cw - w) / 2, y + (rh - h) / 2, w, h); });
          y += rh + gap;
        }
      }
      if (it.imgs.codes?.length) text('Mã vật tư: ' + it.imgs.codes.join('  ·  '), 10, 'bold', [11, 42, 102], 0, 'center');
      if (it.imgs.badge) text(it.imgs.badge, 9.5, 'bold', it.imgs.badgeColor || GREY, 0, 'center');
      text(`Hình ${it.imgs.no}${it.imgs.caption ? ': ' + it.imgs.caption : ''}`, 9.5, 'italic', GREY, 0, 'center');
      y += 4;
    }
  }
  // số trang
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { pdf.setPage(i); pdf.setFont('DV', 'normal'); pdf.setFontSize(8); pdf.setTextColor(...GREY); pdf.text(`Bảo Trì Thủy Lực · ${doc.title} · trang ${i}/${pages}`, W / 2, H - 7, { align: 'center' }); }
  const b64 = pdf.output('datauristring').split(',')[1];
  await shareFile(safeName(doc.title) + '.pdf', b64, 'application/pdf');
}

// ---------------- Word ----------------
const R = (t, o = {}) => new TextRun({ text: String(t ?? ''), font: 'Arial', size: o.size || 22, bold: o.bold, italics: o.italics, color: o.color });
const noBorder = { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } };
function imgRun(x, maxW, maxH) {
  let w = maxW, h = w * x.h / x.w; if (h > maxH) { h = maxH; w = h * x.w / x.h; }
  return new ImageRun({ type: 'jpg', data: b64ToBytes(x.b64), transformation: { width: Math.round(w), height: Math.round(h) } });
}
export async function exportDocx(doc, onStep) {
  await prepare(doc, onStep);
  const kids = [];
  kids.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [R(doc.title, { size: 36, bold: true, color: '0B2A66' })] }));
  if (doc.subtitle) kids.push(new Paragraph({ spacing: { after: 200 }, children: [R(doc.subtitle, { size: 19, color: '6E788C' })] }));
  for (const it of doc.items) {
    if (it.h) kids.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 }, children: [R(it.h, { size: 26, bold: true, color: '1E6FFF' })] }));
    else if (it.p) kids.push(new Paragraph({ spacing: { after: 100 }, children: [R(it.p)] }));
    else if (it.li) kids.push(new Paragraph({ bullet: { level: 0 }, children: [R(it.li)] }));
    else if (it.chk != null) kids.push(new Paragraph({ indent: { left: 360 }, children: [R((it.done ? '☑ ' : '☐ ') + it.chk, { color: it.done ? '6E788C' : undefined })] }));
    else if (it.kv) kids.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: it.kv.map(([k, v]) => new TableRow({ children: [
      new TableCell({ borders: noBorder, width: { size: 28, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [R(k, { bold: true, color: '6E788C', size: 20 })] })] }),
      new TableCell({ borders: noBorder, children: [new Paragraph({ children: [R(v, { size: 20 })] })] })] })) }));
    else if (it.table) {
      kids.push(new Paragraph({ children: [] }));
      kids.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
        new TableRow({ tableHeader: true, children: it.table.cols.map(c => new TableCell({ shading: { type: ShadingType.CLEAR, fill: '1E6FFF', color: 'auto' }, children: [new Paragraph({ children: [R(c, { bold: true, color: 'FFFFFF', size: 18 })] })] })) }),
        ...it.table.rows.map(r => new TableRow({ children: r.map(c => new TableCell({ children: String(c ?? '').split('\n').map(line => new Paragraph({ children: [R(line, { size: 18 })] })) })) }))] }));
    } else if (it.imgs) {
      const d = it.imgs.data;
      if (d.length === 1) kids.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120 }, children: [imgRun(d[0], 420, 380)] }));
      else if (d.length) {
        const rows = []; for (let i = 0; i < d.length; i += 2) rows.push(new TableRow({ children: [0, 1].map(j => new TableCell({ borders: noBorder, width: { size: 50, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: d[i + j] ? [imgRun(d[i + j], 290, 260)] : [] })] })) }));
        kids.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));
      }
      if (it.imgs.codes?.length) kids.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [R('Mã vật tư: ' + it.imgs.codes.join('  ·  '), { bold: true, color: '0B2A66', size: 20 })] }));
      if (it.imgs.badge) kids.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [R(it.imgs.badge, { bold: true, size: 19, color: it.imgs.badgeHex || '6E788C' })] }));
      kids.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [R(`Hình ${it.imgs.no}${it.imgs.caption ? ': ' + it.imgs.caption : ''}`, { italics: true, color: '6E788C', size: 19 })] }));
    }
  }
  const d = new Document({ creator: 'Bảo Trì Thủy Lực', title: doc.title, sections: [{ properties: { page: { margin: { top: 900, bottom: 900, left: 900, right: 900 } } }, children: kids }] });
  const b64 = await Packer.toBase64String(d);
  await shareFile(safeName(doc.title) + '.docx', b64, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}
