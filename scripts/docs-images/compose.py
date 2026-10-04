import os
import shutil
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
RAW = os.path.join(os.environ.get("TA_TMP", "/tmp/ta-docs-images"), "raw")
OUT = os.path.join(REPO, "docs", "images")
STORE = os.path.join(REPO, "docs", "store")
FONT = os.path.join(REPO, "public", "fonts", "quicksand-variable.ttf")
os.makedirs(OUT, exist_ok=True)

GROUND = (28, 21, 38)
PANEL = (36, 27, 48)
INK = (241, 233, 250)
MUTED = (169, 150, 184)
PURPLE = (194, 160, 226)
PINK = (255, 143, 208)


def font(size, weight="Bold"):
    f = ImageFont.truetype(FONT, size)
    try:
        f.set_variation_by_name(weight)
    except Exception:
        pass
    return f


def save(img, name):
    path = os.path.join(OUT, name)
    img.convert("RGB").save(path, "PNG", optimize=True)
    print(name, img.size)


def strip(name, width):
    im = Image.open(os.path.join(RAW, name + ".png")).convert("RGB")
    h = round(im.height * width / im.width)
    return im.resize((width, h), Image.LANCZOS)


def labelled_stack(items, title, subtitle, name):
    """items: list of (label, accent colour, strip image)."""
    pad = 48
    width = items[0][2].width + pad * 2
    head = 120
    row_gap = 34
    label_h = 44
    height = head + sum(label_h + it[2].height + row_gap for it in items) + 20
    canvas = Image.new("RGB", (width, height), GROUND)
    d = ImageDraw.Draw(canvas)
    d.text((pad, 30), title, font=font(40), fill=INK)
    d.text((pad, 80), subtitle, font=font(22, "Medium"), fill=MUTED)
    y = head
    for label, colour, img in items:
        pill_w = d.textlength(label, font=font(24)) + 36
        d.rounded_rectangle((pad, y, pad + pill_w, y + 36), radius=18, fill=colour)
        d.text((pad + 18, y + 4), label, font=font(24), fill=GROUND)
        y += label_h
        canvas.paste(img, (pad, y))
        y += img.height + row_gap
    save(canvas, name)


def legend(items, title, subtitle, strip_img, name):
    pad = 48
    width = strip_img.width + pad * 2
    cols = 2
    rows = (len(items) + 1) // 2
    head = 120
    cell_h = 92
    height = head + strip_img.height + 40 + rows * cell_h + 30
    canvas = Image.new("RGB", (width, height), GROUND)
    d = ImageDraw.Draw(canvas)
    d.text((pad, 30), title, font=font(40), fill=INK)
    d.text((pad, 80), subtitle, font=font(22, "Medium"), fill=MUTED)
    canvas.paste(strip_img, (pad, head))
    y0 = head + strip_img.height + 40
    col_w = (width - pad * 2) // cols
    for i, (colour, heading, body) in enumerate(items):
        x = pad + (i % cols) * col_w
        y = y0 + (i // cols) * cell_h
        d.rounded_rectangle((x, y + 4, x + 14, y + 62), radius=7, fill=colour)
        d.text((x + 30, y), heading, font=font(26), fill=INK)
        d.text((x + 30, y + 36), body, font=font(21, "Medium"), fill=MUTED)
    save(canvas, name)


W = 1800

# 03: before and after
labelled_stack(
    [
        ("Before: eight tabs, all named by the sites", MUTED, strip("strip-before", W)),
        ("After: renamed, grouped, pinned, muted and with icons", PINK, strip("strip-after", W)),
    ],
    "Tab Automator at work on a real tab strip",
    "The same eight tabs, before and after seven rules. Nothing was edited by hand.",
    "03-tab-strip-before-after.png",
)

# 04: what each part is
legend(
    [
        (PURPLE, "Pinned", "A rule pinned Google, and gave it an icon of your choice."),
        (PINK, "Groups", "Colored group chips (Dev, AI, Docs, Reading), filled in by rules."),
        (PURPLE, "Renamed titles", "Titles can be rewritten, e.g. [Docs] in front of reference pages."),
        (PINK, "Muted + icons", "YouTube is muted automatically; every site can get its own icon."),
    ],
    "What the rules did",
    "Every part of this tab strip came from a rule, not from clicking around.",
    strip("strip-after", W),
    "04-tab-strip-what-changed.png",
)

# 11: rules on versus paused (only when the paused capture exists)
if os.path.exists(os.path.join(RAW, "strip-paused.png")):
    labelled_stack(
        [
            ("Rules on", PINK, strip("strip-after", W)),
            ("Paused (Alt+Shift+P): sites go back to their own look, and the toolbar icon shows a pause mark", PURPLE, strip("strip-paused", W)),
        ],
        "Pause all rules",
        "One switch turns every rule off. Tabs go back to the way the sites name them after a reload.",
        "11-pause-all-rules.png",
    )

copies = {
    "01-before-rules.png": "01-before-rules.png",
    "02-after-rules.png": "02-after-rules.png",
    "05-demo-before.png": "05-demo-before-one-busy-window.png",
    "06-demo-presenter-window.png": "06-demo-presenter-window.png",
    "07-demo-your-other-window.png": "07-demo-your-other-window.png",
    "08-demo-side-by-side.png": "08-demo-side-by-side.png",
    "09-own-window-side-by-side.png": "09-own-window-side-by-side.png",
    "10-session-restored.png": "10-session-restored.png",
    "12-spot-search.png": "12-spot-search.png",
}
for src, dst in copies.items():
    p = os.path.join(RAW, src)
    if os.path.exists(p):
        save(Image.open(p), dst)
    else:
        print("missing", src)

ui = {
    "store_1_rules.png": "13-screen-rules.png",
    "store_3_workspaces.png": "14-screen-workspaces.png",
    "store_4_sessions.png": "15-screen-sessions.png",
    "store_5_url_tester_and_pause.png": "16-screen-test-a-url.png",
    "store_6_own_window_rule.png": "17-screen-own-window-rule.png",
    "store_7_share_rules.png": "18-screen-share-rules.png",
}
for src, dst in ui.items():
    shutil.copyfile(os.path.join(STORE, src), os.path.join(OUT, dst))
    print(dst, "copied")
