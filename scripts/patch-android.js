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
w('values/ic_launcher_background.xml', s => s.replace(/#[0-9A-Fa-f]{6}/, '#1E6FFF'));
// nền biểu tượng thích ứng: gradient xanh
fs.writeFileSync(path.join(RES, 'drawable/ic_launcher_bg.xml'), `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
  <gradient android:angle="315" android:startColor="#4DA3FF" android:centerColor="#1E6FFF" android:endColor="#0B47C9" android:type="linear"/>
</shape>`);
for (const f of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
  const p = path.join(RES, 'mipmap-anydpi-v26', f);
  if (fs.existsSync(p)) fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('@color/ic_launcher_background', '@drawable/ic_launcher_bg'));
}

// màn hình chờ: nền tối + logo
for (const d of fs.readdirSync(RES)) {
  const p = path.join(RES, d, 'splash.png'); if (fs.existsSync(p)) fs.unlinkSync(p);
}
fs.writeFileSync(path.join(RES, 'drawable/splash.xml'), `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item><color android:color="#1E6FFF"/></item>
  <item><bitmap android:gravity="center" android:src="@mipmap/ic_launcher_foreground"/></item>
</layer-list>`);
w('values/styles.xml', s => s.replace('<item name="android:background">@drawable/splash</item>',
  '<item name="android:background">@drawable/splash</item>\n        <item name="windowSplashScreenBackground">#1E6FFF</item>\n        <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher_foreground</item>'));

// cho phép mở file lưu trong bộ nhớ app
w('xml/file_paths.xml', s => s.includes('files-path') ? s : s.replace('</paths>', '    <files-path name="app_files" path="." />\n</paths>'));


// Vẽ app tràn ra sau thanh trạng thái & thanh điều hướng (bỏ khoảng trắng trên/dưới trên Android ≤14)
const ma = 'android/app/src/main/java/vn/tien/baotri/MainActivity.java';
fs.writeFileSync(ma, `package vn.tien.baotri;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FileRangePlugin.class);
        registerPlugin(TextOcrPlugin.class);
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        WindowCompat.setDecorFitsSystemWindows(w, false);
        w.setStatusBarColor(Color.TRANSPARENT);
        w.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            w.setNavigationBarContrastEnforced(false);
            w.setStatusBarContrastEnforced(false);
        }
        w.getDecorView().setBackgroundColor(Color.parseColor("#081225"));
    }
}
`);

// Plugin đọc từng đoạn file (để mở PDF lớn nhanh, không phải nạp cả file vào bộ nhớ)
fs.writeFileSync('android/app/src/main/java/vn/tien/baotri/FileRangePlugin.java', `package vn.tien.baotri;

import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.RandomAccessFile;

@CapacitorPlugin(name = "FileRange")
public class FileRangePlugin extends Plugin {
    private File resolve(String path) {
        return new File(getContext().getFilesDir(), path);
    }

    @PluginMethod
    public void size(PluginCall call) {
        String path = call.getString("path");
        if (path == null) { call.reject("missing path"); return; }
        File f = resolve(path);
        if (!f.isFile()) { call.reject("not found"); return; }
        JSObject r = new JSObject();
        r.put("size", String.valueOf(f.length()));
        call.resolve(r);
    }

    @PluginMethod
    public void read(PluginCall call) {
        String path = call.getString("path");
        String offS = call.getString("offset");
        String lenS = call.getString("length");
        if (path == null || offS == null || lenS == null) { call.reject("missing args"); return; }
        long off;
        int len;
        try { off = Long.parseLong(offS); len = Integer.parseInt(lenS); } catch (NumberFormatException e) { call.reject("bad args"); return; }
        if (off < 0 || len <= 0 || len > 16 * 1024 * 1024) { call.reject("bad range"); return; }
        RandomAccessFile raf = null;
        try {
            raf = new RandomAccessFile(resolve(path), "r");
            raf.seek(off);
            byte[] buf = new byte[len];
            int n = 0;
            while (n < len) {
                int k = raf.read(buf, n, len - n);
                if (k < 0) break;
                n += k;
            }
            JSObject r = new JSObject();
            r.put("data", Base64.encodeToString(buf, 0, n, Base64.NO_WRAP));
            r.put("length", n);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("read error: " + e.getMessage());
        } finally {
            if (raf != null) { try { raf.close(); } catch (Exception ignored) {} }
        }
    }
}
`);

// Plugin đọc chữ trên ảnh tem vật tư (Google ML Kit, chạy ngay trên máy, không cần mạng)
fs.writeFileSync('android/app/src/main/java/vn/tien/baotri/TextOcrPlugin.java', `package vn.tien.baotri;

import android.graphics.Rect;
import android.net.Uri;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import java.io.File;

@CapacitorPlugin(name = "TextOcr")
public class TextOcrPlugin extends Plugin {
    private TextRecognizer recognizer;

    @PluginMethod
    public void recognize(final PluginCall call) {
        String path = call.getString("path");
        if (path == null) { call.reject("missing path"); return; }
        File f = new File(getContext().getFilesDir(), path);
        if (!f.isFile()) { call.reject("not found"); return; }
        InputImage image;
        try {
            image = InputImage.fromFilePath(getContext(), Uri.fromFile(f));
        } catch (Exception e) {
            call.reject("image error: " + e.getMessage());
            return;
        }
        if (recognizer == null) recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        recognizer.process(image)
            .addOnSuccessListener(result -> {
                JSArray lines = new JSArray();
                for (Text.TextBlock b : result.getTextBlocks()) {
                    for (Text.Line l : b.getLines()) {
                        JSObject o = new JSObject();
                        o.put("text", l.getText());
                        Rect r = l.getBoundingBox();
                        if (r != null) {
                            o.put("x", r.left);
                            o.put("y", r.top);
                            o.put("w", r.width());
                            o.put("h", r.height());
                        }
                        lines.put(o);
                    }
                }
                JSObject ret = new JSObject();
                ret.put("text", result.getText());
                ret.put("lines", lines);
                call.resolve(ret);
            })
            .addOnFailureListener(e -> call.reject("ocr error: " + e.getMessage()));
    }
}
`);

// quyền
const man = 'android/app/src/main/AndroidManifest.xml';
let m = fs.readFileSync(man, 'utf8');
for (const p of ['POST_NOTIFICATIONS', 'SCHEDULE_EXACT_ALARM', 'RECEIVE_BOOT_COMPLETED', 'WAKE_LOCK', 'VIBRATE']) {
  if (!m.includes(`android.permission.${p}"`)) m = m.replace('</manifest>', `    <uses-permission android:name="android.permission.${p}" />\n</manifest>`);
}
// lưu file ra thư mục Documents (Android 10 trở xuống cần quyền này)
if (!m.includes('WRITE_EXTERNAL_STORAGE')) m = m.replace('</manifest>', '    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />\n    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />\n</manifest>');
if (!m.includes('requestLegacyExternalStorage')) m = m.replace('<application', '<application\n        android:requestLegacyExternalStorage="true"');
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
// thư viện đọc chữ ML Kit (mô hình chữ Latin có sẵn trong app → dùng được khi không có mạng)
if (!g.includes('com.google.mlkit:text-recognition')) g = g.replace(/\ndependencies \{/, "\ndependencies {\n    implementation 'com.google.mlkit:text-recognition:16.0.1'");
if (!g.includes('abiFilters')) g = g.replace(/defaultConfig \{/, "defaultConfig {\n        ndk { abiFilters 'arm64-v8a', 'armeabi-v7a' }");
if (!g.includes('com.google.mlkit:text-recognition')) { console.error('patch-android: KHÔNG chèn được ML Kit!'); process.exit(1); }
if (!g.includes('signingConfig signingConfigs.fixedKey')) { console.error('patch-android: KHÔNG chèn được cấu hình ký!'); process.exit(1); }
fs.writeFileSync(bg, g);
console.log('patch-android: OK, version 1.0.' + run);
