#!/usr/bin/env python3
"""
Deterministic App Store screenshot compositor for "Remi: Voice Reminders".

Takes raw iPhone screenshots + a JSON config and emits finished App Store
marketing images (1290x2796, sRGB PNG). Everything is composited from real
pixels with PIL/Pillow -- no image generation of any kind.

Usage
-----
    python compose_screenshots.py                     # raw/ -> out/
    python compose_screenshots.py --preview           # synthesized mocks -> out/preview/
    python compose_screenshots.py --config shots.ar.json --out out/ar
    python compose_screenshots.py --only 02-lockscreen

The whole pipeline is a pure function of (config, raw pixels): same input,
byte-identical output.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

try:  # optional -- only used to stamp an sRGB profile onto the output
    from PIL import ImageCms
except Exception:  # pragma: no cover
    ImageCms = None


HERE = Path(__file__).resolve().parent


# --------------------------------------------------------------------------
# small helpers
# --------------------------------------------------------------------------

def hex_rgb(value):
    """'#3970FF' / '3970ff' / [57,112,255] -> (57, 112, 255)."""
    if isinstance(value, (list, tuple)):
        return tuple(int(c) for c in value[:3])
    s = str(value).lstrip("#")
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def lerp(a, b, t):
    return a + (b - a) * t


def smoothstep(edge0, edge1, x):
    t = np.clip((x - edge0) / max(edge1 - edge0, 1e-6), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


FONT_DIRS = [
    Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts",
    Path.home() / "AppData/Local/Microsoft/Windows/Fonts",
    Path("/usr/share/fonts"),
    Path("/Library/Fonts"),
    Path.home() / ".fonts",
]

_font_cache = {}


def resolve_font(candidates):
    """First existing font file from a list of names/paths. Raises if none."""
    if isinstance(candidates, str):
        candidates = [candidates]
    key = tuple(candidates)
    if key in _font_cache:
        return _font_cache[key]
    for name in candidates:
        p = Path(name)
        if p.is_file():
            _font_cache[key] = str(p)
            return str(p)
        if not p.is_absolute():
            for d in FONT_DIRS:
                if not d.exists():
                    continue
                direct = d / name
                if direct.is_file():
                    _font_cache[key] = str(direct)
                    return str(direct)
                hit = next(iter(sorted(d.rglob(name))), None)
                if hit is not None:
                    _font_cache[key] = str(hit)
                    return str(hit)
    raise FileNotFoundError(
        "None of these fonts were found: %s\nLooked in: %s"
        % (", ".join(candidates), ", ".join(str(d) for d in FONT_DIRS))
    )


def truetype(path, size):
    return ImageFont.truetype(path, max(int(size), 1))


def text_width(font, s):
    return font.getbbox(s)[2] - font.getbbox(s)[0] if s else 0


def rounded_mask(size, radius, ss=4):
    """Anti-aliased rounded-rectangle L mask (supersampled, then downsampled)."""
    w, h = size
    w = max(int(w), 1)
    h = max(int(h), 1)
    r = max(int(radius), 0)
    big = Image.new("L", (w * ss, h * ss), 0)
    ImageDraw.Draw(big).rounded_rectangle(
        [0, 0, w * ss - 1, h * ss - 1], radius=r * ss, fill=255
    )
    return big.resize((w, h), Image.LANCZOS)


# --------------------------------------------------------------------------
# background: two-tone blue with parallel diagonal folds
# --------------------------------------------------------------------------
#
# Sampled from the reference set: two parallel fold lines at ~-6 deg (rising
# to the right). Band A (top) is the saturated blue, bands B and C are the
# lighter periwinkle. Fold 2 carries a thin specular highlight with a soft
# shadow under it, which is what sells the "folded paper" look.

def _band_gradient(u, t, stops):
    """stops: [{'t':0.0,'left':'#..','right':'#..'}, ...] -> HxWx3 float array."""
    stops = sorted(stops, key=lambda s: s["t"])
    ts = [float(s["t"]) for s in stops]
    left = [np.array(hex_rgb(s["left"]), dtype=np.float32) for s in stops]
    right = [np.array(hex_rgb(s.get("right", s["left"])), dtype=np.float32) for s in stops]

    out = np.zeros(t.shape + (3,), dtype=np.float32)
    # below first stop
    out[:] = left[0] * (1 - u[..., None]) + right[0] * u[..., None]
    for i in range(len(stops) - 1):
        t0, t1 = ts[i], ts[i + 1]
        w = np.clip((t - t0) / max(t1 - t0, 1e-6), 0.0, 1.0)[..., None]
        c0 = left[i] * (1 - u[..., None]) + right[i] * u[..., None]
        c1 = left[i + 1] * (1 - u[..., None]) + right[i + 1] * u[..., None]
        seg = c0 + (c1 - c0) * w
        active = (t >= t0)[..., None]
        out = np.where(active, seg, out)
    return out


def build_background(width, height, bg):
    W, H = int(width), int(height)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    u = xx / max(W - 1, 1)

    angle = math.radians(float(bg.get("fold_angle_deg", -6.0)))
    slope = math.tan(angle)  # dy per dx; negative == fold rises to the right

    f1 = float(bg.get("fold1_frac", 0.25)) * H + (xx - W / 2.0) * slope
    f2 = float(bg.get("fold2_frac", 0.748)) * H + (xx - W / 2.0) * slope

    # band-local vertical parameter
    tA = np.clip(yy / np.maximum(f1, 1.0), 0.0, 1.0)
    tB = np.clip((yy - f1) / np.maximum(f2 - f1, 1.0), 0.0, 1.0)
    tC = np.clip((yy - f2) / np.maximum(H - f2, 1.0), 0.0, 1.0)

    cA = _band_gradient(u, tA, bg["band_top"])
    cB = _band_gradient(u, tB, bg["band_mid"])
    cC = _band_gradient(u, tC, bg["band_bottom"])

    # fold 1 is a hard (anti-aliased) colour break
    m1 = smoothstep(-0.8, 0.8, yy - f1)[..., None]
    img = cA * (1 - m1) + cB * m1

    # fold 2 is a soft crease: bands are close in colour, edge does the work
    m2 = smoothstep(-0.8, 0.8, yy - f2)[..., None]
    img = img * (1 - m2) + cC * m2

    scale = H / 2796.0
    d2 = yy - f2

    hl = bg.get("fold2_highlight")
    if hl:
        hw = float(hl.get("width_px", 5.0)) * scale
        k = np.exp(-(d2 / max(hw, 0.5)) ** 2) * float(hl.get("strength", 0.85))
        target = np.array(hex_rgb(hl.get("color", "#B9CCFF")), dtype=np.float32)
        img = img + (target - img) * k[..., None]

    sh = bg.get("fold2_shadow")
    if sh:
        centre = float(sh.get("offset_px", 9.0)) * scale
        sw = float(sh.get("width_px", 9.0)) * scale
        k = np.exp(-((d2 - centre) / max(sw, 0.5)) ** 2) * float(sh.get("strength", 0.55))
        k = np.where(d2 > 0, k, 0.0)
        target = np.array(hex_rgb(sh.get("color", "#6C8CE0")), dtype=np.float32)
        img = img + (target - img) * k[..., None]

    return Image.fromarray(np.clip(img + 0.5, 0, 255).astype(np.uint8), "RGB")


# --------------------------------------------------------------------------
# device mock
# --------------------------------------------------------------------------

def frame_device(screenshot, device_width, bezel, radius, ss=1, opts=None):
    """Black rounded bezel around `screenshot`, screen clipped to inner radius.

    Everything is built at `ss` times the target size so a later rotation has
    real pixels to chew on; the caller downsamples once, after rotating.
    Aspect ratio is taken from the source image, so any iPhone resolution
    scales cleanly.
    """
    opts = opts or {}
    src_w, src_h = screenshot.size
    dev_w = int(round(device_width))
    bez = int(round(bezel))
    screen_w = dev_w - 2 * bez
    if screen_w <= 0:
        raise ValueError("bezel too thick for device_width=%d" % dev_w)
    screen_h = int(round(screen_w * src_h / src_w))
    dev_h = screen_h + 2 * bez

    S = max(int(ss), 1)
    DW, DH = dev_w * S, dev_h * S
    B = bez * S
    R = int(round(radius)) * S
    inner_r = max(R - B, 0)

    body = Image.new("RGBA", (DW, DH), (0, 0, 0, 0))
    bezel_rgb = hex_rgb(opts.get("bezel_color", "#0B0B0D"))
    slab = Image.new("RGBA", (DW, DH), bezel_rgb + (255,))
    body.paste(slab, (0, 0), rounded_mask((DW, DH), R, ss=4))

    screen = screenshot.convert("RGB").resize(
        (max(screen_w * S, 1), max(screen_h * S, 1)), Image.LANCZOS
    )
    body.paste(screen, (B, B), rounded_mask(screen.size, inner_r, ss=4))

    # faint rim light so the bezel doesn't melt into a dark screenshot
    rim = float(opts.get("rim_opacity", 0.16))
    if rim > 0:
        rim_layer = Image.new("RGBA", (DW, DH), (0, 0, 0, 0))
        ImageDraw.Draw(rim_layer).rounded_rectangle(
            [0, 0, DW - 1, DH - 1],
            radius=R,
            outline=hex_rgb(opts.get("rim_color", "#8FA4C8")) + (int(255 * rim),),
            width=max(2 * S, 1),
        )
        body = Image.alpha_composite(body, rim_layer)

    return body, (dev_w, dev_h)


def build_placed_device(screenshot, device_width, dev_cfg, angle_deg, supersample):
    """Frame + (optionally) rotate, returning a 1x RGBA ready to paste."""
    S = max(int(supersample), 1) if abs(angle_deg) > 1e-6 else 1
    body, _ = frame_device(
        screenshot,
        device_width,  # logical width; the ss multiply happens inside frame_device
        dev_cfg.get("bezel", 50),
        dev_cfg.get("corner_radius", 120),
        ss=S,
        opts=dev_cfg,
    )
    if abs(angle_deg) > 1e-6:
        body = body.rotate(angle_deg, resample=Image.BICUBIC, expand=True)
    if S > 1:
        body = body.resize(
            (max(body.width // S, 1), max(body.height // S, 1)), Image.LANCZOS
        )
    return body


def paste_with_shadow(canvas, device, pos, shadow_cfg):
    """Drop the device onto `canvas` with a soft shadow underneath."""
    x, y = int(round(pos[0])), int(round(pos[1]))
    if shadow_cfg and shadow_cfg.get("opacity", 0) > 0:
        blur = int(round(float(shadow_cfg.get("blur", 55))))
        pad = blur * 3 + 8
        alpha = device.getchannel("A")
        sil = Image.new("L", (device.width + 2 * pad, device.height + 2 * pad), 0)
        sil.paste(alpha, (pad, pad))
        sil = sil.filter(ImageFilter.GaussianBlur(blur))
        sil = sil.point(
            lambda v, o=float(shadow_cfg.get("opacity", 0.32)): int(min(255, v * o))
        )
        shade = Image.new(
            "RGBA", sil.size, hex_rgb(shadow_cfg.get("color", "#16284F")) + (0,)
        )
        shade.putalpha(sil)
        ox = int(round(float(shadow_cfg.get("offset_x", 0))))
        oy = int(round(float(shadow_cfg.get("offset_y", 26))))
        canvas.alpha_composite(shade, (x - pad + ox, y - pad + oy))
    canvas.alpha_composite(device, (x, y))


# --------------------------------------------------------------------------
# caption
# --------------------------------------------------------------------------

def wrap_to_lines(text, font, max_width, max_lines):
    """Balanced wrap. Returns list of lines, or None if it will not fit."""
    words = text.split()
    if not words:
        return []
    if text_width(font, text) <= max_width:
        return [text]
    if max_lines < 2:
        return None

    best = None
    if max_lines == 2:
        for i in range(1, len(words)):
            a = " ".join(words[:i])
            b = " ".join(words[i:])
            wa, wb = text_width(font, a), text_width(font, b)
            if wa <= max_width and wb <= max_width:
                score = max(wa, wb) + abs(wa - wb) * 0.35
                if best is None or score < best[0]:
                    best = (score, [a, b])
        return best[1] if best else None

    # greedy for 3+
    lines, cur = [], words[0]
    for w in words[1:]:
        trial = cur + " " + w
        if text_width(font, trial) <= max_width:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    if len(lines) > max_lines or any(text_width(font, l) > max_width for l in lines):
        return None
    return lines


def fit_text(text, font_path, base_size, max_width, max_lines, min_scale=0.55):
    size = int(base_size)
    floor = max(int(base_size * min_scale), 12)
    while size >= floor:
        font = truetype(font_path, size)
        lines = wrap_to_lines(text, font, max_width, max_lines)
        if lines is not None:
            return font, lines
        size -= 2
    font = truetype(font_path, floor)
    return font, wrap_to_lines(text, font, max_width, 6) or [text]


def draw_caption(canvas, shot, cap_cfg, canvas_size):
    W, H = canvas_size
    headline = shot.get("headline", "")
    sub = shot.get("subheadline") or ""
    if not headline and not sub:
        return

    head_font_path = resolve_font(cap_cfg["headline_font"])
    sub_font_path = resolve_font(cap_cfg["subheadline_font"])

    margin = float(cap_cfg.get("side_margin_frac", 0.085)) * W
    max_w = W - 2 * margin

    hf, hlines = fit_text(
        headline,
        head_font_path,
        float(cap_cfg.get("headline_size", 100)),
        max_w,
        int(cap_cfg.get("headline_max_lines", 2)),
    )
    h_lh = hf.size * float(cap_cfg.get("headline_line_height", 1.16))

    slines, sf, s_lh = [], None, 0.0
    if sub:
        sf, slines = fit_text(
            sub,
            sub_font_path,
            float(cap_cfg.get("subheadline_size", 58)),
            max_w,
            int(cap_cfg.get("subheadline_max_lines", 2)),
        )
        s_lh = sf.size * float(cap_cfg.get("subheadline_line_height", 1.22))

    gap = float(cap_cfg.get("gap", 0.32)) * hf.size if slines else 0.0
    block_h = len(hlines) * h_lh + gap + len(slines) * s_lh

    position = shot.get("caption_position", cap_cfg.get("position", "top"))
    if position == "bottom":
        top = H * (1.0 - float(cap_cfg.get("bottom_frac", 0.10))) - block_h
    else:
        top = H * float(cap_cfg.get("top_frac", 0.085))

    d = ImageDraw.Draw(canvas, "RGBA")
    head_rgb = hex_rgb(cap_cfg.get("headline_color", "#FFFFFF"))
    head_a = int(255 * float(cap_cfg.get("headline_opacity", 1.0)))
    sub_rgb = hex_rgb(cap_cfg.get("subheadline_color", "#FFFFFF"))
    sub_a = int(255 * float(cap_cfg.get("subheadline_opacity", 0.62)))

    y = top
    for line in hlines:
        d.text((W / 2, y + h_lh / 2), line, font=hf, fill=head_rgb + (head_a,), anchor="mm")
        y += h_lh
    y += gap
    for line in slines:
        d.text((W / 2, y + s_lh / 2), line, font=sf, fill=sub_rgb + (sub_a,), anchor="mm")
        y += s_lh


# --------------------------------------------------------------------------
# one shot
# --------------------------------------------------------------------------

def deep_merge(base, override):
    out = dict(base or {})
    for k, v in (override or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def render_shot(cfg, shot, screenshot):
    canvas_cfg = cfg.get("canvas", {})
    W = int(canvas_cfg.get("width", 1290))
    H = int(canvas_cfg.get("height", 2796))

    bg_cfg = deep_merge(cfg["background"], shot.get("background"))
    canvas = build_background(W, H, bg_cfg).convert("RGBA")

    layout_name = shot.get("layout", "straight")
    layout = deep_merge(cfg["layouts"].get(layout_name, {}), shot.get("layout_overrides"))
    dev_cfg = deep_merge(cfg.get("device", {}), shot.get("device"))

    width_frac = float(layout.get("device_width_frac", 0.74))
    dev_w = int(round(W * width_frac))
    angle = float(layout.get("angle_deg", 0.0))
    ss = int(cfg.get("supersample", 2))

    device = build_placed_device(screenshot, dev_w, dev_cfg, angle, ss)

    if "center_x_frac" in layout or "center_y_frac" in layout:
        cx = float(layout.get("center_x_frac", 0.5)) * W
        cy = float(layout.get("center_y_frac", 0.62)) * H
        pos = (cx - device.width / 2.0, cy - device.height / 2.0)
    else:
        cx = float(layout.get("center_x_frac_default", 0.5)) * W
        pos = (cx - device.width / 2.0, float(layout.get("device_top_frac", 0.30)) * H)

    paste_with_shadow(canvas, device, pos, deep_merge(cfg.get("shadow", {}), shot.get("shadow")))

    cap_cfg = deep_merge(cfg["caption"], shot.get("caption"))
    draw_caption(canvas, shot, cap_cfg, (W, H))

    return canvas.convert("RGB")


def save_png(img, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    kwargs = {}
    if ImageCms is not None:
        try:
            kwargs["icc_profile"] = ImageCms.ImageCmsProfile(
                ImageCms.createProfile("sRGB")
            ).tobytes()
        except Exception:
            pass
    img.save(path, "PNG", optimize=True, **kwargs)


# --------------------------------------------------------------------------
# placeholder screenshot synthesis (preview mode only)
# --------------------------------------------------------------------------

MOCK_W, MOCK_H = 1179, 2556
ACCENT = (59, 130, 246)
DARK_BG = (17, 22, 36)
LIGHT_BG = (247, 248, 250)


def _mock_fonts():
    b = resolve_font(["Montserrat-Bold.ttf", "seguibl.ttf", "segoeuib.ttf", "arialbd.ttf"])
    m = resolve_font(["Montserrat-Medium.ttf", "segoeui.ttf", "arial.ttf"])
    sb = resolve_font(["Montserrat-SemiBold.ttf", "seguisb.ttf", "segoeuib.ttf", "arialbd.ttf"])
    return b, sb, m


def _status_bar(d, dark, time_text="9:41"):
    fg = (255, 255, 255) if dark else (20, 22, 28)
    b, sb, m = _mock_fonts()
    d.text((92, 96), time_text, font=truetype(sb, 46), fill=fg, anchor="lm")
    x = MOCK_W - 96
    d.rounded_rectangle([x - 52, 82, x, 112], radius=8, outline=fg, width=4)
    d.rounded_rectangle([x - 48, 86, x - 14, 108], radius=5, fill=fg)
    for i, h in enumerate((14, 22, 30, 38)):
        bx = x - 100 - (3 - i) * 16
        d.rectangle([bx, 112 - h, bx + 10, 112], fill=fg)


def _card(d, box, radius=36, fill=(255, 255, 255), outline=None):
    d.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=2)


def mock_alarm():
    im = Image.new("RGB", (MOCK_W, MOCK_H), DARK_BG)
    d = ImageDraw.Draw(im, "RGBA")
    b, sb, m = _mock_fonts()
    _status_bar(d, dark=True, time_text="7:30")

    cx, cy, r = MOCK_W // 2, 900, 175
    d.ellipse([cx - r - 40, cy - r - 40, cx + r + 40, cy + r + 40], fill=ACCENT + (46,))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ACCENT)
    # bell
    d.pieslice([cx - 74, cy - 92, cx + 74, cy + 56], 180, 360, fill=(255, 255, 255))
    d.rectangle([cx - 74, cy - 18, cx + 74, cy + 30], fill=(255, 255, 255))
    d.rounded_rectangle([cx - 96, cy + 30, cx + 96, cy + 52], radius=11, fill=(255, 255, 255))
    d.ellipse([cx - 22, cy + 56, cx + 22, cy + 96], fill=(255, 255, 255))

    d.text((cx, 1290), "7:30 AM", font=truetype(m, 150), fill=(255, 255, 255), anchor="mm")
    d.text((cx, 1470), "Take your meds", font=truetype(b, 78), fill=(255, 255, 255), anchor="mm")
    d.text((cx, 1572), "It's time to take your blood pressure pill",
           font=truetype(m, 46), fill=(178, 186, 205), anchor="mm")
    d.text((cx, 1680), "Speaking out loud...", font=truetype(m, 44),
           fill=(150, 190, 250), anchor="mm")

    _card(d, [110, 2110, 560, 2270], radius=52, fill=(44, 51, 70))
    d.text((335, 2190), "Snooze 5 min", font=truetype(sb, 46), fill=(226, 231, 242), anchor="mm")
    _card(d, [619, 2110, 1069, 2270], radius=52, fill=ACCENT)
    d.text((844, 2190), "Dismiss", font=truetype(sb, 46), fill=(255, 255, 255), anchor="mm")
    return im


def mock_lockscreen():
    im = Image.new("RGB", (MOCK_W, MOCK_H), (13, 17, 30))
    d = ImageDraw.Draw(im, "RGBA")
    b, sb, m = _mock_fonts()
    # soft wallpaper glow
    glow = Image.new("RGB", (MOCK_W, MOCK_H), (13, 17, 30))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-320, 1500, 900, 2900], fill=(38, 58, 110))
    gd.ellipse([500, -300, 1600, 800], fill=(30, 44, 86))
    im = Image.blend(im, glow.filter(ImageFilter.GaussianBlur(180)), 0.85)
    d = ImageDraw.Draw(im, "RGBA")
    _status_bar(d, dark=True, time_text="7:30")

    d.text((MOCK_W // 2, 380), "Saturday, 12 April", font=truetype(m, 48),
           fill=(214, 221, 238), anchor="mm")
    d.text((MOCK_W // 2, 540), "7:30", font=truetype(m, 250), fill=(255, 255, 255), anchor="mm")

    box = [70, 900, MOCK_W - 70, 1210]
    d.rounded_rectangle(box, radius=54, fill=(255, 255, 255, 34))
    d.rounded_rectangle([116, 946, 196, 1026], radius=22, fill=ACCENT)
    d.text((156, 986), "R", font=truetype(b, 44), fill=(255, 255, 255), anchor="mm")
    d.text((226, 986), "REMI", font=truetype(sb, 36), fill=(212, 220, 240), anchor="lm")
    d.text((994, 986), "now", font=truetype(m, 36), fill=(178, 188, 212), anchor="rm")
    d.text((116, 1074), "Take your meds", font=truetype(b, 52), fill=(255, 255, 255), anchor="lm")
    d.text((116, 1146), "It's time to take your blood pressure pill",
           font=truetype(m, 42), fill=(216, 223, 240), anchor="lm")

    d.rounded_rectangle([70, 1250, MOCK_W - 70, 1470], radius=54, fill=(255, 255, 255, 22))
    d.text((116, 1320), "Speaking now", font=truetype(sb, 44), fill=(232, 238, 250), anchor="lm")
    for i in range(26):
        h = 18 + int(52 * abs(math.sin(i * 0.9)))
        x = 116 + i * 36
        d.rounded_rectangle([x, 1400 - h // 2, x + 16, 1400 + h // 2], radius=8, fill=ACCENT)
    return im


def _reminder_row(d, y, title, body, when, fonts, dark=False):
    b, sb, m = fonts
    _card(d, [70, y, MOCK_W - 70, y + 240], radius=44,
          fill=(255, 255, 255) if not dark else (33, 40, 58))
    fg = (22, 26, 36) if not dark else (255, 255, 255)
    d.text((118, y + 66), title, font=truetype(b, 54), fill=fg, anchor="lm")
    d.text((118, y + 132), body, font=truetype(m, 42), fill=(122, 130, 148), anchor="lm")
    d.ellipse([118, y + 178, 140, y + 200], fill=(52, 190, 120))
    d.text((160, y + 189), when, font=truetype(sb, 40), fill=(52, 168, 110), anchor="lm")
    d.ellipse([MOCK_W - 190, y + 96, MOCK_W - 126, y + 160], outline=(196, 202, 214), width=5)


def _list_header(d, fonts):
    b, sb, m = fonts
    d.text((70, 236), "Remi", font=truetype(b, 74), fill=(20, 24, 34), anchor="lm")
    d.rounded_rectangle([430, 198, 700, 274], radius=38, fill=ACCENT)
    d.text((565, 236), "Go Pro", font=truetype(sb, 40), fill=(255, 255, 255), anchor="mm")
    d.rounded_rectangle([70, 330, 250, 410], radius=40, fill=ACCENT)
    d.text((160, 370), "All", font=truetype(sb, 40), fill=(255, 255, 255), anchor="mm")
    d.rounded_rectangle([270, 330, 540, 410], radius=40, fill=(232, 234, 240))
    d.text((405, 370), "Completed", font=truetype(sb, 40), fill=(70, 76, 90), anchor="mm")
    d.text((70, 500), "Today", font=truetype(b, 56), fill=(20, 24, 34), anchor="lm")


def mock_today():
    im = Image.new("RGB", (MOCK_W, MOCK_H), LIGHT_BG)
    d = ImageDraw.Draw(im, "RGBA")
    fonts = _mock_fonts()
    _status_bar(d, dark=False)
    _list_header(d, fonts)
    _reminder_row(d, 570, "Take your meds", "Blood pressure pill", "Today at 7:30 AM", fonts)
    _reminder_row(d, 850, "Pick up the kids", "Soccer practice ends", "Today at 4:00 PM", fonts)
    _reminder_row(d, 1130, "Call Mum", "Just to check in", "Tomorrow at 6:00 PM", fonts)
    _reminder_row(d, 1410, "Bins out", "Green bin this week", "Sunday at 8:00 PM", fonts)

    cx, cy, r = MOCK_W // 2, 2270, 106
    d.ellipse([cx - r - 12, cy - r - 6, cx + r + 12, cy + r + 18], fill=(0, 0, 0, 26))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ACCENT)
    d.rounded_rectangle([cx - 22, cy - 56, cx + 22, cy + 6], radius=22, fill=(255, 255, 255))
    d.arc([cx - 46, cy - 34, cx + 46, cy + 40], 0, 180, fill=(255, 255, 255), width=10)
    d.rectangle([cx - 5, cy + 34, cx + 5, cy + 62], fill=(255, 255, 255))
    return im


def mock_voice():
    im = mock_today()
    d = ImageDraw.Draw(im, "RGBA")
    b, sb, m = _mock_fonts()
    d.rectangle([0, 0, MOCK_W, MOCK_H], fill=(10, 14, 24, 96))
    _card(d, [50, 1620, MOCK_W - 50, MOCK_H], radius=64, fill=(255, 255, 255))
    d.rounded_rectangle([MOCK_W // 2 - 70, 1668, MOCK_W // 2 + 70, 1682], radius=7,
                        fill=(214, 218, 228))
    d.text((MOCK_W // 2, 1770), "Listening", font=truetype(b, 62), fill=(20, 24, 34), anchor="mm")
    for i in range(34):
        h = 30 + int(150 * abs(math.sin(i * 0.72) * math.cos(i * 0.31)))
        x = 150 + i * 26
        d.rounded_rectangle([x, 1960 - h // 2, x + 13, 1960 + h // 2], radius=7, fill=ACCENT)
    d.rounded_rectangle([MOCK_W // 2 - 150, 2070, MOCK_W // 2 + 150, 2160], radius=45,
                        fill=(240, 242, 246))
    d.ellipse([MOCK_W // 2 - 112, 2100, MOCK_W // 2 - 82, 2130], fill=(232, 76, 76))
    d.text((MOCK_W // 2 + 22, 2115), "00:02", font=truetype(sb, 46), fill=(40, 46, 60), anchor="mm")

    cx, cy, r = MOCK_W // 2, 2340, 96
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ACCENT)
    d.rounded_rectangle([cx - 34, cy - 34, cx + 34, cy + 34], radius=12, fill=(255, 255, 255))
    d.ellipse([200 - 70, cy - 70, 200 + 70, cy + 70], fill=(238, 240, 246))
    d.ellipse([MOCK_W - 200 - 70, cy - 70, MOCK_W - 200 + 70, cy + 70], fill=(238, 240, 246))
    return im


def mock_schedule():
    im = Image.new("RGB", (MOCK_W, MOCK_H), LIGHT_BG)
    d = ImageDraw.Draw(im, "RGBA")
    b, sb, m = _mock_fonts()
    _status_bar(d, dark=False)
    d.text((70, 236), "New reminder", font=truetype(b, 68), fill=(20, 24, 34), anchor="lm")

    _card(d, [70, 330, MOCK_W - 70, 560], radius=44)
    d.text((118, 396), "Take your meds", font=truetype(b, 54), fill=(20, 24, 34), anchor="lm")
    d.text((118, 480), "It's time to take your blood pressure pill",
           font=truetype(m, 42), fill=(122, 130, 148), anchor="lm")

    rows = [
        ("Time", "7:30 AM"),
        ("Date", "Today"),
        ("Repeat", "Every day"),
        ("Interval", "Every 4 hours"),
        ("Snooze", "5 minutes"),
        ("Voice", "Warm - female"),
    ]
    y = 620
    for label, value in rows:
        _card(d, [70, y, MOCK_W - 70, y + 168], radius=44)
        d.rounded_rectangle([118, y + 44, 198, y + 124], radius=26, fill=(228, 238, 254))
        d.ellipse([138, y + 64, 178, y + 104], outline=ACCENT, width=6)
        d.text((236, y + 84), label, font=truetype(sb, 48), fill=(28, 33, 45), anchor="lm")
        d.rounded_rectangle([MOCK_W - 118 - 380, y + 40, MOCK_W - 118, y + 128],
                            radius=42, fill=(236, 240, 248))
        d.text((MOCK_W - 308, y + 84), value, font=truetype(sb, 42),
               fill=(52, 60, 78), anchor="mm")
        y += 196

    d.rounded_rectangle([70, MOCK_H - 300, MOCK_W - 70, MOCK_H - 140], radius=52, fill=ACCENT)
    d.text((MOCK_W // 2, MOCK_H - 220), "Save reminder", font=truetype(b, 54),
           fill=(255, 255, 255), anchor="mm")
    return im


MOCKS = {
    "01-alarm.png": mock_alarm,
    "02-lockscreen.png": mock_lockscreen,
    "03-voice.png": mock_voice,
    "04-schedule.png": mock_schedule,
    "05-today.png": mock_today,
}


def placeholder_for(source_name):
    fn = MOCKS.get(Path(source_name).name)
    return (fn or mock_today)()


# --------------------------------------------------------------------------
# cli
# --------------------------------------------------------------------------

def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", default=str(HERE / "shots.json"))
    ap.add_argument("--out", default=None, help="output directory (default: from config)")
    ap.add_argument("--raw", default=None, help="directory holding the raw screenshots")
    ap.add_argument("--preview", action="store_true",
                    help="synthesize placeholder screenshots instead of reading raw/")
    ap.add_argument("--only", action="append", default=None,
                    help="render only these shot ids (repeatable)")
    args = ap.parse_args(argv)

    cfg_path = Path(args.config).resolve()
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    base = cfg_path.parent

    raw_dir = Path(args.raw) if args.raw else base / cfg.get("raw_dir", "raw")
    if args.out:
        out_dir = Path(args.out)
    elif args.preview:
        out_dir = base / cfg.get("preview_dir", "out/preview")
    else:
        out_dir = base / cfg.get("out_dir", "out")
    out_dir.mkdir(parents=True, exist_ok=True)

    shots = cfg["shots"]
    if args.only:
        wanted = set(args.only)
        shots = [s for s in shots if s.get("id") in wanted or s.get("source") in wanted]
        if not shots:
            ap.error("no shots matched --only %s" % args.only)

    missing = []
    if not args.preview:
        for s in shots:
            p = Path(s["source"])
            if not p.is_absolute():
                p = raw_dir / p
            if not p.is_file():
                missing.append(str(p))
        if missing:
            print("Missing raw screenshots:", file=sys.stderr)
            for m in missing:
                print("  " + m, file=sys.stderr)
            print("\nDrop the captures in %s, or run with --preview to see the style "
                  "using synthesized placeholders." % raw_dir, file=sys.stderr)
            return 2

    for s in shots:
        if args.preview:
            screenshot = placeholder_for(s["source"])
        else:
            p = Path(s["source"])
            if not p.is_absolute():
                p = raw_dir / p
            screenshot = Image.open(p)

        img = render_shot(cfg, s, screenshot)
        name = s.get("id") or Path(s["source"]).stem
        dest = out_dir / ("%s.png" % name)
        save_png(img, dest)
        print("%-28s %dx%d  ->  %s" % (name, img.width, img.height, dest))

    print("\n%d image(s) written to %s" % (len(shots), out_dir.resolve()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
