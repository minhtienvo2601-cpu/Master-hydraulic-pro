// Chỉnh dự án Android sau khi "npx cap add android": icon, màn hình chờ, tràn viền, phiên bản, chữ ký.
const fs = require('fs'), path = require('path');
const RES = 'android/app/src/main/res';
const cp = (src, dst) => {
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); cp(s, d); } else fs.copyFileSync(s, d);
  }
};
cp('resources/res', RES);
const w = (f, fn) => { const p = path.join(RES, f); if (fs.existsSync(p)) fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8'))); };

// nền biểu tượng thích ứng: dải màu cam
w('values/ic_launcher_background.xml', s => s.replace(/#[0-9A-Fa-f]{6}/, '#F5A524'));
fs.writeFileSync(path.join(RES, 'drawable/ic_launcher_bg.xml'), `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
  <gradient android:angle="270" android:startColor="#FFBA3C" android:endColor="#E67800" android:type="linear"/>
</shape>`);
for (const f of ['ic_launcher.xml', 'ic_launcher_round.xml']) w(path.join('mipmap-anydpi-v26', f), s => s.replace('@color/ic_launcher_background', '@drawable/ic_launcher_bg'));

// màn hình chờ: nền tối + biểu tượng
for (const d of fs.readdirSync(RES)) { const p = path.join(RES, d, 'splash.png'); if (fs.existsSync(p)) fs.unlinkSync(p); }
fs.writeFileSync(path.join(RES, 'drawable/splash.xml'), `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item><color android:color="#0E1116"/></item>
  <item><bitmap android:gravity="center" android:src="@mipmap/ic_launcher_round"/></item>
</layer-list>`);
w('values/styles.xml', s => s.replace('<item name="android:background">@drawable/splash</item>',
  '<item name="android:background">@drawable/splash</item>\n        <item name="windowSplashScreenBackground">#0E1116</item>\n        <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher_foreground</item>'));

// vẽ tràn ra sau thanh trạng thái & thanh điều hướng (Android ≤ 14)
const dir = 'android/app/src/main/java/vn/tien/soviec';
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'MainActivity.java'), `package vn.tien.soviec;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        WindowCompat.setDecorFitsSystemWindows(w, false);
        w.setStatusBarColor(Color.TRANSPARENT);
        w.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            w.setNavigationBarContrastEnforced(false);
            w.setStatusBarContrastEnforced(false);
        }
        w.getDecorView().setBackgroundColor(Color.parseColor("#0E1116"));
    }
}
`);

// bàn phím đẩy giao diện lên (thanh công cụ soạn thảo nằm trên bàn phím)
const man = 'android/app/src/main/AndroidManifest.xml';
let m = fs.readFileSync(man, 'utf8');
if (!m.includes('windowSoftInputMode')) m = m.replace('<activity', '<activity\n            android:windowSoftInputMode="adjustResize"');
fs.writeFileSync(man, m);

// số phiên bản tăng theo mỗi lần build để cài đè bản cũ
const run = parseInt(process.env.GITHUB_RUN_NUMBER || '1', 10);
const bg = 'android/app/build.gradle';
let g = fs.readFileSync(bg, 'utf8').replace(/versionCode \d+/, `versionCode ${run}`).replace(/versionName "[^"]*"/, `versionName "1.0.${run}"`);
// ký mọi bản build bằng CÙNG một chìa khóa để cài đè không mất dữ liệu
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
