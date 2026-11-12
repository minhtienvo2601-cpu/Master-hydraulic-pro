// Chỉnh dự án Android sau "npx cap add android": biểu tượng, màn hình chờ, tràn viền, phiên bản, chữ ký.
const fs = require('fs'), path = require('path');
const RES = 'android/app/src/main/res';
const cp = (src, dst) => {
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); cp(s, d); } else fs.copyFileSync(s, d);
  }
};
const must = (ok, msg) => { if (!ok) { console.error('patch-android: ' + msg); process.exit(1); } };
cp('resources/res', RES);

// nền biểu tượng thích ứng: gradient hồng cam
fs.mkdirSync(path.join(RES, 'drawable'), { recursive: true });
fs.writeFileSync(path.join(RES, 'drawable/ic_launcher_bg.xml'), `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
  <gradient android:angle="315" android:startColor="#FF8A5C" android:centerColor="#E8456B" android:endColor="#C92A5B" android:type="linear"/>
</shape>`);
for (const f of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
  const p = path.join(RES, 'mipmap-anydpi-v26', f);
  if (fs.existsSync(p)) fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/android:drawable="@(color|drawable)\/ic_launcher_background"/, 'android:drawable="@drawable/ic_launcher_bg"'));
}

// màn hình chờ: nền hồng + trái tim
for (const d of fs.readdirSync(RES)) { const p = path.join(RES, d, 'splash.png'); if (fs.existsSync(p)) fs.unlinkSync(p); }
fs.writeFileSync(path.join(RES, 'drawable/splash.xml'), `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item><color android:color="#E8456B"/></item>
  <item><bitmap android:gravity="center" android:src="@mipmap/ic_launcher_foreground"/></item>
</layer-list>`);
const st = path.join(RES, 'values/styles.xml');
let s = fs.readFileSync(st, 'utf8');
if (!s.includes('windowSplashScreenBackground')) s = s.replace('<item name="android:background">@drawable/splash</item>',
  '<item name="android:background">@drawable/splash</item>\n        <item name="windowSplashScreenBackground">#E8456B</item>\n        <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher_foreground</item>');
fs.writeFileSync(st, s);

// vẽ tràn ra sau thanh trạng thái / thanh điều hướng (giao diện tự chừa lề bằng --safe-area-inset-*)
const ma = 'android/app/src/main/java/vn/tien/fun/MainActivity.java';
must(fs.existsSync(ma), 'không thấy MainActivity.java');
fs.writeFileSync(ma, `package vn.tien.fun;

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
        w.getDecorView().setBackgroundColor(Color.parseColor("#E8456B"));
    }
}
`);

// số phiên bản tăng theo mỗi lần build để cài đè bản cũ
const run = parseInt(process.env.GITHUB_RUN_NUMBER || '1', 10);
const bg = 'android/app/build.gradle';
let g = fs.readFileSync(bg, 'utf8').replace(/versionCode \d+/, `versionCode ${run}`).replace(/versionName "[^"]*"/, `versionName "1.0.${run}"`);
// ký mọi bản build bằng CÙNG một chìa khóa để cài đè không mất dữ liệu đã lưu
if (!g.includes('signingConfigs')) {
  g = g.replace(/\n    buildTypes \{/, `
    signingConfigs {
        fixedKey {
            storeFile rootProject.file('../../resources/debug.keystore')
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
must(g.includes('signingConfig signingConfigs.fixedKey'), 'KHÔNG chèn được cấu hình ký');
must(fs.existsSync('../resources/debug.keystore'), 'không thấy resources/debug.keystore');
fs.writeFileSync(bg, g);
console.log('patch-android (Fun): OK, version 1.0.' + run);
