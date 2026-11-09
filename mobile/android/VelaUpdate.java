package com.vegasdev.vela;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "VelaUpdate")
public class VelaUpdate extends Plugin {
    @PluginMethod
    public void openFile(PluginCall call) {
        String name = call.getString("name", "file").replaceAll("[\\\\/:*?\"<>|]", "_");
        String type = call.getString("type", "application/octet-stream");
        String data = call.getString("data", "");
        try {
            File dir = new File(getContext().getCacheDir(), "files");
            dir.mkdirs();
            File f = new File(dir, name);
            try (FileOutputStream out = new FileOutputStream(f)) { out.write(Base64.decode(data, Base64.DEFAULT)); }
            Uri u = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
            Intent it = new Intent(Intent.ACTION_VIEW).setDataAndType(u, type).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(Intent.createChooser(it, name));
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "error" : e.getMessage());
        }
    }

    @PluginMethod
    public void install(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith("https://github.com/Airi-Drun-System/Vela/")) { call.reject("bad url"); return; }
        if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
            getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName())));
            call.reject("permission");
            return;
        }
        new Thread(() -> {
            File f = new File(getContext().getCacheDir(), "vela-update.apk");
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setInstanceFollowRedirects(true);
                for (int i = 0; i < 5 && c.getResponseCode() / 100 == 3; i++) {
                    String next = c.getHeaderField("Location");
                    c.disconnect();
                    c = (HttpURLConnection) new URL(next).openConnection();
                }
                long total = c.getContentLengthLong(), got = 0;
                int last = -1;
                try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(f)) {
                    byte[] buf = new byte[65536];
                    for (int n; (n = in.read(buf)) > 0; ) {
                        out.write(buf, 0, n);
                        got += n;
                        int p = total > 0 ? (int) (got * 100 / total) : 0;
                        if (p != last) { last = p; JSObject o = new JSObject(); o.put("p", p); notifyListeners("progress", o); }
                    }
                }
                Uri u = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
                Intent it = new Intent(Intent.ACTION_VIEW).setDataAndType(u, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(it);
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "error" : e.getMessage());
            }
        }).start();
    }
}
