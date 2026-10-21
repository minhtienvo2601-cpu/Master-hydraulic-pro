// Định dạng số/thời gian. Thời gian lưu UTC ở backend, hiển thị theo múi giờ người dùng (hoặc múi giờ dữ liệu backtest).

export const NA = "N/A";

export function money(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined) return NA;
  return v.toLocaleString("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export function signedMoney(v: number | null | undefined): string {
  if (v === null || v === undefined) return NA;
  return (v > 0 ? "+" : "") + money(v);
}
export function r(v: number | null | undefined): string {
  if (v === null || v === undefined) return NA;
  return (v > 0 ? "+" : "") + v.toLocaleString("vi-VN", { maximumFractionDigits: 2 }) + "R";
}
export function pct(v: number | null | undefined): string {
  if (v === null || v === undefined) return NA;
  return v.toLocaleString("vi-VN", { maximumFractionDigits: 2 }) + "%";
}
export function num(v: number | null | undefined, digits = 5): string {
  if (v === null || v === undefined) return "";
  return v.toLocaleString("vi-VN", { maximumFractionDigits: digits });
}
export function tone(v: number | null | undefined): string {
  if (v === null || v === undefined || v === 0) return "";
  return v > 0 ? "pos" : "neg";
}

function parts(date: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(date)) o[p.type] = p.value;
  return o;
}

function tzOffsetMs(date: Date, tz: string): number {
  const p = parts(date, tz);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** "2024-01-02T09:30" (giờ treo tường tại tz) → ISO 8601 UTC có hậu tố Z. */
export function wallToIso(wall: string, tz: string): string {
  if (!wall) return "";
  const [d, t = "00:00"] = wall.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm, ss = 0] = t.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, day, hh, mm, ss);
  let utc = guess - tzOffsetMs(new Date(guess), tz);
  utc = guess - tzOffsetMs(new Date(utc), tz);
  return new Date(utc).toISOString();
}

/** ISO → "YYYY-MM-DDTHH:mm" theo tz (giá trị cho input datetime-local). */
export function isoToWall(iso: string | null | undefined, tz: string): string {
  if (!iso) return "";
  const p = parts(new Date(iso), tz);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function dt(iso: string | null | undefined, tz: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("vi-VN", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}
export function d(iso: string | null | undefined, tz?: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("vi-VN", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

export const LABEL = {
  status: { open: "Đang mở", closed: "Đã đóng", cancelled: "Đã hủy" } as Record<string, string>,
  direction: { buy: "Buy", sell: "Sell" } as Record<string, string>,
  outcome: { win: "Thắng", loss: "Thua", breakeven: "Hòa" } as Record<string, string>,
  compliance: { "": "—", followed: "Tuân thủ", partial: "Một phần", violated: "Vi phạm" } as Record<string, string>,
  rSource: { computed: "Kết quả ròng / rủi ro", manual: "Nhập tay", price: "Theo giá (Entry/SL/Exit)", none: "Không đủ dữ liệu" } as Record<string, string>,
  equity: { cash: "Theo tiền (vốn + lãi/lỗ ròng)", r_fixed: "Theo R, rủi ro cố định % vốn ban đầu", r_compound: "Theo R, rủi ro % vốn hiện tại (lãi kép)" } as Record<string, string>,
  imageKind: { before: "Trước khi vào", after: "Sau khi thoát", other: "Khác" } as Record<string, string>,
};
