// Chỉnh dự án Android sau khi "npx cap add android": icon, màn hình chờ, quyền, phiên bản.
const fs = require('fs'), path = require('path');
const RES = 'android/app/src/main/res';
const cp = (src, dst) => {
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); cp(s, d); } else fs.copyFileSync(s, d);
  }
};
cp('resources/res', RES);
const w = (f, fn) => { const p = path.join(RES, f); fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8'))); };

// màu nền icon
w('values/ic_launcher_background.xml', s => s.replace(/#[0-9A-Fa-f]{6}/, '#0E1520'));

// màn hình chờ: nền tối + logo
for (const d of fs.readdirSync(RES)) {
  const p = path.join(RES, d, 'splash.png'); if (fs.existsSync(p)) fs.unlinkSync(p);
}
fs.writeFileSync(path.join(RES, 'drawable/splash.xml'), `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item><color android:color="#0B111A"/></item>
  <item><bitmap android:gravity="center" android:src="@mipmap/ic_launcher_foreground"/></item>
</layer-list>`);
w('values/styles.xml', s => s.replace('<item name="android:background">@drawable/splash</item>',
  '<item name="android:background">@drawable/splash</item>\n        <item name="windowSplashScreenBackground">#0B111A</item>\n        <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher_foreground</item>'));

// cho phép mở file lưu trong bộ nhớ app
w('xml/file_paths.xml', s => s.includes('files-path') ? s : s.replace('</paths>', '    <files-path name="app_files" path="." />\n</paths>'));

// quyền
const man = 'android/app/src/main/AndroidManifest.xml';
let m = fs.readFileSync(man, 'utf8');
for (const p of ['POST_NOTIFICATIONS', 'SCHEDULE_EXACT_ALARM', 'RECEIVE_BOOT_COMPLETED', 'WAKE_LOCK', 'VIBRATE']) {
  if (!m.includes(`android.permission.${p}"`)) m = m.replace('</manifest>', `    <uses-permission android:name="android.permission.${p}" />\n</manifest>`);
}
fs.writeFileSync(man, m);

// số phiên bản tăng theo mỗi lần build để cài đè bản cũ
const run = parseInt(process.env.GITHUB_RUN_NUMBER || '1', 10);
const bg = 'android/app/build.gradle';
let g = fs.readFileSync(bg, 'utf8').replace(/versionCode \d+/, `versionCode ${run}`).replace(/versionName "[^"]*"/, `versionName "1.0.${run}"`);

// ký mọi bản build bằng CÙNG một chìa khóa (resources/debug.keystore) để cài đè không mất dữ liệu
if (!g.includes('signingConfigs')) {
  g = g.replace(/\n    buildTypes \{/, `
    signingConfigs {
        fixedKey {
            storeFile rootProject.file('../resources/debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.fixedKey
        }`);
}
if (!g.includes('signingConfig signingConfigs.fixedKey')) { console.error('patch-android: KHÔNG chèn được cấu hình ký!'); process.exit(1); }
fs.writeFileSync(bg, g);
console.log('patch-android: OK, version 1.0.' + run);
