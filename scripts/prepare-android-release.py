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
    apply_version()
    prepare_signing()


if __name__ == "__main__":
    main()
