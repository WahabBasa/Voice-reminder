"""Compose the iOS 27 creative assets from the generated artwork.

    python marketing/compose_creative.py            # all concepts, en-US
    LOCALE=pt-BR python marketing/compose_creative.py concept-1   # (later) localized text

Input : marketing/out/creative/raw/<concept>.png   (16:9 art from gen_creative_art.py)
Output: marketing/out/creative/
    <concept>_search_3x2.png      3840x2560  dedicated Search Results asset
    <concept>_header_21x9.png     3840x1646  dedicated Product Page Header asset
    <concept>_universal_16x9.png  5244x2950  universal master (the one "Use header asset in search results" needs)
    <concept>_preview.png         master + both crops + all safe zones + on-device card size
    <concept>_card_343pt.png      search crop at real card size (343 pt @3x = 1029 px)
    contact_sheet.png

Safe areas come from Apple's own Photoshop templates (developer.apple.com/app-store/asset-best-practices):
    universal 5244x2950  "Art Safe Area" x1921-3323, y660-1622
    search    3840x2560  x836-3004, y765-1795
    header    3840x1646  x1097-2743, y493-1154
"""
import os, sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
RAW = HERE / "out" / "creative" / "raw"
OUT = HERE / "out" / "creative"
FONTS = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"
F_HEAVY = str(FONTS / "Montserrat-ExtraBold.ttf")
F_LABEL = str(FONTS / "Montserrat-Bold.ttf")

NAVY, BLUE, WHITE = (14, 23, 48), (57, 112, 255), (255, 255, 255)

# Master canvas = Apple universal 16:9.
MW, MH = 5244, 2950
UNI_SAFE = (1921, 660, 3323, 1622)

# Search crop: full height, centred 3:2 window, delivered at 3840x2560.
S_W = MH * 3 // 2                       # 4425
S_X = (MW - S_W) // 2                    # 409
S_K = S_W / 3840
S_SAFE_T = (836, 765, 3004, 1795)        # template coords
S_SAFE = tuple(round(v * S_K) + (S_X if i % 2 == 0 else 0) for i, v in enumerate(S_SAFE_T))

# Header crop: full width 21:9 band, delivered at 3840x1646. Vertical offset chosen so
# the header safe band starts at the same y as the search safe band.
H_H = round(MW * 1646 / 3840)            # 2248
H_K = MW / 3840
H_SAFE_T = (1097, 493, 2743, 1154)
H_Y = S_SAFE[1] - round(H_SAFE_T[1] * H_K)
H_SAFE = tuple(round(v * H_K) + (H_Y if i % 2 == 1 else 0) for i, v in enumerate(H_SAFE_T))

# Intersection = where the headline and focal point must live.
BOTH = (max(S_SAFE[0], H_SAFE[0]), max(S_SAFE[1], H_SAFE[1]), min(S_SAFE[2], H_SAFE[2]), min(S_SAFE[3], H_SAFE[3]))

# Headline per concept: list of lines, each a list of (text, colour) runs. Box = master coords.
L = BOTH
TEXT = {
    "en-US": {
        "concept-1": dict(lines=[[("A reminder", NAVY)], [("that ", NAVY), ("talks.", BLUE)]],
                          box=(L[0] + 20, L[1] + 40, 2900, L[3] - 40), max_size=330),
        "concept-2": dict(lines=[[("Say it. ", NAVY), ("It talks back.", BLUE)]],
                          box=(L[0] + 40, L[1] - 40, L[2] - 40, L[1] + 330), max_size=300, align="center"),
        "concept-3": dict(lines=[[("Reminders", WHITE)], [("you can't", WHITE)], [("ignore.", WHITE)]],
                          box=(L[0] + 20, L[1] + 10, 2950, 1540), max_size=360),
    },
}


def fit_font(lines, box, max_size, path=F_HEAVY):
    bw, bh = box[2] - box[0], box[3] - box[1]
    size = max_size
    while size > 40:
        f = ImageFont.truetype(path, size)
        lh = round(size * 1.08)
        widths = [sum(f.getlength(t) for t, _ in ln) for ln in lines]
        if max(widths) <= bw and lh * len(lines) <= bh:
            return f, lh, widths
        size -= 4
    raise SystemExit("headline does not fit")


def draw_headline(img, spec, icon_path=None):
    d = ImageDraw.Draw(img)
    box = spec["box"]
    lines = spec["lines"]
    extra = 0
    if spec.get("icon"):
        extra = 1  # reserve one line-height-ish block for the icon
    f, lh, widths = fit_font(lines + ([[("M", WHITE)]] if extra else []), box, spec["max_size"])
    total = lh * len(lines) + (round(lh * 1.05) if extra else 0)
    y = box[1] + (box[3] - box[1] - total) // 2
    if extra:
        ic = Image.open(icon_path).convert("RGB").resize((round(lh * 0.82),) * 2, Image.LANCZOS)
        m = Image.new("L", ic.size, 0)
        ImageDraw.Draw(m).rounded_rectangle((0, 0, ic.size[0] - 1, ic.size[1] - 1), radius=round(ic.size[0] * 0.225), fill=255)
        # white ring so the blue icon separates from a blue background
        ring = Image.new("RGB", (ic.size[0] + 24, ic.size[1] + 24), WHITE)
        rm = Image.new("L", ring.size, 0)
        ImageDraw.Draw(rm).rounded_rectangle((0, 0, ring.size[0] - 1, ring.size[1] - 1), radius=round(ring.size[0] * 0.225), fill=255)
        img.paste(ring, (box[0], y), rm)
        img.paste(ic, (box[0] + 12, y + 12), m)
        y += round(lh * 1.05)
    for ln, w in zip(lines, widths):
        x = box[0] if spec.get("align") != "center" else box[0] + (box[2] - box[0] - w) // 2
        for t, c in ln:
            d.text((x, y), t, font=f, fill=c)
            x += f.getlength(t)
        y += lh
    return f.size


# Per-concept horizontal shift of the artwork (fraction of width, negative = left) so the
# generated focal elements land inside the search crop; the gap is filled by stretching
# the plain background edge column.
ART_SHIFT = {"concept-2": -0.055}


def to_master(raw: Image.Image, shift: float = 0.0) -> Image.Image:
    raw = raw.convert("RGB")
    k = max(MW / raw.width, MH / raw.height)
    r = raw.resize((round(raw.width * k), round(raw.height * k)), Image.LANCZOS)
    x, y = (r.width - MW) // 2, (r.height - MH) // 2
    m = r.crop((x, y, x + MW, y + MH))
    dx = round(shift * MW)
    if dx < 0:
        out = Image.new("RGB", (MW, MH))
        out.paste(m.crop((-dx, 0, MW, MH)), (0, 0))
        out.paste(m.crop((MW - 1, 0, MW, MH)).resize((-dx, MH)), (MW + dx, 0))
        m = out
    return m


def rect(d, r, color, w=14, dash=False):
    if not dash:
        d.rectangle(r, outline=color, width=w)
        return
    x0, y0, x1, y1 = r
    step = 90
    for x in range(x0, x1, step * 2):
        d.line((x, y0, min(x + step, x1), y0), fill=color, width=w)
        d.line((x, y1, min(x + step, x1), y1), fill=color, width=w)
    for y in range(y0, y1, step * 2):
        d.line((x0, y, x0, min(y + step, y1)), fill=color, width=w)
        d.line((x1, y, x1, min(y + step, y1)), fill=color, width=w)


def label(d, xy, text, color, size=80):
    f = ImageFont.truetype(F_LABEL, size)
    tw = f.getlength(text)
    d.rectangle((xy[0], xy[1], xy[0] + tw + 40, xy[1] + size + 30), fill=color)
    d.text((xy[0] + 20, xy[1] + 10), text, font=f, fill=WHITE)


def preview(name, master, search, header, card):
    W = 3000
    k = W / MW
    m = master.copy()
    d = ImageDraw.Draw(m)
    ORANGE, CYAN, GREEN, PINK = (255, 140, 0), (0, 190, 255), (40, 200, 60), (255, 0, 140)
    rect(d, (S_X, 0, S_X + S_W - 1, MH - 1), CYAN, 22)
    rect(d, (0, H_Y, MW - 1, H_Y + H_H - 1), ORANGE, 22)
    rect(d, S_SAFE, CYAN, 16, dash=True)
    rect(d, H_SAFE, ORANGE, 16, dash=True)
    rect(d, UNI_SAFE, GREEN, 12, dash=True)
    rect(d, BOTH, PINK, 10)
    label(d, (S_X + 30, 30), "SEARCH 3:2 crop", CYAN)
    label(d, (30, H_Y + 30), "HEADER 21:9 crop", ORANGE)
    label(d, (S_SAFE[0] + 20, S_SAFE[3] - 140), "search safe", CYAN, 64)
    label(d, (H_SAFE[2] - 520, H_SAFE[1] + 20), "header safe", ORANGE, 64)
    label(d, (UNI_SAFE[0] + 20, UNI_SAFE[1] - 130), "universal 16:9 safe (Apple)", GREEN, 64)
    top = m.resize((W, round(MH * k)), Image.LANCZOS)

    gap = 40
    sw = (W - gap) * 3 // 7
    s_small = search.resize((sw, round(sw * 2 / 3)), Image.LANCZOS)
    hw = W - gap - sw
    h_small = header.resize((hw, round(hw * 1646 / 3840)), Image.LANCZOS)
    rowh = max(s_small.height, h_small.height)
    title_f = ImageFont.truetype(F_LABEL, 46)
    H = 90 + top.height + 80 + rowh + 80 + card.height + 60
    sheet = Image.new("RGB", (W + 120, H), (32, 33, 36))
    sd = ImageDraw.Draw(sheet)
    sd.text((60, 25), f"{name}  -  universal 16:9 master with crops and safe zones (pink = where text/focal must sit for both)", font=title_f, fill=WHITE)
    sheet.paste(top, (60, 90))
    y = 90 + top.height + 80
    sd.text((60, y - 60), "Search Results 3:2 (3840x2560)", font=title_f, fill=WHITE)
    sd.text((60 + sw + gap, y - 60), "Product Page Header 21:9 (3840x1646)", font=title_f, fill=WHITE)
    sheet.paste(s_small, (60, y))
    sheet.paste(h_small, (60 + sw + gap, y))
    y += rowh + 80
    sd.text((60, y - 60), "Search card at real iPhone size: 343 pt wide (@3x = 1029 px, shown 1:1)", font=title_f, fill=WHITE)
    sheet.paste(card, (60, y))
    return sheet


def main():
    loc = os.environ.get("LOCALE", "en-US")
    names = sys.argv[1:] or sorted(p.stem for p in RAW.glob("concept-?.png"))
    icon = HERE.parent / "assets" / "icon.png"
    sfx = "" if loc == "en-US" else f"_{loc}"
    print("search safe", S_SAFE, "header crop y", H_Y, "header safe", H_SAFE, "both", BOTH)
    rows = []
    for n in names:
        master = to_master(Image.open(RAW / f"{n}.png"), ART_SHIFT.get(n, 0.0))
        size = draw_headline(master, TEXT[loc][n], icon)
        search = master.crop((S_X, 0, S_X + S_W, MH)).resize((3840, 2560), Image.LANCZOS)
        header = master.crop((0, H_Y, MW, H_Y + H_H)).resize((3840, 1646), Image.LANCZOS)
        card = search.resize((1029, 686), Image.LANCZOS)
        master.save(OUT / f"{n}_universal_16x9{sfx}.png")
        search.save(OUT / f"{n}_search_3x2{sfx}.png")
        header.save(OUT / f"{n}_header_21x9{sfx}.png")
        card.save(OUT / f"{n}_card_343pt{sfx}.png")
        preview(n, master, search, header, card).save(OUT / f"{n}_preview{sfx}.png")
        pt = size / S_K / 3  # font px in 3840 search asset -> pt on a 343pt card
        print(n, "headline font", size, "px master =", round(size / S_K * 343 / 3840, 1), "pt on the 343 pt card")
        rows.append((n, search, header))

    # contact sheet: one row per concept, search | header | card @1x
    W = 3200
    f = ImageFont.truetype(F_LABEL, 48)
    tiles = []
    for n, s, h in rows:
        sw = 1200
        s_ = s.resize((sw, 800), Image.LANCZOS)
        hw = W - sw - 40 - 343 - 40
        h_ = h.resize((hw, round(hw * 1646 / 3840)), Image.LANCZOS)
        c_ = s.resize((343, 229), Image.LANCZOS)
        tiles.append((n, s_, h_, c_))
    H = sum(90 + 800 + 40 for _ in tiles) + 40
    sheet = Image.new("RGB", (W + 80, H), (245, 246, 248))
    d = ImageDraw.Draw(sheet)
    y = 40
    for n, s_, h_, c_ in tiles:
        d.text((40, y), f"{n}:  search 3:2   |   header 21:9   |   card at 343 pt (1x)", font=f, fill=NAVY)
        y += 70
        sheet.paste(s_, (40, y))
        sheet.paste(h_, (40 + 1200 + 40, y))
        sheet.paste(c_, (40 + 1200 + 40 + h_.width + 40, y))
        y += 800 + 60
    sheet.save(OUT / f"contact_sheet{sfx}.png")


# ---------------------------------------------------------------------------
# concept-1b: the founder's pick, v2. Everything with words is drawn here (headline, speech
# bubble, alarm label, button text) so it sits inside the safe areas and can be localized
# without re-rendering the art.
#
#   HEADLINE="Your phone|says it|out loud." EMPH="out loud."   ("|" = line break; omit for auto balanced wrap) python marketing/compose_creative.py concept-1b
#   LOCALE=pt-BR ...   -> uses COPY_1B["pt-BR"] for the bubble and screen strings
# Outputs: concept-1b_{search_3x2,header_21x9,universal_16x9,preview,card_white}[_LOCALE].png
# ---------------------------------------------------------------------------
F_SEMI = str(FONTS / "Montserrat-SemiBold.ttf")
F_EMOJI = str(FONTS / "seguiemj.ttf")
ZOOM_1B = 1.045           # zoom anchored on the right edge: moves the phone left into the header safe area
H_Y_1B = 230              # header crop offset for concept-1b (header safe band = y 903..1806 in master)
VIGNETTE = 0.20           # edge darkening of each delivered crop (warm), so the card holds its edge on a white page

COPY_1B = {
    # bubble = what Remi says out loud; title = the alarm label (reminder title);
    # later = app string alarm.button.later (locales/*.json); slide = iOS slider text.
    "en-US": dict(bubble="Take your medicine.", title="Take Your Medicine", later="Later", slide="slide to stop"),
    # pt-BR / es-MX filled in once the English headline is final.
}


def _zoom_right(m: Image.Image, s: float) -> Image.Image:
    w, h = m.width / s, m.height / s
    x0, y0 = m.width - w, (m.height - h) / 2
    return m.crop((round(x0), round(y0), m.width, round(y0 + h))).resize((MW, MH), Image.LANCZOS)


def _find_screen(m: Image.Image):
    import numpy as np
    a = np.asarray(m).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    blue = (b > 200) & (r < 120) & (g > 80) & (g < 170)
    ys, xs = np.nonzero(blue)
    btn = (xs.min(), ys.min(), xs.max(), ys.max())
    wh = a.min(axis=2) > 200
    wh[:, : btn[0]] = False
    wh[:, btn[2]:] = False
    wh[btn[1]:] = False
    yy, xx = np.nonzero(wh)
    digits = (xx.min(), yy.min(), xx.max(), yy.max())
    return btn, digits


def _vignette(img: Image.Image, strength=VIGNETTE) -> Image.Image:
    import numpy as np
    w, h = img.size
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dx = (xx - w / 2) / (w / 2)
    dy = (yy - h / 2) / (h / 2)
    d = np.clip(np.sqrt(dx ** 2 * 0.8 + dy ** 2 * 0.9) - 0.35, 0, None) / 0.95
    f = 1 - strength * np.clip(d, 0, 1) ** 1.6
    a = np.asarray(img).astype(np.float32)
    # warm darkening: blue drops a little more than red
    a[..., 0] *= f
    a[..., 1] *= f ** 1.08
    a[..., 2] *= f ** 1.25
    return Image.fromarray(np.clip(a, 0, 255).astype("uint8"))


def _sound_icon(d, x, y, h, color=BLUE):
    bars = [0.35, 0.7, 1.0, 0.7, 0.35]
    bw = max(4, round(h * 0.11))
    gap = round(h * 0.11)
    for i, k in enumerate(bars):
        bh = h * k
        cx = x + i * (bw + gap)
        d.rounded_rectangle((cx, y + (h - bh) / 2, cx + bw, y + (h + bh) / 2), radius=bw / 2, fill=color)
    return len(bars) * (bw + gap) - gap


def _bubble(img: Image.Image, text: str, right: int, top: int, size: int, max_w: int):
    """White speech bubble whose right edge sits at `right`, tail pointing right (to the phone)."""
    from PIL import ImageFilter
    def width(sz):
        ff = ImageFont.truetype(F_HEAVY, sz)
        ih = round(sz * 0.95)
        return ff, round(2 * round(sz * 0.6) + round(ih * 0.98) + sz * 0.45 + ff.getlength(text))
    f, w = width(size)
    while w > max_w and size > 40:
        size -= 2
        f, w = width(size)
    pad_x, pad_y = round(size * 0.6), round(size * 0.48)
    icon_h = round(size * 0.95)
    icon_w = round(icon_h * 0.98)
    tw = f.getlength(text)
    asc, desc = f.getmetrics()
    w = round(pad_x + icon_w + size * 0.45 + tw + pad_x)
    h = round(pad_y * 2 + asc * 0.95)
    x0, y0 = right - w, top
    rad = round(h * 0.42)
    # soft shadow
    sh = Image.new("L", img.size, 0)
    ImageDraw.Draw(sh).rounded_rectangle((x0, y0 + 18, x0 + w, y0 + h + 18), radius=rad, fill=110)
    sh = sh.filter(ImageFilter.GaussianBlur(34))
    img.paste(Image.new("RGB", img.size, (60, 40, 20)), (0, 0), sh)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((x0, y0, x0 + w, y0 + h), radius=rad, fill=WHITE)
    # tail at the lower right, pointing right/down toward the phone
    tx = x0 + w - rad * 0.9
    d.polygon([(tx - h * 0.28, y0 + h - 2), (tx + h * 0.30, y0 + h - 2), (x0 + w + h * 0.22, y0 + h + h * 0.30)], fill=WHITE)
    _sound_icon(d, x0 + pad_x, y0 + (h - icon_h) / 2, icon_h)
    d.text((x0 + pad_x + icon_w + size * 0.45, y0 + h / 2), text, font=f, fill=NAVY, anchor="lm")
    return (x0, y0, x0 + w, y0 + h)  # body box; the tail hangs ~0.3h lower on the right


def _screen_text(img: Image.Image, btn, digits, copy):
    d = ImageDraw.Draw(img)
    dh = digits[3] - digits[1]
    cx = (btn[0] + btn[2]) / 2
    # alarm label above the time: emoji clock + title, white, like the real lock screen
    ls = round(dh * 0.24)
    f = ImageFont.truetype(F_SEMI, ls)
    title = copy["title"]
    try:
        fe = ImageFont.truetype(F_EMOJI, ls)
        ew = fe.getlength("⏰") + ls * 0.35
    except OSError:
        fe, ew = None, 0
    tw = f.getlength(title) + ew
    x = cx - tw / 2
    y = digits[1] - dh * 0.55
    if fe:
        d.text((x, y), "⏰", font=fe, embedded_color=True, anchor="lm")
    d.text((x + ew, y), title, font=f, fill=(235, 235, 240), anchor="lm")
    # button + slider text
    bh = btn[3] - btn[1]
    fb = ImageFont.truetype(F_SEMI, round(bh * 0.40))
    d.text((cx, (btn[1] + btn[3]) / 2), copy["later"], font=fb, fill=WHITE, anchor="mm")
    sz = round(bh * 0.28)
    avail = (btn[2] - btn[0]) * (1 - 0.27 - 0.07)
    fs = ImageFont.truetype(F_SEMI, sz)
    while fs.getlength(copy["slide"]) > avail and sz > 10:
        sz -= 1
        fs = ImageFont.truetype(F_SEMI, sz)
    d.text((btn[0] + (btn[2] - btn[0]) * 0.27, btn[3] + bh * 0.78), copy["slide"], font=fs, fill=(120, 120, 128), anchor="lm")
    return (x, y - ls / 2, x + tw, y + ls / 2)


def _wrap_fit(text, emph, box, max_size, min_lines=1):
    """Largest font + greedy wrap so `text` fits `box`. Returns (font, line height, [[(t, colour)]])."""
    fixed = [l.strip() for l in text.split("|")] if "|" in text else None  # "|" = manual line breaks
    text = text.replace("|", " ")
    words = text.split()
    bw, bh = box[2] - box[0], box[3] - box[1]
    size = max_size
    from itertools import combinations

    def best_split(f, k):
        # split the words into k lines minimising the widest line (balanced wrap)
        best = None
        for cuts in combinations(range(1, len(words)), k - 1):
            idx = (0,) + cuts + (len(words),)
            ls = [" ".join(words[idx[i]:idx[i + 1]]) for i in range(k)]
            wmax = max(f.getbbox(_v(l))[2] for l in ls)  # ink extent, not advance
            if best is None or wmax < best[0]:
                best = (wmax, ls)
        return best

    while size > 60:
        f = ImageFont.truetype(F_HEAVY, size)
        lh = round(size * (1.30 if RTL else 1.04))
        found = None
        for k in ([len(fixed)] if fixed else range(max(1, min_lines), min(4, len(words)) + 1)):
            wmax, ls = (max(f.getbbox(_v(l))[2] for l in fixed), fixed) if fixed else best_split(f, k)
            if wmax <= bw and lh * k <= bh:
                found = ls
                break
        if found:
            lines = found
            break
        size -= 2
    if RTL:
        # Arabic: one run per word (no joining across spaces), words in visual (right-to-left) order
        ew = set(emph.split())
        runs = []
        for ln in lines:
            r = []
            for i, wd in enumerate(reversed(ln.split())):
                if i:
                    r.append((" ", NAVY))
                r.append((_v(wd), BLUE if wd in ew else NAVY))
            runs.append(r)
        return f, lh, runs
    # colour runs: the emphasised phrase in blue
    runs = []
    e = emph.strip()
    full = " ".join(lines)
    start = full.find(e) if e else -1
    pos = 0
    for ln in lines:
        r = []
        for i, ch in enumerate(ln):
            gi = pos + i
            col = BLUE if start >= 0 and start <= gi < start + len(e) else NAVY
            if r and r[-1][1] == col:
                r[-1] = (r[-1][0] + ch, col)
            else:
                r.append((ch, col))
        runs.append(r)
        pos += len(ln) + 1
    return f, lh, runs


def _draw_runs(img, f, lh, runs, x, y_top, right=None):
    """right: if given, each line is right-aligned to this x (RTL) instead of starting at x."""
    d = ImageDraw.Draw(img)
    y = y_top
    for r in runs:
        xx = x if right is None else right - sum(f.getlength(t) for t, _ in r)
        for t, c in r:
            d.text((xx, y), t, font=f, fill=c)
            xx += f.getlength(t)
        y += lh
    return y


def _app_store_card(search: Image.Image, name="Remi", sub="Voice reminders", get="Get") -> Image.Image:
    """Search card at 343 pt (@3x = 1029 px) on a white App Store-like page (mock, for legibility checks)."""
    S = 3
    W = 393 * S
    card_w = 343 * S
    card_h = round(card_w * 2 / 3)
    page = Image.new("RGB", (W, 120 * S + card_h + 110 * S), WHITE)
    d = ImageDraw.Draw(page)
    fsb = ImageFont.truetype(F_HEAVY if RTL else str(FONTS / "Montserrat-Bold.ttf"), 17 * S)
    fs = ImageFont.truetype(F_SEMI, 13 * S)
    d.rounded_rectangle((25 * S, 18 * S, W - 25 * S, 54 * S), radius=10 * S, fill=(238, 238, 240))
    d.text((40 * S, 36 * S), "Search: reminder alarm", font=fs, fill=(140, 140, 146), anchor="lm")
    x0, y0 = 25 * S, 70 * S
    # app row
    ic = Image.open(HERE.parent / "assets" / "icon.png").convert("RGB").resize((60 * S, 60 * S), Image.LANCZOS)
    m = Image.new("L", ic.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, ic.width - 1, ic.height - 1), radius=14 * S, fill=255)
    page.paste(ic, (x0, y0), m)
    d.text((x0 + 72 * S, y0 + 20 * S), name, font=fsb, fill=(0, 0, 0), anchor="lm")
    d.text((x0 + 72 * S, y0 + 42 * S), _v(sub), font=fs, fill=(140, 140, 146), anchor="lm")
    get = _v(get)
    gw = max(74 * S, round(fsb.getlength(get)) + 28 * S)
    d.rounded_rectangle((W - 25 * S - gw, y0 + 16 * S, W - 25 * S, y0 + 44 * S), radius=14 * S, fill=(235, 238, 245))
    d.text((W - 25 * S - gw / 2, y0 + 30 * S), get, font=fsb, fill=(0, 122, 255), anchor="mm")
    cy = y0 + 72 * S
    c = search.resize((card_w, card_h), Image.LANCZOS)
    m = Image.new("L", c.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, card_w - 1, card_h - 1), radius=12 * S, fill=255)
    page.paste(c, (x0, cy), m)
    return page.crop((0, 0, W, cy + card_h + 24 * S))


def compose_1b():
    loc = os.environ.get("LOCALE", "en-US")
    headline = os.environ.get("HEADLINE", "Your phone|says it|out loud.")  # "|" forces line breaks
    emph = os.environ.get("EMPH", "out loud.")
    copy = COPY_1B[loc]
    sfx = "" if loc == "en-US" else f"_{loc}"
    n = "concept-1b"

    master = _zoom_right(to_master(Image.open(RAW / f"{n}.png")), ZOOM_1B)
    btn, digits = _find_screen(master)
    label_box = _screen_text(master, btn, digits, copy)
    phone_left = btn[0] - round((btn[2] - btn[0]) * 0.16)  # outer edge of the bezel

    h_safe = (round(1097 * H_K), H_Y_1B + round(493 * H_K), round(2743 * H_K), H_Y_1B + round(1154 * H_K))
    both = (max(S_SAFE[0], h_safe[0]), max(S_SAFE[1], h_safe[1]), min(S_SAFE[2], h_safe[2]), min(S_SAFE[3], h_safe[3]))
    # bubble: top of the shared safe band, right edge just short of the phone, tail toward it
    bub = _bubble(master, copy["bubble"], right=phone_left - 40, top=both[1] + 10, size=124,
                  max_w=phone_left - 40 - both[0])

    uni = master.copy()
    # headline per crop, in that crop's own safe column below the bubble
    col_right = phone_left - 30
    s_box = (S_SAFE[0], bub[3] + 45, col_right, S_SAFE[3])
    h_box = (h_safe[0], bub[3] + 45, col_right, h_safe[3])

    sm = master.copy()
    fs_, lhs, runs_s = _wrap_fit(headline, emph, s_box, 330)
    used = lhs * len(runs_s)
    _draw_runs(sm, fs_, lhs, runs_s, s_box[0], s_box[1] + (s_box[3] - s_box[1] - used) // 2)
    search = sm.crop((S_X, 0, S_X + S_W, MH)).resize((3840, 2560), Image.LANCZOS)

    hm = master.copy()
    fh_, lhh, runs_h = _wrap_fit(headline, emph, h_box, 330)
    used = lhh * len(runs_h)
    _draw_runs(hm, fh_, lhh, runs_h, h_box[0], h_box[1] + (h_box[3] - h_box[1] - used) // 2)
    header = hm.crop((0, H_Y_1B, MW, H_Y_1B + H_H)).resize((3840, 1646), Image.LANCZOS)

    search_v = _vignette(search)
    header_v = _vignette(header)
    # universal master (for reference only: its Apple safe area is too small for this text)
    _draw_runs(uni, fs_, lhs, runs_s, s_box[0], s_box[1] + (s_box[3] - s_box[1] - lhs * len(runs_s)) // 2)
    uni = _vignette(uni)

    search_v.save(OUT / f"{n}_search_3x2{sfx}.png")
    header_v.save(OUT / f"{n}_header_21x9{sfx}.png")
    uni.save(OUT / f"{n}_universal_16x9{sfx}.png")
    card_after = _app_store_card(search_v)
    card_after.save(OUT / f"{n}_card_white{sfx}.png")

    pt = lambda px: round(px / S_K * 343 / 3840, 1)
    print("screen: button", btn, "digits", digits, "label", tuple(round(v) for v in label_box))
    print("bubble", bub, "header safe", h_safe, "search safe", S_SAFE)
    print("search headline", fs_.size, "px =", pt(fs_.size), "pt on the 343 pt card;", len(runs_s), "lines")
    print("header headline", fh_.size, "px; on a 393 pt-wide product page =", round(fh_.size / MW * 393, 1), "pt")
    print("bubble text on card ~", pt(118), "pt (before any shrink-to-fit)")

    # safe-area checks (master coords)
    def inside(b, s):
        return b[0] >= s[0] and b[1] >= s[1] and b[2] <= s[2] and b[3] <= s[3]
    for nm, b in (("bubble", bub), ("8:00 digits", digits), ("alarm label", label_box)):
        print(f"  {nm:12s} in header safe: {inside(b, h_safe)}  in search safe: {inside(b, S_SAFE)}")

    # preview with safe zones
    pv = master.copy()
    _draw_runs(pv, fs_, lhs, runs_s, s_box[0], s_box[1] + (s_box[3] - s_box[1] - lhs * len(runs_s)) // 2)
    d = ImageDraw.Draw(pv)
    ORANGE, CYAN, GREEN = (255, 140, 0), (0, 190, 255), (40, 200, 60)
    rect(d, (S_X, 0, S_X + S_W - 1, MH - 1), CYAN, 22)
    rect(d, (0, H_Y_1B, MW - 1, H_Y_1B + H_H - 1), ORANGE, 22)
    rect(d, S_SAFE, CYAN, 16, dash=True)
    rect(d, h_safe, ORANGE, 16, dash=True)
    rect(d, UNI_SAFE, GREEN, 12, dash=True)
    label(d, (S_X + 30, 30), "SEARCH 3:2 crop", CYAN)
    label(d, (30, H_Y_1B + 30), "HEADER 21:9 crop", ORANGE)
    label(d, (S_SAFE[0] + 20, S_SAFE[3] - 140), "search safe", CYAN, 64)
    label(d, (h_safe[2] - 520, h_safe[3] - 120), "header safe", ORANGE, 64)
    label(d, (UNI_SAFE[0] + 20, UNI_SAFE[1] - 130), "universal 16:9 safe (Apple)", GREEN, 64)
    W = 3000
    top = pv.resize((W, round(MH * W / MW)), Image.LANCZOS)
    sw = 1290
    s_small = search_v.resize((sw, 860), Image.LANCZOS)
    hw = W - sw - 40
    h_small = header_v.resize((hw, round(hw * 1646 / 3840)), Image.LANCZOS)
    tf = ImageFont.truetype(F_LABEL, 46)
    H = 90 + top.height + 80 + 860 + 80 + card_after.height + 60
    sheet = Image.new("RGB", (W + 120, H), (32, 33, 36))
    sd = ImageDraw.Draw(sheet)
    sd.text((60, 25), f"{n} {loc}: master, crops and safe zones (headline drawn per crop; search version shown)", font=tf, fill=WHITE)
    sheet.paste(top, (60, 90))
    y = 90 + top.height + 80
    sd.text((60, y - 60), "Search Results 3:2 (3840x2560)", font=tf, fill=WHITE)
    sd.text((60 + sw + 40, y - 60), "Product Page Header 21:9 (3840x1646)", font=tf, fill=WHITE)
    sheet.paste(s_small, (60, y))
    sheet.paste(h_small, (60 + sw + 40, y))
    y += 860 + 80
    sd.text((60, y - 60), "Search card at 343 pt on a white page (@3x, 1:1)", font=tf, fill=WHITE)
    sheet.paste(card_after, (60, y))
    sheet.save(OUT / f"{n}_preview{sfx}.png")

    # before / after at 343 pt on white
    before_src = OUT / "concept-1_search_3x2.png"
    if before_src.exists() and loc == "en-US":
        before = _app_store_card(Image.open(before_src).convert("RGB"))
        ba = Image.new("RGB", (before.width * 2 + 60, before.height + 110), (225, 226, 230))
        bd = ImageDraw.Draw(ba)
        bd.text((20, 30), "BEFORE (concept-1 v1)", font=tf, fill=NAVY)
        bd.text((before.width + 60, 30), "AFTER (concept-1b, placeholder headline)", font=tf, fill=NAVY)
        ba.paste(before, (20, 100))
        ba.paste(card_after, (before.width + 40, 100))
        ba.save(OUT / "concept-1b_before_after_343pt.png")


# ---------------------------------------------------------------------------
# FINAL delivery (founder's copy, 2026-10-27): concept-1b art, two pages x three locales.
#   python marketing/compose_creative.py final
# -> out/creative/final_<page>_<locale>_{search_3x2,header_21x9,card_343pt_white}.png + final_cards_contact_sheet.png
# ---------------------------------------------------------------------------
FINAL_COPY = {
    # headline: "|" = line break; emph = the "talking" word (or its equivalent) in blue.
    # title = alarm label on the lock screen (= the reminder's title, as Remi would save it);
    # later = locales/<loc>.json alarm.button.later; slide = iOS slider text (system string).
    "en-US": dict(alarm=("A talking|alarm.", "talking"), clock=("A talking|clock.", "talking"),
                  bubble="Take your medicine.", title="Take Your Medicine", later="Later", slide="slide to stop",
                  mock=dict(alarm="talking alarm", clock="talking clock", sub="Voice reminders", get="Get")),
    "pt-BR": dict(alarm=("Um alarme|que fala.", "que fala."), clock=("Um relógio|que fala.", "que fala."),
                  bubble="Tome seu remédio.", title="Tomar remédio", later="Adiar", slide="deslize para parar",
                  mock=dict(alarm="despertador falante", clock="relógio falante", sub="Lembretes de voz", get="Obter")),
    "es-MX": dict(alarm=("Una alarma|que habla.", "que habla."), clock=("Un reloj|que habla.", "que habla."),
                  bubble="Tómate tu medicina.", title="Tomar la medicina", later="Posponer", slide="desliza para detener",
                  mock=dict(alarm="alarma que habla", clock="reloj que habla", sub="Recordatorios de voz", get="Obtener")),
}
CLEAR_PX = 40  # required clearance between headline ink and the phone bezel, in delivered (3840-wide) pixels


def _bezel_left(m: Image.Image, btn, y0, y1):
    """Leftmost x of the phone body between rows y0..y1: scan left from the screen until warm background."""
    import numpy as np
    a = np.asarray(m).astype(int)
    xs = []
    for y in range(int(y0), int(y1), 6):
        x = int(btn[0]) + 10
        run = 0
        while x > 0:
            r, g, b = a[y, x]
            bg = r > 110 and r - b > 30
            run = run + 1 if bg else 0
            if run >= 6:
                xs.append(x + 6)
                break
            x -= 1
    return min(xs)


def _ink_right(f, lh, runs, x, y_top):
    d = ImageDraw.Draw(Image.new("L", (1, 1)))
    right = 0
    y = y_top
    for r in runs:
        line = "".join(t for t, _ in r)
        right = max(right, x + d.textbbox((0, 0), line, font=f)[2])
        y += lh
    return right


def final():
    from PIL import ImageFilter  # noqa: F401
    n = "concept-1b"
    base = _zoom_right(to_master(Image.open(RAW / f"{n}.png")), ZOOM_1B)
    btn, digits = _find_screen(base)
    h_safe = (round(1097 * H_K), H_Y_1B + round(493 * H_K), round(2743 * H_K), H_Y_1B + round(1154 * H_K))
    top_band = max(S_SAFE[1], h_safe[1])
    cards = []
    for loc, c in FINAL_COPY.items():
        m0 = base.copy()
        label_box = _screen_text(m0, btn, digits, c)
        bezel = _bezel_left(m0, btn, top_band, S_SAFE[3])
        bub = _bubble(m0, c["bubble"], right=bezel - 40, top=top_band + 10, size=124, max_w=bezel - 40 - h_safe[0])
        for page in ("alarm", "clock"):
            headline, emph = c[page]
            out = {}
            for crop, safe, k, mx in (("search", S_SAFE, S_K, 330), ("header", h_safe, H_K, 330)):
                margin = round(CLEAR_PX * k) + 4
                box = (safe[0], bub[3] + 45, bezel - margin, safe[3])
                f, lh, runs = _wrap_fit(headline, emph, box, mx)
                y_top = box[1] + (box[3] - box[1] - lh * len(runs)) // 2
                m = m0.copy()
                _draw_runs(m, f, lh, runs, box[0], y_top)
                ink = _ink_right(f, lh, runs, box[0], y_top)
                clear = (bezel - ink) / k
                if crop == "search":
                    img = m.crop((S_X, 0, S_X + S_W, MH)).resize((3840, 2560), Image.LANCZOS)
                    pt = round(f.size / S_K * 343 / 3840, 1)
                    size_note = f"{pt} pt on the 343 pt card"
                else:
                    img = m.crop((0, H_Y_1B, MW, H_Y_1B + H_H)).resize((3840, 1646), Image.LANCZOS)
                    size_note = f"{round(f.size / MW * 393, 1)} pt on a 393 pt-wide page"
                img = _vignette(img)
                img.save(OUT / f"final_{page}_{loc}_{crop}_{'3x2' if crop == 'search' else '21x9'}.png")
                out[crop] = img
                ok = "OK" if clear >= CLEAR_PX else "TOO CLOSE"
                print(f"{page:5s} {loc} {crop:6s} font {f.size}px = {size_note}; headline-to-bezel clearance {clear:.0f} px delivered ({ok})")
            card = _app_store_card(out["search"], sub=c["mock"]["sub"], get=c["mock"]["get"])
            # put the locale's search query in the mock search field
            dd = ImageDraw.Draw(card)
            dd.rounded_rectangle((75, 54, card.width - 75, 162), radius=30, fill=(238, 238, 240))
            dd.text((120, 108), c["mock"][page], font=ImageFont.truetype(F_SEMI, 39), fill=(140, 140, 146), anchor="lm")
            card.save(OUT / f"final_{page}_{loc}_card_343pt_white.png")
            cards.append((f"{page} / {loc}", card))
        inside = lambda b, s: b[0] >= s[0] and b[1] >= s[1] and b[2] <= s[2] and b[3] <= s[3]
        print(f"  {loc}: bubble {tuple(int(v) for v in bub)} in header safe {inside(bub, h_safe)} / search safe {inside(bub, S_SAFE)};"
              f" 8:00 in header safe {inside(digits, h_safe)}; label in header safe {inside(label_box, h_safe)}; bezel x {bezel}")

    # contact sheet: rows = page, columns = locale
    cw, ch = cards[0][1].size
    tf = ImageFont.truetype(F_LABEL, 44)
    sheet = Image.new("RGB", (3 * cw + 4 * 40, 2 * (ch + 90) + 40), (225, 226, 230))
    sd = ImageDraw.Draw(sheet)
    order = [(p, l) for p in ("alarm", "clock") for l in FINAL_COPY]
    lookup = dict(cards)
    for i, (p, l) in enumerate(order):
        col, row = i % 3, i // 3
        x, y = 40 + col * (cw + 40), 40 + row * (ch + 90)
        sd.text((x, y), f"{'Main page' if p == 'alarm' else 'Clock CPP'}  -  {l}", font=tf, fill=NAVY)
        sheet.paste(lookup[f"{p} / {l}"], (x, y + 60))
    sheet.save(OUT / "final_cards_contact_sheet.png")


# ---------------------------------------------------------------------------
# ROUND 3 (2026-10-27): nothing medical; two concepts, both fully text-free art.
#   python marketing/compose_creative.py round3
# woman_*  = PRIMARY: woman speaks a reminder -> later the counter phone rings and says it (raw/woman-2.png)
# phone_*  = SECONDARY / A-B: phone-only kitchen (raw/phone-1c.png)
# Every word, the time on the phone screen, and the button texts are drawn here.
# ---------------------------------------------------------------------------
F_REG = str(FONTS / "Montserrat-Regular.ttf")
F_MED = str(FONTS / "Montserrat-Medium.ttf")

COPY3 = {
    "en-US": dict(alarm=("A talking|alarm.", "talking"), clock=("A talking|clock.", "talking"),
                  said="Remind me at 5|to call Mom", spoken="Call Mom.", title="Call Mom", time="5:00",
                  later="Later", slide="slide to stop",
                  mock=dict(alarm="talking alarm", clock="talking clock", sub="Voice reminders", get="Get")),
    "pt-BR": dict(alarm=("Um alarme|que fala.", "que fala."), clock=("Um relógio|que fala.", "que fala."),
                  said="Me lembra às 5 de|ligar pra minha mãe", spoken="Ligue pra sua mãe.", title="Ligar pra mãe",
                  time="17:00", later="Adiar", slide="deslize para parar",
                  mock=dict(alarm="despertador falante", clock="relógio falante", sub="Lembretes de voz", get="Obter")),
    "es-MX": dict(alarm=("Una alarma|que habla.", "que habla."), clock=("Un reloj|que habla.", "que habla."),
                  said="Recuérdame a las 5|llamarle a mi mamá", spoken="Llámale a tu mamá.", title="Llamarle a mamá",
                  time="5:00", later="Posponer", slide="desliza para detener",
                  mock=dict(alarm="alarma que habla", clock="reloj que habla", sub="Recordatorios de voz", get="Obtener")),
    # 2026-10-28: 1.0.4 locales. later = locales/<loc>.json alarm.button.later.
    "de-DE": dict(alarm=("Ein sprechender Wecker.", "sprechender"), clock=("Eine sprechende Uhr.", "sprechende"),
                  said="Erinnere mich um 5,|Mama anzurufen", spoken="Mama anrufen.", title="Mama anrufen",
                  time="17:00", later="Später", slide="zum Stoppen streichen",
                  mock=dict(alarm="sprechender wecker", clock="sprechende uhr", sub="Sprach-Erinnerungen", get="Laden")),
    # Arabic: shaped with arabic_reshaper + python-bidi (PIL here has no libraqm), drawn in Dubai (Arabic-capable).
    "ar-SA": dict(alarm=("منبه ناطق.", "ناطق."), clock=("ساعة ناطقة.", "ناطقة."),
                  said="ذكرني الساعة ٥|أتصل بأمي", spoken="اتصل بأمي.", title="اتصل بأمي",
                  time="٥:٠٠", later="لاحقًا", slide="اسحب للإيقاف",
                  mock=dict(alarm="منبه ناطق", clock="ساعة ناطقة", sub="تذكيرات صوتية", get="تحميل")),
}
ROUND3_PHONE_LOCALES = ("en-US", "pt-BR", "es-MX")  # the secondary phone concept stays on the original three

RTL = False
_LATIN_FONTS = (F_HEAVY, F_SEMI, F_MED)
_ARABIC_FONTS = (str(FONTS / "DUBAI-BOLD.TTF"), str(FONTS / "DUBAI-MEDIUM.TTF"), str(FONTS / "DUBAI-MEDIUM.TTF"))


def _set_locale(loc):
    """Switch fonts + text direction for a locale (Arabic: Dubai fonts, RTL)."""
    global RTL, F_HEAVY, F_SEMI, F_MED
    RTL = loc.startswith("ar")
    F_HEAVY, F_SEMI, F_MED = _ARABIC_FONTS if RTL else _LATIN_FONTS


def _v(text):
    """Logical -> visual string. Arabic gets contextual shaping + bidi reordering; other locales pass through."""
    if not RTL:
        return text
    import arabic_reshaper
    from bidi.algorithm import get_display
    import unicodedata
    out = []
    for ch in arabic_reshaper.reshape(text):
        # isolated presentation forms -> base letter (the base glyph IS the isolated form, and some
        # Arabic fonts such as Dubai lack the U+FExx isolated code points, which would draw as tofu)
        dec = unicodedata.decomposition(ch).split()
        out.append(chr(int(dec[1], 16)) if len(dec) == 2 and dec[0] == "<isolated>" else ch)
    return get_display("".join(out))


def _blue_button(m: Image.Image, xmin=2500):
    import numpy as np
    a = np.asarray(m).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mask = (b > 200) & (r < 120) & (g > 80) & (g < 170)
    mask[:, :xmin] = False
    ys, xs = np.nonzero(mask)
    return (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))


def _screen_mask(m: Image.Image, btn):
    """Mask of the phone's blank, near-black screen around the blue button, holes filled. Returns (mask, bbox)."""
    import numpy as np
    import cv2
    from PIL import ImageFilter
    w = btn[2] - btn[0]
    x0, x1 = max(0, btn[0] - int(0.35 * w)), btn[2] + int(0.35 * w)
    y0, y1 = max(0, btn[1] - int(3.2 * w)), min(m.height, btn[3] + int(0.9 * w))
    a = np.asarray(m.crop((x0, y0, x1, y1))).astype(np.int16)
    dark = (a.max(axis=2) < 34).astype(np.uint8) * 255
    blue = ((a[..., 2] > 150) & (a[..., 0] < 140)).astype(np.uint8) * 255
    seed = cv2.bitwise_or(dark, blue)
    seed = cv2.morphologyEx(seed, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    cnts, _ = cv2.findContours(seed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    cx, cy = (btn[0] + btn[2]) // 2 - x0, (btn[1] + btn[3]) // 2 - y0
    cnt = max((c for c in cnts if cv2.pointPolygonTest(c, (float(cx), float(cy)), False) >= 0), key=cv2.contourArea)
    filled = np.zeros_like(seed)
    cv2.drawContours(filled, [cnt], -1, 255, -1)
    # drop rows that belong to a (wider) dark stand under the phone
    widths = (filled > 0).sum(axis=1)
    rows = np.nonzero(widths)[0]
    mid = rows[len(rows) // 4: 3 * len(rows) // 4]
    pw = float(np.median(widths[mid]))
    bottom = rows[-1]
    for r in rows[len(rows) // 2:]:
        if widths[r] > pw * 1.04:
            bottom = r - 1
            break
    filled[bottom + 1:] = 0
    # leave the black bezel ring: the dark outline is screen + bezel
    bez = max(3, round(pw * 0.034))
    filled = cv2.erode(filled, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * bez + 1, 2 * bez + 1)))
    # keep only the big screen component (drops slivers of a dark stand)
    n, lab, stats, _ = cv2.connectedComponentsWithStats((filled > 0).astype(np.uint8))
    if n > 2:
        big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        filled = np.where(lab == big, 255, 0).astype(np.uint8)
    op = max(3, round(pw * 0.06))
    filled = cv2.morphologyEx(filled, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (op, op)))
    ys, xs = np.nonzero(filled)
    full = Image.new("L", m.size, 0)
    full.paste(Image.fromarray(filled).filter(ImageFilter.GaussianBlur(1.2)), (x0, y0))
    return full, (x0 + int(xs.min()), y0 + int(ys.min()), x0 + int(xs.max()) + 1, y0 + int(ys.max()) + 1)


def _wallpaper(w, h):
    """Original abstract colour-field wallpaper, generated procedurally (not an Apple wallpaper)."""
    import numpy as np
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    xx /= w
    yy /= h
    img = np.zeros((h, w, 3), np.float32)
    img[:] = (18, 24, 62)

    def add(cx, cy, r, col, k):
        dd = np.exp(-(((xx - cx) ** 2) + ((yy - cy) * h / w) ** 2) / (r * r))
        return dd[..., None] * (np.array(col, np.float32) - img) * k

    img += add(0.15, 0.10, 0.75, (57, 112, 255), 0.85)
    img += add(0.95, 0.35, 0.65, (120, 70, 210), 0.75)
    img += add(0.20, 0.95, 0.60, (255, 128, 96), 0.55)
    img += add(0.70, 0.75, 0.50, (40, 160, 200), 0.35)
    img *= 0.62  # the alarm alert dims the wallpaper; keeps the white time and the button legible
    return Image.fromarray(np.clip(img, 0, 255).astype("uint8"))


def _lockscreen(img: Image.Image, btn, c):
    """Replace the blank rendered screen with an original wallpaper plus the iOS 26 alarm alert layout:
    alarm title, large time, app name, tinted secondary Later button, slide-to-stop slider (iOS 26.1+),
    status bar and Dynamic Island."""
    mask, sb = _screen_mask(img, btn)
    W, H = sb[2] - sb[0], sb[3] - sb[1]
    Hf = max(H, round(W * 2.17))  # full-device proportions even when a stand hides the bottom
    scr = _wallpaper(W, Hf)
    d = ImageDraw.Draw(scr)
    diw, dih = W * 0.31, W * 0.092
    d.rounded_rectangle((W / 2 - diw / 2, Hf * 0.022, W / 2 + diw / 2, Hf * 0.022 + dih), radius=dih / 2, fill=(0, 0, 0))
    sy = Hf * 0.022 + dih / 2
    u = W * 0.018
    bx = W * 0.90
    d.rounded_rectangle((bx - 3.6 * u, sy - 1.0 * u, bx, sy + 1.0 * u), radius=0.45 * u, fill=WHITE)
    d.rectangle((bx + 0.2 * u, sy - 0.4 * u, bx + 0.5 * u, sy + 0.4 * u), fill=WHITE)
    wx = bx - 5.6 * u
    for rr in (1.7, 1.15, 0.6):
        d.arc((wx - rr * u, sy - rr * u + 0.6 * u, wx + rr * u, sy + rr * u + 0.6 * u), 225, 315, fill=WHITE, width=max(1, round(0.35 * u)))
    gx = W * 0.10
    for i in range(4):
        hh = (0.5 + 0.38 * i) * u
        d.rounded_rectangle((gx + i * 0.75 * u, sy + 1.0 * u - hh, gx + i * 0.75 * u + 0.5 * u, sy + 1.0 * u), radius=0.2 * u, fill=WHITE)
    cx = W / 2
    tm = _v(c["time"])
    ft = ImageFont.truetype(F_MED, round(W * 0.235))
    while ft.getlength(tm) > W * 0.86:
        ft = ImageFont.truetype(F_MED, ft.size - 2)
    ty = Hf * 0.30
    tb = d.textbbox((cx, ty), tm, font=ft, anchor="mm")
    d.text((cx, ty), tm, font=ft, fill=WHITE, anchor="mm")
    title = _v(c["title"])
    ls = round(W * 0.062)
    fl = ImageFont.truetype(F_SEMI, ls)
    try:
        fe = ImageFont.truetype(F_EMOJI, ls)
        ew = fe.getlength("\u23f0") + ls * 0.35
    except OSError:
        fe, ew = None, 0
    while fl.getlength(title) + ew > W * 0.88 and ls > 6:
        ls -= 1
        fl = ImageFont.truetype(F_SEMI, ls)
    lw = fl.getlength(title) + ew
    lx, ly = cx - lw / 2, tb[1] - ls * 1.6
    if RTL:  # emoji leads on the right
        if fe:
            d.text((lx + fl.getlength(title) + ls * 0.35, ly), "\u23f0", font=fe, embedded_color=True, anchor="lm")
        d.text((lx, ly), title, font=fl, fill=WHITE, anchor="lm")
    else:
        if fe:
            d.text((lx, ly), "\u23f0", font=fe, embedded_color=True, anchor="lm")
        d.text((lx + ew, ly), title, font=fl, fill=WHITE, anchor="lm")
    fr = ImageFont.truetype(F_MED, round(W * 0.05))
    d.text((cx, tb[3] + W * 0.09), "Remi", font=fr, fill=(215, 220, 235), anchor="mm")
    bh = W * 0.20
    by0 = Hf * 0.70
    d.rounded_rectangle((W * 0.08, by0, W * 0.92, by0 + bh), radius=bh / 2, fill=BLUE)
    fb = ImageFont.truetype(F_SEMI, round(bh * 0.36))
    later = _v(c["later"])
    while fb.getlength(later) > W * 0.7:
        fb = ImageFont.truetype(F_SEMI, fb.size - 1)
    d.text((cx, by0 + bh / 2), later, font=fb, fill=WHITE, anchor="mm")
    sy0 = by0 + bh * 1.25
    over = Image.new("RGBA", scr.size, (0, 0, 0, 0))
    ImageDraw.Draw(over).rounded_rectangle((W * 0.08, sy0, W * 0.92, sy0 + bh), radius=bh / 2, fill=(255, 255, 255, 60))
    scr = Image.alpha_composite(scr.convert("RGBA"), over).convert("RGB")
    d = ImageDraw.Draw(scr)
    kr = bh * 0.40
    kx = W * 0.92 - bh / 2 if RTL else W * 0.08 + bh / 2   # RTL: the slider knob starts on the right
    d.ellipse((kx - kr, sy0 + bh / 2 - kr, kx + kr, sy0 + bh / 2 + kr), fill=WHITE)
    slide = _v(c["slide"])
    fs = ImageFont.truetype(F_SEMI, round(bh * 0.30))
    while fs.getlength(slide) > W * 0.56 and fs.size > 6:
        fs = ImageFont.truetype(F_SEMI, fs.size - 1)
    if RTL:
        d.text((W * 0.92 - bh * 1.05, sy0 + bh / 2), slide, font=fs, fill=(235, 238, 245), anchor="rm")
    else:
        d.text((W * 0.08 + bh * 1.05, sy0 + bh / 2), slide, font=fs, fill=(235, 238, 245), anchor="lm")
    d.rounded_rectangle((W * 0.34, Hf * 0.975, W * 0.66, Hf * 0.975 + W * 0.014), radius=W * 0.007, fill=WHITE)
    full = Image.new("RGB", img.size)
    full.paste(scr, (sb[0], sb[1]))
    img.paste(full, (0, 0), mask)
    return (sb[0] + min(tb[0], lx), sb[1] + ly - ls / 2, sb[0] + max(tb[2], lx + lw), sb[1] + tb[3])


def _phone_screen(img: Image.Image, btn, c):
    """Draw alarm label, time, 'Remi', button and slider text on a blank lock screen (geometry from the blue button)."""
    d = ImageDraw.Draw(img)
    w = btn[2] - btn[0]
    bh = btn[3] - btn[1]
    cx = (btn[0] + btn[2]) / 2
    ty = btn[1] - 0.83 * w                      # centre of the time digits
    ft = ImageFont.truetype(F_REG, round(w * 0.40))
    tb = d.textbbox((cx, ty), c["time"], font=ft, anchor="mm")
    # keep wide times (17:00) inside the screen
    while tb[2] - tb[0] > w * 0.92:
        ft = ImageFont.truetype(F_REG, ft.size - 2)
        tb = d.textbbox((cx, ty), c["time"], font=ft, anchor="mm")
    d.text((cx, ty), c["time"], font=ft, fill=WHITE, anchor="mm")
    dh = tb[3] - tb[1]
    fr = ImageFont.truetype(F_MED, round(dh * 0.20))
    d.text((cx, tb[3] + dh * 0.42), "Remi", font=fr, fill=(150, 150, 156), anchor="mm")
    ls = round(dh * 0.24)
    fl = ImageFont.truetype(F_SEMI, ls)
    try:
        fe = ImageFont.truetype(F_EMOJI, ls)
        ew = fe.getlength("⏰") + ls * 0.35
    except OSError:
        fe, ew = None, 0
    while fl.getlength(c["title"]) + ew > w * 0.95 and ls > 8:
        ls -= 1
        fl = ImageFont.truetype(F_SEMI, ls)
    lw = fl.getlength(c["title"]) + ew
    lx, ly = cx - lw / 2, tb[1] - dh * 0.55
    if fe:
        d.text((lx, ly), "⏰", font=fe, embedded_color=True, anchor="lm")
    d.text((lx + ew, ly), c["title"], font=fl, fill=(235, 235, 240), anchor="lm")
    fb = ImageFont.truetype(F_SEMI, round(bh * 0.40))
    while fb.getlength(c["later"]) > w * 0.8:
        fb = ImageFont.truetype(F_SEMI, fb.size - 1)
    d.text((cx, (btn[1] + btn[3]) / 2), c["later"], font=fb, fill=WHITE, anchor="mm")
    sz = round(bh * 0.28)
    fs = ImageFont.truetype(F_SEMI, sz)
    while fs.getlength(c["slide"]) > w * 0.60 and sz > 6:
        sz -= 1
        fs = ImageFont.truetype(F_SEMI, sz)
    d.text((btn[0] + w * 0.33, btn[3] + bh * 0.78), c["slide"], font=fs, fill=(120, 120, 128), anchor="lm")
    return (min(tb[0], lx), ly - ls / 2, max(tb[2], lx + lw), tb[3])


def _mic_icon(d, x, y, h, color=BLUE):
    w = h * 0.42
    lw = max(3, round(h * 0.09))
    d.rounded_rectangle((x + h * 0.29, y, x + h * 0.29 + w, y + h * 0.62), radius=w / 2, fill=color)
    d.arc((x + h * 0.12, y + h * 0.20, x + h * 0.88, y + h * 0.80), 0, 180, fill=color, width=lw)
    d.line((x + h * 0.5, y + h * 0.80, x + h * 0.5, y + h * 0.98), fill=color, width=lw)
    return h


def _bubble3(img, text, icon, x, y, size, max_w, anchor="left", tail="left"):
    """Speech bubble. text may contain '|' line breaks. anchor: x is the left or right edge.
    tail: 'left' (bottom-left, toward a speaker below-left) or 'right' (bottom-right)."""
    from PIL import ImageFilter
    lines = [_v(l) for l in text.split("|")]
    while True:
        f = ImageFont.truetype(F_HEAVY, size)
        ih = round(size * 0.95)
        pad_x, pad_y = round(size * 0.6), round(size * 0.48)
        tw = max(f.getlength(l) for l in lines)
        w = round(pad_x + ih + size * 0.45 + tw + pad_x)
        if w <= max_w or size <= 40:
            break
        size -= 2
    lh = round(size * 1.18)
    asc, _ = f.getmetrics()
    h = round(pad_y * 2 + lh * (len(lines) - 1) + asc * 0.95)
    x0 = x if anchor == "left" else x - w
    y0 = y
    rad = round(min(h, 2.2 * size) * 0.42)
    sh = Image.new("L", img.size, 0)
    ImageDraw.Draw(sh).rounded_rectangle((x0, y0 + 18, x0 + w, y0 + h + 18), radius=rad, fill=110)
    sh = sh.filter(ImageFilter.GaussianBlur(34))
    img.paste(Image.new("RGB", img.size, (60, 40, 20)), (0, 0), sh)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((x0, y0, x0 + w, y0 + h), radius=rad, fill=WHITE)
    th = min(h, 2.2 * size)
    if tail == "right":
        tx = x0 + w - rad * 0.9
        d.polygon([(tx - th * 0.28, y0 + h - 2), (tx + th * 0.30, y0 + h - 2), (x0 + w + th * 0.22, y0 + h + th * 0.30)], fill=WHITE)
    else:
        tx = x0 + rad * 0.9
        d.polygon([(tx + th * 0.28, y0 + h - 2), (tx - th * 0.30, y0 + h - 2), (x0 - th * 0.22, y0 + h + th * 0.30)], fill=WHITE)
    iy = y0 + (h - ih) / 2
    ix = x0 + w - pad_x - ih if RTL else x0 + pad_x   # RTL: icon leads on the right, text right-aligned
    if icon == "mic":
        _mic_icon(d, ix, iy, ih)
    else:
        _sound_icon(d, ix, iy, ih)
    ty = y0 + pad_y + asc * 0.95 / 2
    for l in lines:
        if RTL:
            d.text((ix - size * 0.45, ty), l, font=f, fill=NAVY, anchor="rm")
        else:
            d.text((x0 + pad_x + ih + size * 0.45, ty), l, font=f, fill=NAVY, anchor="lm")
        ty += lh
    return (x0, y0, x0 + w, y0 + h), size


def _crop_out(m, win, out_w, out_h):
    x0, y0, w = win
    h = round(w * out_h / out_w)
    return m.crop((x0, y0, x0 + w, y0 + h)).resize((out_w, out_h), Image.LANCZOS)


def _safe_in(win, tsafe, tw):
    """Template safe rect (in a tw-wide template) mapped into master coords for a crop window (x0, y0, w)."""
    x0, y0, w = win
    k = w / tw
    return (round(x0 + tsafe[0] * k), round(y0 + tsafe[1] * k), round(x0 + tsafe[2] * k), round(y0 + tsafe[3] * k))


def _dist(a, b):
    """Gap between two boxes (0 if they overlap)."""
    dx = max(b[0] - a[2], a[0] - b[2], 0)
    dy = max(b[1] - a[3], a[1] - b[3], 0)
    return (dx * dx + dy * dy) ** 0.5


def _headline_ink_box(f, lh, runs, x, y_top):
    d = ImageDraw.Draw(Image.new("L", (1, 1)))
    r = 0
    for ln in runs:
        r = max(r, x + d.textbbox((0, 0), "".join(t for t, _ in ln), font=f)[2])
    first = d.textbbox((0, 0), "".join(t for t, _ in runs[0]), font=f)
    return (x, y_top + first[1], r, y_top + lh * (len(runs) - 1) + f.getmetrics()[0])


# Woman art (raw/woman-2.png -> master 5244x2950, no zoom). Measured from a grid overlay:
W_FACE = (1280, 1480, 2040, 2070)      # ear to cheek, hairline to chin
W_HAIR = (1180, 1100, 2110, 2200)
W_MOUTH = (1950, 1960)
# Crop windows (x0, y0, width) in master coords, chosen so the whole face sits inside each safe area
W_SEARCH_WIN = (280, 100, 4275)        # 3:2  -> height 2850
W_HEADER_WIN = (0, 845, 4340)          # 21:9 -> height 1860 (art upscaled ~1.2x more for the header)


def _woman_crop(base, btn, scr, c, page, crop):
    win = W_SEARCH_WIN if crop == "search" else W_HEADER_WIN
    tsafe, tw, out = ((836, 765, 3004, 1795), 3840, (3840, 2560)) if crop == "search" else ((1097, 493, 2743, 1154), 3840, (3840, 1646))
    safe = _safe_in(win, tsafe, tw)
    k = win[2] / 3840                    # master px per delivered px
    clear = round(CLEAR_PX * k) + 4
    m = base.copy()
    phone_box = (btn[0] - round((btn[2] - btn[0]) * 0.16), scr[1] - 300, btn[2] + round((btn[2] - btn[0]) * 0.16), btn[3] + 200)
    # headline: the empty wall right of her hair, top of the safe area
    hx = W_HAIR[2] + clear
    headline, emph = c[page]
    if crop == "search":
        hbox = (hx, safe[1], safe[2], 1500)
        bub_y, bub_size = 1585, 112
    else:
        hbox = (hx, safe[1], safe[2], safe[1] + 420)
        bub_y, bub_size = safe[1] + 470, 92
    f, lh, runs = _wrap_fit(headline, emph, hbox, 340)
    ytop = hbox[1]
    # her bubble: right of her mouth, tail toward the mouth (drawn on a scratch copy first so an RTL
    # headline can right-align to the bubble's right edge)
    said_box, said_size = _bubble3(m.copy(), c["said"], "mic", hx, bub_y, bub_size, max_w=phone_box[0] - 60 - hx, anchor="left", tail="left")
    if RTL:
        lw = max(sum(f.getlength(t) for t, _ in r) for r in runs)
        right = min(hbox[2], max(said_box[2], hx + lw))
        _draw_runs(m, f, lh, runs, hbox[0], ytop, right=right)
        ink = (right - lw, ytop, right, ytop + lh * len(runs))
    else:
        _draw_runs(m, f, lh, runs, hbox[0], ytop)
        ink = _headline_ink_box(f, lh, runs, hbox[0], ytop)
    said_box, said_size = _bubble3(m, c["said"], "mic", hx, bub_y, bub_size, max_w=phone_box[0] - 60 - hx, anchor="left", tail="left")
    # phone bubble: left of the counter phone, at screen height, tail toward the phone
    sp_box, _ = _bubble3(m, c["spoken"], "wave", phone_box[0] - 50, scr[3] + 40, bub_size, max_w=phone_box[0] - 50 - hx,
                         anchor="right", tail="right")
    img = _vignette(_crop_out(m, win, *out))
    gaps = {"face": _dist(ink, W_HAIR), "bubble": _dist(ink, said_box), "phone": _dist(ink, phone_box)}
    info = dict(font=f.size, ink=ink, safe=safe, gaps={kk: v / k for kk, v in gaps.items()},
                face_in_safe=all([W_FACE[0] >= safe[0], W_FACE[1] >= safe[1], W_FACE[2] <= safe[2], W_FACE[3] <= safe[3]]),
                head_in_safe=all([ink[0] >= safe[0], ink[1] >= safe[1], ink[2] <= safe[2], ink[3] <= safe[3]]),
                k=k, said_size=said_size, win=win)
    return img, info


def _pt(crop, f_px, info):
    if crop == "search":
        return round(f_px / info["k"] * 343 / 3840, 1)
    return round(f_px / info["win"][2] * 393, 1)


def _cards_sheet(cards, path, title, locales=None):
    locales = list(locales or COPY3)
    nc = len(locales)
    cw, ch = cards[0][1].size
    tf = ImageFont.truetype(F_LABEL, 44)
    sheet = Image.new("RGB", (nc * cw + (nc + 1) * 40, 2 * (ch + 90) + 130), (225, 226, 230))
    sd = ImageDraw.Draw(sheet)
    sd.text((40, 30), title, font=tf, fill=NAVY)
    lookup = dict(cards)
    for i, (p, l) in enumerate([(p, l) for p in ("alarm", "clock") for l in locales]):
        col, row = i % nc, i // nc
        x, y = 40 + col * (cw + 40), 130 + row * (ch + 90)
        sd.text((x, y), f"{'Main page' if p == 'alarm' else 'Clock CPP'}  -  {l}", font=tf, fill=NAVY)
        sheet.paste(lookup[f"{p} / {l}"], (x, y + 60))
    sheet.save(path)


def _card(img, c, page):
    card = _app_store_card(img, sub=c["mock"]["sub"], get=c["mock"]["get"])
    dd = ImageDraw.Draw(card)
    dd.rounded_rectangle((75, 54, card.width - 75, 162), radius=30, fill=(238, 238, 240))
    if RTL:
        dd.text((card.width - 120, 108), _v(c["mock"][page]), font=ImageFont.truetype(F_SEMI, 39), fill=(140, 140, 146), anchor="rm")
    else:
        dd.text((120, 108), c["mock"][page], font=ImageFont.truetype(F_SEMI, 39), fill=(140, 140, 146), anchor="lm")
    return card


def _erase_left_arcs(m: Image.Image, x0, x1, y0, y1, min_lum=150, dil=25) -> Image.Image:
    """Remove the thin whitish sound-wave arcs in a region (OpenCV inpaint on a whiteness mask)."""
    import numpy as np
    import cv2
    a = np.asarray(m).copy()
    reg = a[y0:y1, x0:x1].astype(np.int16)
    blur = cv2.GaussianBlur(reg.astype(np.uint8), (0, 0), 60).astype(np.int16)
    # arcs are whiter than the warm wall: blue channel and luminance rise, saturation drops
    whiter = (reg[..., 2] - blur[..., 2] > 7) & (reg.mean(axis=2) - blur.mean(axis=2) > 3) & (reg.mean(axis=2) > min_lum)
    mask = cv2.dilate(whiter.astype(np.uint8) * 255, np.ones((dil, dil), np.uint8))
    fixed = cv2.inpaint(np.ascontiguousarray(a[y0:y1, x0:x1][..., ::-1]), mask, 9, cv2.INPAINT_TELEA)[..., ::-1]
    a[y0:y1, x0:x1] = fixed
    return Image.fromarray(a)


def round3():
    # ---------- woman (primary) ----------
    base_w = to_master(Image.open(RAW / "woman-2.png"))
    btn_w = _blue_button(base_w, 3000)
    cards = []
    print("WOMAN  (search window", W_SEARCH_WIN, " header window", W_HEADER_WIN, ")")
    only = [x for x in os.environ.get("LOCALES", "").split(",") if x]
    for loc, c in COPY3.items():
        if only and loc not in only:
            continue
        _set_locale(loc)
        m0 = base_w.copy()
        scr = _lockscreen(m0, btn_w, c)
        for page in ("alarm", "clock"):
            outs = {}
            for crop in ("search", "header"):
                img, info = _woman_crop(m0, btn_w, scr, c, page, crop)
                name = f"woman_final_{page}_{loc}_{crop}_{'3x2' if crop == 'search' else '21x9'}.png"
                img.save(OUT / name)
                outs[crop] = img
                g = info["gaps"]
                print(f"  {page:5s} {loc} {crop:6s} headline {info['font']}px = {_pt(crop, info['font'], info)} pt; "
                      f"clearance (delivered px) to hair {g['face']:.0f}, to bubble {g['bubble']:.0f}, to phone {g['phone']:.0f}; "
                      f"face in safe {info['face_in_safe']}, headline in safe {info['head_in_safe']}; bubble text {_pt(crop, info['said_size'], info)} pt")
            card = _card(outs["search"], c, page)
            card.save(OUT / f"woman_final_{page}_{loc}_card_343pt_white.png")
            cards.append((f"{page} / {loc}", card))
    _set_locale("en-US")
    _cards_sheet(cards, OUT / ("woman_final_cards_contact_sheet.png" if not only else f"woman_final_cards_contact_sheet_{'_'.join(only)}.png"),
                 "PRIMARY - woman concept: search card at 343 pt on white", only or None)
    if only and not set(only) & set(ROUND3_PHONE_LOCALES):
        return

    # ---------- phone-only (secondary) ----------
    base_p = to_master(Image.open(RAW / "phone-1c.png"))
    btn_p = _blue_button(base_p)
    bez0 = _bezel_left(base_p, btn_p, 1000, 2000)
    base_p = _erase_left_arcs(base_p, 2250, 2590, 1050, 1850)  # wall only; stop before the cabinet edge
    base_p.crop((1700, 600, 3400, 2400)).resize((850, 900)).save(OUT / "raw" / "_phone-1c_arcs_check.png")
    h_safe = (round(1097 * H_K), H_Y_1B + round(493 * H_K), round(2743 * H_K), H_Y_1B + round(1154 * H_K))
    top_band = max(S_SAFE[1], h_safe[1])
    cards = []
    print("PHONE")
    for loc in ROUND3_PHONE_LOCALES:
        c = COPY3[loc]
        m0 = base_p.copy()
        bezel = _bezel_left(m0, btn_p, top_band, S_SAFE[3])   # measure before the screen gets a wallpaper
        scr = _lockscreen(m0, btn_p, c)
        bub, _ = _bubble3(m0, c["spoken"], "wave", bezel - 40, top_band + 10, 124, max_w=bezel - 40 - h_safe[0], anchor="right", tail="right")
        inside = lambda b, s: b[0] >= s[0] and b[1] >= s[1] and b[2] <= s[2] and b[3] <= s[3]
        print(f"  {loc}: bubble in header safe {inside(bub, h_safe)} / search safe {inside(bub, S_SAFE)}; "
              f"time+label in header safe {inside(scr, h_safe)}; bezel x {bezel}")
        for page in ("alarm", "clock"):
            headline, emph = c[page]
            outs = {}
            for crop, safe, k in (("search", S_SAFE, S_K), ("header", h_safe, H_K)):
                margin = round(CLEAR_PX * k) + 4
                box = (safe[0], bub[3] + 45, bezel - margin, safe[3])
                f, lh, runs = _wrap_fit(headline, emph, box, 340)
                y_top = box[1] + (box[3] - box[1] - lh * len(runs)) // 2
                m = m0.copy()
                _draw_runs(m, f, lh, runs, box[0], y_top)
                clear = (bezel - _ink_right(f, lh, runs, box[0], y_top)) / k
                if crop == "search":
                    img = m.crop((S_X, 0, S_X + S_W, MH)).resize((3840, 2560), Image.LANCZOS)
                    sz = f"{round(f.size / S_K * 343 / 3840, 1)} pt on card"
                else:
                    img = m.crop((0, H_Y_1B, MW, H_Y_1B + H_H)).resize((3840, 1646), Image.LANCZOS)
                    sz = f"{round(f.size / MW * 393, 1)} pt on page"
                img = _vignette(img)
                img.save(OUT / f"phone_final_{page}_{loc}_{crop}_{'3x2' if crop == 'search' else '21x9'}.png")
                outs[crop] = img
                print(f"  {page:5s} {loc} {crop:6s} headline {f.size}px = {sz}; clearance to bezel {clear:.0f} px delivered")
            card = _card(outs["search"], c, page)
            card.save(OUT / f"phone_final_{page}_{loc}_card_343pt_white.png")
            cards.append((f"{page} / {loc}", card))
    _cards_sheet(cards, OUT / "phone_final_cards_contact_sheet.png", "SECONDARY - phone concept: search card at 343 pt on white", ROUND3_PHONE_LOCALES)


if __name__ == "__main__":
    if sys.argv[1:] == ["round3"]:
        round3()
    elif sys.argv[1:] == ["final"]:
        final()
    elif sys.argv[1:] == ["concept-1b"]:
        compose_1b()
    else:
        main()
