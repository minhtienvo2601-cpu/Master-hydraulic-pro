// Tách MÃ VẬT TƯ và TÊN VẬT TƯ từ chữ đọc được trên tem kho, dạng:
//   1050190160250 - Ống mềm 2ĐC, FL20xHAL90xSHASTx1400 - VT210 - ONG - …/2 - STT16 - 4501059561 - Ngày 08.09.26
// Chỉ lấy dòng mã và tên; phần phía sau (kho, nhóm, STT, PO, ngày) bỏ qua.

// ký tự hay bị đọc nhầm trong dãy số
const toDigit = t => t.replace(/[lI|!\]\[]/g, '1').replace(/[oOD]/g, '0').replace(/[sS]/g, '5').replace(/[B]/g, '8').replace(/[Z]/g, '2');

export function parseLabel(text) {
  const lines = String(text || '').split(/\r?\n+/).map(s => s.trim()).filter(Boolean);
  let full = lines.join(' ').replace(/\s+/g, ' ');
  // dãy số bị tách bởi khoảng trắng (1050 190160250) → nối lại
  full = full.replace(/(\d)\s(?=\d{2,}\b)/g, '$1');
  // tìm mã: cụm 9–17 ký tự gần như toàn số
  const cands = []; const re = /[0-9lIoOD|]{9,17}/g; let m;
  while ((m = re.exec(full))) {
    const tok = m[0]; const digits = (tok.match(/\d/g) || []).length;
    if (digits >= 8 && digits >= tok.length - 3) cands.push({ code: toDigit(tok), end: m.index + tok.length, idx: m.index });
  }
  // ưu tiên mã 12–14 số; tránh nhầm với số PO (10 số, bắt đầu 45)
  const pick = cands.find(c => c.code.length >= 12 && c.code.length <= 14) || cands.find(c => !(c.code.length === 10 && c.code.startsWith('45')));
  if (!pick) return { code: '', name: '' };
  let rest = full.slice(pick.end).replace(/^[\s\-–—:.,_~]+/, '');
  // cắt tên tại phần thông tin kho phía sau
  const stops = [
    /(?:^|[\s\-\\/|])?(?:VT|TT|YT)\s?\d{3}\b/,   // mã kho VT210 / TT210 (có thể dính liền tên: x3100TT210)
    /\s-\s*ONG\b/i, /\bONG\s*-/, /\bS?TT\s?\d{1,3}\s*-/, /\b45\d{8}\b/, /\bNg[aàá]y\b/i, /…\s*\/\s*\d/, /\.{2,}\s*\/\s*\d/,
  ];
  let cut = rest.length;
  for (const s of stops) { const x = rest.match(s); if (x && x.index < cut) cut = x.index; }
  let name = rest.slice(0, cut).replace(/[\s\-–—,;:\\/|]+$/, '').replace(/\s+,/g, ',').trim();
  if (name.length > 160) name = name.slice(0, 160);
  return { code: pick.code, name };
}
