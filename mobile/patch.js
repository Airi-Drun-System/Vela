"use strict";
const fs = require("fs"), path = require("path");
const app = path.join(__dirname, "..", "android", "app");
const must = (ok, what) => {
  if (!ok) throw new Error("не нашлось: " + what);
};
const mf = path.join(app, "src", "main", "AndroidManifest.xml");
let m = fs.readFileSync(mf, "utf8");
must(m.includes("</manifest>") && m.includes("@xml/file_paths"), "manifest");
m = m.replace("</manifest>", ["RECORD_AUDIO", "MODIFY_AUDIO_SETTINGS", "POST_NOTIFICATIONS", "REQUEST_INSTALL_PACKAGES", "CAMERA"].map((p) => `    <uses-permission android:name="android.permission.${p}" />`).join("\n") + "\n</manifest>");
fs.writeFileSync(mf, m);
const java = path.join(app, "src", "main", "java", "com", "vegasdev", "vela");
for (const f of ["MainActivity.java", "VelaUpdate.java"]) fs.copyFileSync(path.join(__dirname, "android", f), path.join(java, f));
fs.writeFileSync(path.join(app, "src", "main", "res", "xml", "file_paths.xml"), '<?xml version="1.0" encoding="utf-8"?>\n<paths><cache-path name="cache" path="." /><external-path name="ext" path="." /></paths>\n');
const draw = path.join(app, "src", "main", "res", "drawable");
fs.mkdirSync(draw, { recursive: true });
fs.writeFileSync(path.join(draw, "ic_stat_vela.xml"), '<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="32" android:viewportHeight="32"><path android:fillColor="#FFFFFFFF" android:pathData="M9,24.5 L17,5.5 L18.2,24.5 Z M19.4,9.5 L24.7,24.5 L19.4,24.5 Z"/></vector>');
const gf = path.join(app, "build.gradle");
let g = fs.readFileSync(gf, "utf8");
must(/versionCode \d+/.test(g) && g.includes("android {"), "gradle");
g = g.replace(/versionCode \d+/, `versionCode ${Number(process.env.VB) || 1}`).replace(/versionName "[^"]*"/, `versionName "${process.env.VV || "0.1.0"}"`).replace("android {", `android {
    signingConfigs { debug { if (System.getenv("LN_KEYSTORE")) { storeFile file(System.getenv("LN_KEYSTORE")); storePassword "android"; keyAlias "androiddebugkey"; keyPassword "android" } } }`);
fs.writeFileSync(gf, g);
console.log("android пропатчен");
