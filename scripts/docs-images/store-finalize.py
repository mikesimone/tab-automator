import os
import struct
from PIL import Image

SRC = os.environ.get("TA_TMP", "/tmp/ta-docs-images")
DEST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "docs", "store")

NAMES = {
    "rules": "store_1_rules.png",
    "backup": "store_2_backup_sync.png",
    "workspaces": "store_3_workspaces.png",
    "sessions": "store_4_sessions.png",
    "rule-tools": "store_5_url_tester_and_pause.png",
    "own-window": "store_6_own_window_rule.png",
    "share-rules": "store_7_share_rules.png",
}

for setname, subdir in (("set-amethyst", ""),):
    out_dir = os.path.join(DEST, subdir) if subdir else DEST
    os.makedirs(out_dir, exist_ok=True)
    for key, name in NAMES.items():
        img = Image.open(os.path.join(SRC, setname, key + ".png")).convert("RGB")
        assert img.size == (1280, 800), (key, img.size)
        target = os.path.join(out_dir, name)
        img.save(target, "PNG", optimize=True)
        with open(target, "rb") as fh:
            head = fh.read(33)
        w, h = struct.unpack(">II", head[16:24])
        color_type = head[25]
        assert (w, h) == (1280, 800) and color_type == 2, (target, w, h, color_type)
        print(f"{os.path.relpath(target, DEST):45s} {w}x{h} 24-bit RGB, {os.path.getsize(target)//1024} KB")
