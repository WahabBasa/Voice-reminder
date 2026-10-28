#!/usr/bin/env python3
"""Localized store screenshots by re-captioning existing renders (no image generation).

    python marketing/compose_locale_shots.py            # de-DE + ar-SA
    LOCALES=de-DE python marketing/compose_locale_shots.py

Source art: renders_v3/ (the English-UI GPT renders behind the PPO "pain-point" set).
Slot order follows the live en-US default set by theme:
    1 lockscreen alarm  -> 07-birthday   ("Call Mom" on the lock screen)
    2 voice recording   -> 02-voice
    3 "forget a lot"    -> 05-bill
    4 keeps ringing     -> 03-rings
    5 any schedule      -> 04-schedule
No medicine: the "Take Morning Pills" list rows in 02-voice and 04-schedule are removed by
shifting the rows below them up one slot; the pill emoji decorations sit in the headline
band, which is repainted. The phone UI and bubbles inside the art stay English.

Per render: repaint the headline band (row-median of the edge columns, smoothed), draw the
localized headline (Arabic shaped + bidi via arabic_reshaper/python-bidi, Dubai Bold),
export to 1290x2796 like export_ppo.py, and 1242x2688 by fill + centre crop.
Output: out/asc_<loc>/6.7/NN.png, out/asc_<loc>/6.5/NN.png, out/asc_<loc>/sheet.png
"""
import os
import unicodedata
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
SRC = HERE / "renders_v3"
FONTS = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"
NAVY, BLUE, SLATE = (14, 23, 48), (57, 112, 255), (78, 88, 110)
K = 1.28  # renders are 1440x2560; coordinates below were measured on a 1125-wide view

SLOTS = ["07-birthday", "02-voice", "05-bill", "03-rings", "04-schedule"]
# y (render px) down to which the old headline band is repainted
CLEAR = {"07-birthday": None, "02-voice": None, "05-bill": None, "03-rings": 570, "04-schedule": None}  # rings: stop above the Silent-mode chip and bus

COPY = {
    "de-DE": {
        "07-birthday": ("Nie wieder|Mamas Geburtstag|vergessen", "Mamas Geburtstag", None),
        "02-voice": ("Erinnerungen|per Stimme", "per Stimme", None),
        "05-bill": ("Nie wieder die|Wasserrechnung|vergessen", "Wasserrechnung", None),
        "03-rings": ("Klingelt immer.|Auch im Stummmodus.", "Auch im Stummmodus.", "Bis du es ausschaltest."),
        "04-schedule": ("Für jeden|Zeitplan", "jeden", None),
    },
    "ar-SA": {
        "07-birthday": ("لن تنسى بعد اليوم|عيد ميلاد أمك", "عيد ميلاد أمك", None),
        "02-voice": ("اضبط تذكيراتك|بصوتك", "بصوتك", None),
        "05-bill": ("لن تنسى بعد اليوم|فاتورة الماء", "فاتورة الماء", None),
        "03-rings": ("يرن دائما.|حتى في الوضع الصامت.", "حتى في الوضع الصامت.", "يستمر حتى توقفه."),
        "04-schedule": ("يناسب|أي جدول مواعيد", "أي", None),
    },
}


def shape(text, rtl):
    if not rtl:
        return text
    import arabic_reshaper
    from bidi.algorithm import get_display
    out = []
    for ch in arabic_reshaper.reshape(text):
        dec = unicodedata.decomposition(ch).split()  # isolated forms -> base letter (Dubai lacks U+FExx isolated)
        out.append(chr(int(dec[1], 16)) if len(dec) == 2 and dec[0] == "<isolated>" else ch)
    return get_display("".join(out))


def phone_top(img):
    """First row holding a long continuous dark run (the bezel's top edge); headline strokes are shorter."""
    a = np.asarray(img.convert("RGB")).astype(int)
    dark = a.max(axis=2) < 80
    for y in range(150, img.height):
        r = dark[y].astype(np.int8)
        if r.sum() < 300:
            continue
        edges = np.diff(np.concatenate([[0], r, [0]]))
        starts, ends = np.nonzero(edges == 1)[0], np.nonzero(edges == -1)[0]
        if (ends - starts).max() >= 300:
            return y
    raise SystemExit("phone not found")


def repaint(img, clear_to):
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    w = a.shape[1]
    edge = np.concatenate([a[:clear_to, 0:8], a[:clear_to, w - 8:w]], axis=1)
    row = np.median(edge, axis=1)
    k = 25
    pad = np.pad(row, ((k, k), (0, 0)), mode="edge")
    smooth = np.stack([np.convolve(pad[:, c], np.ones(2 * k + 1) / (2 * k + 1), mode="valid") for c in range(3)], axis=1)
    # horizontal shading: keep the original left-right brightness profile of the band (from the top rows)
    prof = a[:40].mean(axis=0) / np.maximum(a[:40].mean(axis=(0, 1)), 1)
    band = smooth[:, None, :] * prof[None, :, :]
    out = a.copy()
    out[:clear_to] = band
    rng = np.random.default_rng(1)
    out[:clear_to] += rng.normal(0, 0.6, out[:clear_to].shape)
    return Image.fromarray(out.clip(0, 255).astype(np.uint8))


def shift_rows(img, x0, x1, y0, y1, dy, fill_from=None, fill_color=None):
    """Move the block [x0:x1, y0:y1] up by dy, then fill the vacated bottom strip."""
    a = np.asarray(img).copy()
    a[y0 - dy:y1 - dy, x0:x1] = a[y0:y1, x0:x1]
    if fill_from is not None:
        a[y1 - dy:y1, x0:x1] = a[fill_from, x0:x1][None]
    else:
        a[y1 - dy:y1, x0:x1] = fill_color
    return Image.fromarray(a)


def remove_pills(slot, img):
    s = lambda v: round(v * K)
    if slot == "04-schedule":
        # cards: pills 825-990, water 1015-1183, kids 1208-1376, birthday 1402-1568 (view px); bg row at 1588
        return shift_rows(img, s(292), s(828), s(1004), s(1590), s(1004) - s(810), fill_from=s(1588))
    if slot == "02-voice":
        # cards: pills 705-828, dentist 847-970, kids 988-1111; the mic bubble starts at y 1103 on the left
        # Move dentist + kids cards up one slot. The mic bubble overlaps the kids card's bottom-left
        # corner (x < 434, y > 1103 view px), so that corner is rebuilt by mirroring the card's right
        # half, and the bubble's pixels are never moved. The vacated slot gets a smooth background.
        orig = np.asarray(img).astype(np.float32)
        a = orig.copy()
        x0, x1, xb, yb = s(306), s(816), s(434), s(1103)
        y0, y1, dy = s(838), s(1118), s(838) - s(697)
        a[y0 - dy:yb - dy, x0:x1] = orig[y0:yb, x0:x1]
        a[yb - dy:y1 - dy, xb:x1] = orig[yb:y1, xb:x1]
        cx2 = 2 * s(561)
        for x in range(x0, xb):
            a[yb - dy:y1 - dy, x] = a[yb - dy:y1 - dy, min(cx2 - x, x1 - 1)]
        bg = orig[s(1150) - 3:s(1150) + 4, xb:x1].mean(axis=0)
        k = 31
        bg = np.stack([np.convolve(np.pad(bg[:, c], k, mode="edge"), np.ones(2 * k + 1) / (2 * k + 1), mode="valid") for c in range(3)], axis=1)
        row = np.concatenate([np.repeat(bg[:1], xb - x0, axis=0), bg])
        a[y1 - dy:yb, x0:x1] = row[None]
        a[yb:y1, xb:x1] = row[None, xb - x0:]
        # left of xb: clear the old card's bottom sliver down to where the bubble's long white run starts
        white = orig.min(axis=2) > 245
        for x in range(x0, xb):
            for y in range(yb, s(1130)):
                if white[y:y + 30, x].all():
                    break
                a[y, x] = row[x - x0]
        # round the bubble's top-right corner again (the old card edge had squared it off)
        r, xr, yt = s(40), s(430), s(1103)
        for y in range(yt, yt + r):
            for x in range(xr - r, min(xr + 6, xb)):
                if (x - (xr - r)) ** 2 + (y - (yt + r)) ** 2 > r * r:
                    a[y, x] = row[x - x0]
        return Image.fromarray(a.clip(0, 255).astype(np.uint8))
    return img


def fit_lines(lines, rtl, font_path, max_w, max_h, max_size, lh_k):
    size = max_size
    while size > 30:
        f = ImageFont.truetype(font_path, size)
        lh = round(size * lh_k)
        if max(f.getlength(shape(l, rtl)) for l in lines) <= max_w and lh * len(lines) <= max_h:
            return f, lh
        size -= 2
    raise SystemExit("headline does not fit")


def runs_for(line, emph, rtl):
    """[(text, colour)] in visual left-to-right order."""
    if rtl:
        ew = set(emph.split())
        r = []
        for i, wd in enumerate(reversed(line.split())):
            if i:
                r.append((" ", NAVY))
            r.append((shape(wd, True), BLUE if wd in ew else NAVY))
        return r
    i = line.find(emph)
    if i < 0:
        return [(line, NAVY)]
    return [(t, c) for t, c in ((line[:i], NAVY), (emph, BLUE), (line[i + len(emph):], NAVY)) if t]


def draw_headline(img, text, emph, sub, rtl, band):
    d = ImageDraw.Draw(img)
    lines = text.split("|")
    heavy = str(FONTS / ("DUBAI-BOLD.TTF" if rtl else "Montserrat-ExtraBold.ttf"))
    med = str(FONTS / ("DUBAI-MEDIUM.TTF" if rtl else "Montserrat-SemiBold.ttf"))
    top, bottom = band
    sub_h = 0
    fs = None
    if sub:
        fs = ImageFont.truetype(med, 50 if rtl else 46)
        sub_h = round(fs.size * 1.9)
    f, lh = fit_lines(lines, rtl, heavy, img.width - 170, bottom - top - sub_h, 150, 1.32 if rtl else 1.10)
    total = lh * len(lines) + sub_h
    y = top + (bottom - top - total) // 2
    for ln in lines:
        rr = runs_for(ln, emph, rtl)
        w = sum(f.getlength(t) for t, _ in rr)
        x = (img.width - w) / 2
        for t, c in rr:
            d.text((x, y + lh / 2), t, font=f, fill=c, anchor="lm")
            x += f.getlength(t)
        y += lh
    if sub:
        d.text((img.width / 2, y + sub_h * 0.45), shape(sub, rtl), font=fs, fill=SLATE, anchor="mm")
    return f.size


def to_67(img):
    W, H, TOP = 1290, 2796, 201
    rng = np.random.default_rng(0)
    h = round(img.height * W / img.width)
    body = np.asarray(img.resize((W, h), Image.LANCZOS)).astype(np.float32)
    top_row, bot_row = body[:8].mean(axis=0), body[-8:].mean(axis=0)
    bottom = H - TOP - h
    pad_t = np.repeat(top_row[None], TOP, axis=0) + rng.normal(0, 0.6, (TOP, W, 3))
    pad_b = np.repeat(bot_row[None], bottom, axis=0) + rng.normal(0, 0.6, (bottom, W, 3))
    return Image.fromarray(np.concatenate([pad_t, body, pad_b]).clip(0, 255).astype(np.uint8), "RGB")


def to_65(img67):
    W, H = 1242, 2688
    k = max(W / img67.width, H / img67.height)
    r = img67.resize((round(img67.width * k), round(img67.height * k)), Image.LANCZOS)
    x, y = (r.width - W) // 2, (r.height - H) // 2
    return r.crop((x, y, x + W, y + H))


def main():
    locs = [l for l in os.environ.get("LOCALES", "de-DE,ar-SA").split(",") if l]
    for loc in locs:
        rtl = loc.startswith("ar")
        dst = HERE / "out" / f"asc_{loc}"
        (dst / "6.7").mkdir(parents=True, exist_ok=True)
        (dst / "6.5").mkdir(parents=True, exist_ok=True)
        outs = []
        for i, slot in enumerate(SLOTS, 1):
            img = Image.open(SRC / f"{slot}.png").convert("RGB")
            img = remove_pills(slot, img)
            pt = phone_top(img)
            clear_to = CLEAR[slot] or pt - 40
            img = repaint(img, clear_to)
            text, emph, sub = COPY[loc][slot]
            size = draw_headline(img, text, emph, sub, rtl, (90, clear_to - 30))
            a = to_67(img)
            b = to_65(a)
            a.save(dst / "6.7" / f"{i:02d}.png")
            b.save(dst / "6.5" / f"{i:02d}.png")
            outs.append(a)
            print(f"{loc} {i:02d} {slot}: phone top {pt}, band 90..{clear_to - 30}, headline {size}px; {a.size} {b.size}")
        thumbs = [o.resize((430, 932), Image.LANCZOS) for o in outs]
        sheet = Image.new("RGB", (len(thumbs) * 442 + 12, 956), (40, 40, 40))
        for j, t in enumerate(thumbs):
            sheet.paste(t, (12 + j * 442, 12))
        sheet.save(dst / "sheet.png")


if __name__ == "__main__":
    main()
