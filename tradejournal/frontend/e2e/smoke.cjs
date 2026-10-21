// Kiểm thử end-to-end luồng chính (cần backend + frontend đang chạy).
//   BASE_URL=http://localhost:3000 node e2e/smoke.cjs
// Dùng thư viện `playwright` (npm i -D playwright hoặc bản cài toàn cục qua NODE_PATH).
const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = process.env.SCREENSHOT_DIR || path.join(os.tmpdir(), "tj-e2e");
fs.mkdirSync(OUT, { recursive: true });

function png(w, h, rgb) {
  // Tạo ảnh PNG hợp lệ (màu trơn) để kiểm thử upload
  const crc = (buf) => { let c, table = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; } let x = 0xffffffff; for (const b of buf) x = table[(x ^ b) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function ohlc() {
  let rows = ["time,open,high,low,close"]; let p = 2000; const t0 = Date.UTC(2024, 0, 22);
  for (let i = 0; i < 200; i++) { const o = p, c = p + Math.sin(i / 7) * 6; rows.push(`${new Date(t0 + i * 3600e3).toISOString()},${o.toFixed(2)},${(Math.max(o, c) + 2).toFixed(2)},${(Math.min(o, c) - 2).toFixed(2)},${c.toFixed(2)}`); p = c; }
  return rows.join("\n");
}

const step = (m) => console.log("✓", m);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  // Đặt locale như trình duyệt thật (container CI thường có LANG=C → Chromium báo tag "en-US@posix")
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh" });
  page.setDefaultTimeout(10000);
  const errors = [];
  global.__page = page;
  global.__errors = errors;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  const email = `e2e+${Date.now()}@example.com`;

  await page.goto(`${BASE}/`);
  await page.waitForURL(/\/login/);
  step("chưa đăng nhập → chuyển tới /login");

  await page.goto(`${BASE}/register`);
  const reg = page.locator("form");
  await reg.getByLabel("Tên hiển thị").fill("E2E Trader");
  await reg.getByLabel("Email").fill(email);
  await reg.getByLabel(/^Mật khẩu/).fill("mat-khau-e2e-123");
  await reg.getByLabel("Nhập lại mật khẩu").fill("mat-khau-e2e-123");
  await reg.getByLabel("Múi giờ hiển thị").fill("Asia/Ho_Chi_Minh");
  await page.getByRole("button", { name: "Đăng ký" }).click();
  await page.waitForURL(/\/guide/);
  step("đăng ký");

  await page.goto(`${BASE}/accounts`);
  await page.getByLabel("Tên tài khoản *").fill("Exness Live");
  await page.getByLabel("Số dư ban đầu").fill("10000");
  await page.getByRole("button", { name: "Thêm tài khoản" }).click();
  await page.getByText("Exness Live").waitFor();
  step("tạo tài khoản");

  await page.goto(`${BASE}/strategies`);
  await page.getByLabel("Tên chiến lược mới").fill("XAUUSD H4 Pullback");
  await page.getByRole("button", { name: "Tạo (kèm V1)" }).click();
  await page.getByText("V1 · XAUUSD H4 Pullback V1").waitFor();
  await page.getByRole("button", { name: "Sửa" }).first().click();
  await page.getByLabel("Quy tắc vào lệnh").fill("Xu hướng H4, hồi về vùng cầu H1, xác nhận nến nhấn chìm");
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await page.getByText(/Đã xác nhận/).waitFor();
  step("tạo chiến lược + xác nhận V1");

  await page.goto(`${BASE}/backtest/new`);
  await page.getByLabel("Tên phiên *").fill("XAUUSD H4 Trend Pullback V1");
  await page.getByLabel("Chiến lược / phiên bản *").selectOption({ label: "XAUUSD H4 Pullback V1" });
  await page.getByLabel("Thị trường *").fill("XAUUSD");
  await page.getByLabel("Khung thời gian *").fill("H1");
  await page.getByLabel("Mục tiêu số giao dịch *").fill("200");
  await page.getByLabel("Vốn ban đầu giả định").fill("10000");
  await page.getByLabel("Phương pháp equity").selectOption("r_fixed");
  await page.getByLabel("% rủi ro mỗi lệnh").fill("0.5");
  await page.getByRole("button", { name: "Tạo phiên backtest" }).click();
  await page.waitForURL(/\/backtest\/[0-9a-f-]{36}$/);
  step("tạo phiên backtest");

  const bt = [
    ["2024-01-23T09:00", "2024-01-23T15:00", "buy", "2000", "1990", "2030"],
    ["2024-01-24T09:00", "2024-01-24T12:00", "sell", "2010", "2020", "2020"],
    ["2024-01-25T09:00", "2024-01-25T18:00", "buy", "2005", "1995", "2025"],
  ];
  let saved = 0;
  for (const [en, ex, dir, e, sl, x] of bt) {
    const f = page.locator("form");
    await f.getByLabel(/Vào lệnh \*/).fill(en);
    await f.getByLabel(/Thoát lệnh/).fill(ex);
    await f.getByRole("button", { name: dir === "buy" ? "Buy" : "Sell" }).click();
    await f.getByLabel("Giá vào *").fill(e);
    await f.getByLabel("Stop Loss ban đầu").fill(sl);
    await f.getByLabel("Giá thoát giả định").fill(x);
    await f.getByRole("button", { name: "Lưu giao dịch" }).click();
    saved += 1;
    await page.getByText(`${saved}/200 giao dịch`).waitFor();
  }
  await page.getByText("3/200 giao dịch").waitFor();
  step("ghi 3 giao dịch backtest, tiến độ 3/200");
  await page.getByRole("tab", { name: "Thống kê" }).click();
  await page.getByText("+4R").first().waitFor(); // +3R −1R +2R
  await page.screenshot({ path: path.join(OUT, "backtest-stats.png"), fullPage: true });
  step("thống kê phiên backtest: tổng +4R");

  // Đăng xuất rồi đăng nhập "thiết bị khác": tiến độ còn nguyên
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "vi-VN", timezoneId: "Europe/London", isMobile: true, hasTouch: true });
  const mobile = await ctx2.newPage();
  mobile.on("pageerror", (e) => errors.push(e.message));
  mobile.on("dialog", (d) => d.accept());
  await mobile.goto(`${BASE}/login`);
  await mobile.getByLabel("Email").fill(email);
  await mobile.getByLabel("Mật khẩu").fill("mat-khau-e2e-123");
  await mobile.getByRole("button", { name: "Đăng nhập" }).click();
  await mobile.waitForURL(`${BASE}/`);
  await mobile.goto(`${BASE}/backtest`);
  await mobile.getByText("3/200 giao dịch (1.5%)").waitFor();
  await mobile.screenshot({ path: path.join(OUT, "mobile-backtest.png"), fullPage: true });
  step("thiết bị khác (màn hình điện thoại) thấy tiến độ 3/200");

  // Live trade
  await page.goto(`${BASE}/trades/new`);
  let f = page.locator("form");
  await f.getByLabel("Tài khoản *").selectOption({ label: "Exness Live (USD)" });
  await f.getByLabel("Thị trường *").fill("XAUUSD");
  await f.getByLabel("Trạng thái *").selectOption("closed");
  await f.getByLabel(/Vào lệnh \*/).fill("2024-01-29T16:00");
  await f.getByLabel(/Thoát lệnh/).fill("2024-01-29T20:00");
  await f.getByLabel("Giá vào *").fill("2002");
  await f.getByLabel("Stop Loss ban đầu").fill("1995");
  await f.getByLabel("Take Profit dự kiến").fill("2020");
  await f.getByLabel(/Giá thoát thực tế/).fill("2015");
  await f.getByLabel("Rủi ro dự kiến (tiền)").fill("100");
  await f.getByLabel(/Kết quả trước chi phí/).fill("185");
  await f.getByLabel("Commission").fill("5");
  await f.getByLabel("Khung thời gian").fill("H1");
  await f.getByLabel("Setup").fill("Pullback");
  await f.getByLabel("Bài học rút ra").fill("Chờ xác nhận đúng kế hoạch");
  await f.getByText("+1,8R").waitFor();
  await f.getByRole("button", { name: "Lưu giao dịch" }).click();
  await page.waitForURL(/\/trades\/[0-9a-f-]{36}$/);
  await page.getByText("+180,00").first().waitFor();
  step("tạo giao dịch Live: net +180, +1.8R");

  // Ảnh
  const img = path.join(OUT, "before.png");
  fs.writeFileSync(img, png(64, 40, [30, 120, 220]));
  await page.getByLabel("Chọn ảnh").setInputFiles(img);
  await page.getByPlaceholder("Chú thích").fill("Vùng cầu H1");
  await page.getByRole("button", { name: "Tải ảnh lên" }).click();
  await page.locator(".gallery figure").first().waitFor();
  step("tải ảnh trước khi vào lệnh");

  // Chưa có dữ liệu giá → không vẽ nến giả
  await page.getByText(/Ứng dụng không tạo dữ liệu nến giả/).waitFor();
  step("không có dữ liệu giá → hiển thị thông báo, không nến giả");

  const tradeUrl = page.url();
  await page.goto(`${BASE}/data`);
  const pricesCsv = path.join(OUT, "xau-h1.csv");
  fs.writeFileSync(pricesCsv, ohlc());
  const ps = page.locator("#prices");
  await ps.getByLabel("Mã").fill("XAUUSD");
  await ps.getByLabel("Khung").fill("H1");
  await ps.getByLabel("Nguồn dữ liệu *").fill("Dữ liệu kiểm thử e2e");
  await ps.getByLabel("Tệp CSV").setInputFiles(pricesCsv);
  await ps.getByRole("button", { name: "Nhập dữ liệu giá" }).click();
  await ps.getByText(/200 nến/).first().waitFor();
  await page.goto(tradeUrl);
  await page.locator(".price-chart canvas").first().waitFor();
  await page.screenshot({ path: path.join(OUT, "trade-detail.png"), fullPage: true });
  step("có dữ liệu giá → biểu đồ nến với Entry/SL/TP/Exit");

  // Dashboard: Live chỉ có 1 lệnh; Backtest có 3
  await page.goto(`${BASE}/`);
  await page.getByText("1 thắng · 0 thua · 0 hòa").waitFor();
  await page.screenshot({ path: path.join(OUT, "dashboard-live.png"), fullPage: true });
  await page.getByRole("tab", { name: "Backtest" }).click();
  await page.getByText("2 thắng · 1 thua · 0 hòa").waitFor();
  step("dashboard tách Live/Backtest");

  // Xuất CSV rồi nhập lại → toàn bộ là trùng
  const csvResp = await page.request.get(`${BASE}/api/v1/export/trades.csv?trade_type=live`);
  const csvPath = path.join(OUT, "live.csv");
  fs.writeFileSync(csvPath, await csvResp.body());
  await page.goto(`${BASE}/data`);
  await page.getByLabel("Tệp CSV (UTF-8)").setInputFiles(csvPath);
  await page.getByRole("button", { name: "Kiểm tra tệp" }).click();
  await page.getByText(/0 hợp lệ, 1 trùng/).waitFor();
  step("nhập lại CSV vừa xuất → phát hiện trùng, không nhập lặp");

  await mobile.goto(`${BASE}/`);
  await mobile.getByText("Win rate", { exact: true }).waitFor();
  await mobile.screenshot({ path: path.join(OUT, "mobile-dashboard.png"), fullPage: true });

  if (errors.length) { console.error("Lỗi JS trên trang:", errors); process.exit(1); }
  await browser.close();
  console.log(`\nE2E OK. Ảnh chụp: ${OUT}`);
})().catch(async (e) => {
  console.error(e);
  if (global.__errors?.length) console.error("Lỗi JS trên trang:", global.__errors);
  try { await global.__page.screenshot({ path: path.join(OUT, "failure.png"), fullPage: true }); console.error("Ảnh lỗi:", path.join(OUT, "failure.png")); } catch {}
  process.exit(1);
});
