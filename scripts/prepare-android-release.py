from __future__ import annotations

import base64
import json
import os
import re
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path.cwd()
ANDROID = ROOT / "mobile" / "android"
RES = ANDROID / "app" / "src" / "main" / "res"


def prepare_manifest() -> None:
    path = ANDROID / "app" / "src" / "main" / "AndroidManifest.xml"
    text = path.read_text()
    permissions = [
        '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
        '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
        '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
        '<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />',
    ]
    missing = [permission for permission in permissions if permission not in text]
    if missing:
        text = text.replace(
            "<application",
            "\n    " + "\n    ".join(missing) + "\n\n    <application",
            1,
        )

    text = re.sub(
        r'android:icon="[^"]+"',
        'android:icon="@mipmap/yashflow_launcher"',
        text,
        count=1,
    )

    if re.search(r'android:roundIcon="[^"]+"', text):
        text = re.sub(
            r'android:roundIcon="[^"]+"',
            'android:roundIcon="@mipmap/yashflow_launcher_round"',
            text,
            count=1,
        )
    else:
        text = text.replace(
            "<application",
            '<application android:roundIcon="@mipmap/yashflow_launcher_round"',
            1,
        )

    provider = """
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/yashflow_file_paths" />
        </provider>
"""

    if "androidx.core.content.FileProvider" not in text:
        text = text.replace(
            "</application>",
            provider + "\n    </application>",
            1,
        )

    path.write_text(text)


def contain(
    image: Image.Image,
    canvas_px: int,
    max_ratio: float,
    background: tuple[int, int, int, int] | None = None,
) -> Image.Image:
    canvas = Image.new(
        "RGBA",
        (canvas_px, canvas_px),
        background if background is not None else (0, 0, 0, 0),
    )
    logo = image.copy()
    max_px = int(canvas_px * max_ratio)
    logo.thumbnail((max_px, max_px), Image.Resampling.LANCZOS)
    x = (canvas_px - logo.width) // 2
    y = (canvas_px - logo.height) // 2
    canvas.alpha_composite(logo, (x, y))
    return canvas


def prepare_brand_assets() -> None:
    source = Image.open(ROOT / "public" / "yashflow-logo.png").convert("RGBA")
    white = (255, 255, 255, 255)

    densities = {
        "mdpi": 48,
        "hdpi": 72,
        "xhdpi": 96,
        "xxhdpi": 144,
        "xxxhdpi": 192,
    }

    # Use unique YashFlow resource names so Capacitor's default ic_launcher
    # resources can never win through resource merging or launcher caching.
    for density, px in densities.items():
        folder = RES / f"mipmap-{density}"
        folder.mkdir(parents=True, exist_ok=True)

        icon = contain(source, px, 0.68, white)
        icon.save(folder / "yashflow_launcher.png")
        icon.save(folder / "yashflow_launcher_round.png")

    # Adaptive icon foreground: exact YashFlow logo with generous safe area.
    drawable_nodpi = RES / "drawable-nodpi"
    drawable_nodpi.mkdir(parents=True, exist_ok=True)
    contain(source, 432, 0.60).save(
        drawable_nodpi / "yashflow_logo_foreground.png"
    )

    drawable = RES / "drawable"
    drawable.mkdir(parents=True, exist_ok=True)

    # Splash uses the same exact logo, centered instead of stretched.
    contain(source, 1024, 0.38, white).save(drawable / "splash.png")

    values = RES / "values"
    values.mkdir(parents=True, exist_ok=True)
    (values / "yashflow_launcher_colors.xml").write_text(
        """<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="yashflow_launcher_background">#FFFFFF</color>
</resources>
"""
    )

    (drawable / "yashflow_launcher_foreground.xml").write_text(
        """<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item
        android:left="18dp"
        android:top="18dp"
        android:right="18dp"
        android:bottom="18dp">
        <bitmap
            android:src="@drawable/yashflow_logo_foreground"
            android:gravity="center" />
    </item>
</layer-list>
"""
    )

    adaptive = RES / "mipmap-anydpi-v26"
    adaptive.mkdir(parents=True, exist_ok=True)

    adaptive_xml = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/yashflow_launcher_background" />
    <foreground android:drawable="@drawable/yashflow_launcher_foreground" />
</adaptive-icon>
"""

    (adaptive / "yashflow_launcher.xml").write_text(adaptive_xml)
    (adaptive / "yashflow_launcher_round.xml").write_text(adaptive_xml)

    raw = RES / "raw"
    raw.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(
        ROOT / "public" / "sounds" / "notification.wav",
        raw / "yashflow_notification.wav",
    )



def prepare_native_updater() -> None:
    xml = RES / "xml"
    xml.mkdir(parents=True, exist_ok=True)
    (xml / "yashflow_file_paths.xml").write_text(
        """<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-files-path
        name="downloads"
        path="Download/" />
</paths>
"""
    )

    package_dir = (
        ANDROID
        / "app"
        / "src"
        / "main"
        / "java"
        / "in"
        / "yashlaser"
        / "yashflow"
    )
    package_dir.mkdir(parents=True, exist_ok=True)

    (package_dir / "YashFlowUpdaterPlugin.java").write_text(
        r"""package in.yashlaser.yashflow;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

@CapacitorPlugin(name = "YashFlowUpdater")
public class YashFlowUpdaterPlugin extends Plugin {

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");

        if (url == null || url.trim().isEmpty()) {
            call.reject("Update URL is required.");
            return;
        }

        Context context = getContext();

        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !context.getPackageManager().canRequestPackageInstalls()
        ) {
            Intent settingsIntent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + context.getPackageName())
            );
            settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(settingsIntent);

            JSObject result = new JSObject();
            result.put("started", false);
            result.put("permissionRequired", true);
            call.resolve(result);
            return;
        }

        File downloadDir =
            context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);

        if (downloadDir == null) {
            call.reject("Download directory is unavailable.");
            return;
        }

        File apkFile = new File(downloadDir, "YashFlow-update.apk");

        if (apkFile.exists()) {
            //noinspection ResultOfMethodCallIgnored
            apkFile.delete();
        }

        DownloadManager.Request request =
            new DownloadManager.Request(Uri.parse(url));

        request.setTitle("YashFlow Update");
        request.setDescription("Downloading the latest YashFlow release");
        request.setMimeType("application/vnd.android.package-archive");
        request.setNotificationVisibility(
            DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
        );
        request.setDestinationInExternalFilesDir(
            context,
            Environment.DIRECTORY_DOWNLOADS,
            "YashFlow-update.apk"
        );

        DownloadManager manager =
            (DownloadManager) context.getSystemService(
                Context.DOWNLOAD_SERVICE
            );

        if (manager == null) {
            call.reject("Android Download Manager is unavailable.");
            return;
        }

        final long downloadId = manager.enqueue(request);

        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context receiverContext, Intent intent) {
                long completedId = intent.getLongExtra(
                    DownloadManager.EXTRA_DOWNLOAD_ID,
                    -1
                );

                if (completedId != downloadId) {
                    return;
                }

                try {
                    receiverContext.unregisterReceiver(this);
                } catch (Exception ignored) {
                }

                if (!apkFile.exists() || apkFile.length() <= 0) {
                    return;
                }

                Uri apkUri = FileProvider.getUriForFile(
                    receiverContext,
                    receiverContext.getPackageName() + ".fileprovider",
                    apkFile
                );

                Intent installIntent = new Intent(Intent.ACTION_VIEW);
                installIntent.setDataAndType(
                    apkUri,
                    "application/vnd.android.package-archive"
                );
                installIntent.addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK |
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                );

                receiverContext.startActivity(installIntent);
            }
        };

        IntentFilter filter = new IntentFilter(
            DownloadManager.ACTION_DOWNLOAD_COMPLETE
        );

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(
                receiver,
                filter,
                Context.RECEIVER_NOT_EXPORTED
            );
        } else {
            context.registerReceiver(receiver, filter);
        }

        JSObject result = new JSObject();
        result.put("started", true);
        result.put("permissionRequired", false);
        result.put("downloadId", downloadId);
        call.resolve(result);
    }
}
"""
    )

    (package_dir / "MainActivity.java").write_text(
        r"""package in.yashlaser.yashflow;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(YashFlowUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
"""
    )


def apply_version() -> None:
    path = ANDROID / "app" / "build.gradle"
    text = path.read_text()
    version_code = os.environ["YASHFLOW_VERSION_CODE"]
    version_name = os.environ["YASHFLOW_VERSION_NAME"]

    text = re.sub(
        r"versionCode\s+\d+",
        f"versionCode {version_code}",
        text,
        count=1,
    )
    text = re.sub(
        r'versionName\s+"[^"]+"',
        f'versionName "{version_name}"',
        text,
        count=1,
    )
    path.write_text(text)


def prepare_signing() -> None:
    payload_path = Path("/tmp/yashflow-signing.json")
    payload = json.loads(payload_path.read_text())

    required = [
        "keystoreBase64",
        "storePassword",
        "keyAlias",
        "keyPassword",
    ]
    missing = [key for key in required if not payload.get(key)]
    if missing:
        raise RuntimeError(
            "Signing response is incomplete: " + ", ".join(missing)
        )

    keystore = ANDROID / "app" / "yashflow-release.jks"
    keystore.write_bytes(base64.b64decode(payload["keystoreBase64"]))

    properties = ANDROID / "yashflow-signing.properties"
    properties.write_text(
        "\n".join(
            [
                f"storePassword={payload['storePassword']}",
                f"keyAlias={payload['keyAlias']}",
                f"keyPassword={payload['keyPassword']}",
            ]
        )
        + "\n"
    )

    payload_path.unlink(missing_ok=True)

    gradle = ANDROID / "app" / "build.gradle"
    text = gradle.read_text()

    preamble = """def yashflowSigningProperties = new Properties()
def yashflowSigningPropertiesFile = rootProject.file("yashflow-signing.properties")
if (yashflowSigningPropertiesFile.exists()) {
    yashflowSigningProperties.load(new FileInputStream(yashflowSigningPropertiesFile))
}

"""
    if "def yashflowSigningProperties = new Properties()" not in text:
        text = preamble + text

    if "signingConfigs {" not in text:
        marker = "    buildTypes {"
        signing = """    signingConfigs {
        release {
            storeFile file("yashflow-release.jks")
            storePassword yashflowSigningProperties["storePassword"]
            keyAlias yashflowSigningProperties["keyAlias"]
            keyPassword yashflowSigningProperties["keyPassword"]
        }
    }

"""
        if marker not in text:
            raise RuntimeError("Android buildTypes block was not found.")
        text = text.replace(marker, signing + marker, 1)

    build_type_pattern = r"(buildTypes\s*\{\s*release\s*\{)"
    if "signingConfig signingConfigs.release" not in text:
        text, replacements = re.subn(
            build_type_pattern,
            r"\1\n            signingConfig signingConfigs.release",
            text,
            count=1,
        )
        if replacements != 1:
            raise RuntimeError("Android release buildType was not found.")

    gradle.write_text(text)


def main() -> None:
    prepare_manifest()
    prepare_brand_assets()
    prepare_native_updater()
    apply_version()
    prepare_signing()


if __name__ == "__main__":
    main()
