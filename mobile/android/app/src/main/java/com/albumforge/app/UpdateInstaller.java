package com.albumforge.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Local plugin: downloads the APK update natively (no CORS) and hands it to
 * the Android package installer via FileProvider. */
@CapacitorPlugin(name = "UpdateInstaller")
public class UpdateInstaller extends Plugin {

    @PluginMethod
    public void downloadApk(PluginCall call) {
        String url = call.getString("url");
        String fileName = call.getString("fileName", "AlbumForge-update.apk");
        if (url == null) {
            call.reject("url is required");
            return;
        }

        new Thread(() -> {
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) {
                    call.reject("Could not create cache dir");
                    return;
                }
                File out = new File(dir, fileName);

                HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setInstanceFollowRedirects(true);
                conn.setRequestProperty("User-Agent", "AlbumForge");
                conn.connect();
                int status = conn.getResponseCode();
                if (status < 200 || status >= 300) {
                    conn.disconnect();
                    call.reject("Download failed with HTTP " + status);
                    return;
                }
                long total = conn.getContentLengthLong();
                long read = 0;
                InputStream in = new BufferedInputStream(conn.getInputStream());
                FileOutputStream fos = new FileOutputStream(out);
                byte[] buf = new byte[64 * 1024];
                int n;
                int lastPercent = -1;
                while ((n = in.read(buf)) > 0) {
                    fos.write(buf, 0, n);
                    read += n;
                    if (total > 0) {
                        int percent = (int) Math.min(99, (read * 100) / total);
                        if (percent != lastPercent) {
                            lastPercent = percent;
                            JSObject data = new JSObject();
                            data.put("percent", percent);
                            notifyListeners("downloadProgress", data);
                        }
                    }
                }
                fos.close();
                in.close();
                conn.disconnect();

                JSObject ret = new JSObject();
                ret.put("path", out.getAbsolutePath());
                ret.put("size", read);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Download failed: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("path is required");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !getContext().getPackageManager().canRequestPackageInstalls()) {
            getActivity().runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(
                            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + getContext().getPackageName()));
                    getContext().startActivity(intent);
                } catch (Exception ignored) {
                }
            });
            JSObject ret = new JSObject();
            ret.put("needsPermission", true);
            call.resolve(ret);
            return;
        }

        File file = new File(path);
        if (!file.exists()) {
            call.reject("APK file not found");
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                Uri uri = FileProvider.getUriForFile(
                        getContext(),
                        getContext().getPackageName() + ".fileprovider",
                        file);
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                call.resolve(new JSObject());
            } catch (Exception e) {
                call.reject("Could not open installer: " + e.getMessage());
            }
        });
    }
}
