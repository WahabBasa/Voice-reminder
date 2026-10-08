#!/usr/bin/env python3
"""Replace the headline block on the existing store renders with short, bold copy.

Keeps each render's phone + bubbles untouched; wipes everything above the phone
(old serif headline, grey subtitle, header emoji) by repainting the background
gradient row by row, then draws the new 1-2 line headline.

    python retitle.py            # renders/ -> renders_v2/ + out/preview/v2_sheet.png
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
SRC = HERE / "renders"
DST = HERE / "renders_v2"
FONT = "C:/Windows/Fonts/Montserrat-ExtraBold.ttf"
INK = (14, 23, 48)
ACCENT = (57, 112, 255)

# file, rows to clear (phone top - margin), headline lines as [(text, accent?), ...]
SHOTS = [
    ("01-lockscreen.png", 560, [[("Speaks your", False)], [("reminder", True)]]),
    ("02-recording.png", 488, [[("Just ", False), ("say it", True)]]),
    ("03-editsheet.png", 536, [[("Rings until", False)], [("you're done", True)]]),
    ("04-calendar.png", 505, [[("Any ", True), ("schedule", False)]]),
    ("05-today.png", 516, [[("No ", True), ("ads", False)]]),
]


def repaint_background(img: Image.Image, clear_to: int) -> None:
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    w = a.shape[1]
    edge = np.concatenate([a[:clear_to, 0:6], a[:clear_to, w - 6:w]], axis=1)
    row = np.median(edge, axis=1)  # (rows, 3)
    # smooth the row colours so stray pixels at the edge don't streak
    k = 15
    pad = np.pad(row, ((k, k), (0, 0)), mode="edge")
    smooth = np.stack([np.convolve(pad[:, c], np.ones(2 * k + 1) / (2 * k + 1), mode="valid") for c in range(3)], axis=1)
    block = np.repeat(smooth[:, None, :], w, axis=1).clip(0, 255).astype(np.uint8)
    img.paste(Image.fromarray(block, "RGB"), (0, 0))


def draw_headline(img: Image.Image, lines, top: int, bottom: int) -> None:
    d = ImageDraw.Draw(img)
    w = img.width
    size = 104 if len(lines) == 1 else 92
    font = ImageFont.truetype(FONT, size)
    while True:  # shrink until the widest line fits with margins
        widths = [sum(d.textlength(t, font=font) for t, _ in ln) for ln in lines]
        if max(widths) <= w * 0.86:
            break
        size -= 4
        font = ImageFont.truetype(FONT, size)
    line_h = int(size * 1.12)
    block_h = line_h * len(lines)
    y = top + (bottom - top - block_h) // 2
    for ln, lw in zip(lines, widths):
        x = (w - lw) / 2
        for text, accent in ln:
            d.text((x, y), text, font=font, fill=ACCENT if accent else INK)
            x += d.textlength(text, font=font)
        y += line_h


def main() -> None:
    DST.mkdir(exist_ok=True)
    outs = []
    for name, clear_to, lines in SHOTS:
        img = Image.open(SRC / name).convert("RGB")
        repaint_background(img, clear_to)
        draw_headline(img, lines, 40, clear_to - 10)
        img.save(DST / name)
        outs.append(img)
    # contact sheet for review
    gap = 30
    sheet = Image.new("RGB", (sum(i.width for i in outs) + gap * (len(outs) + 1), outs[0].height + 2 * gap), (245, 246, 250))
    x = gap
    for i in outs:
        sheet.paste(i, (x, gap))
        x += i.width + gap
    (HERE / "out" / "preview").mkdir(parents=True, exist_ok=True)
    sheet.save(HERE / "out" / "preview" / "v2_sheet.png")
    print("wrote", DST, "and out/preview/v2_sheet.png")


if __name__ == "__main__":
    main()
