#!/usr/bin/env python3
"""Export a 6-shot pain-point set to App Store 6.7" size (1290x2796), the way
out/asc_ppo/ was made: fit the 9:16 GPT render to 1290 wide (Lanczos), place it
201 px from the top, and extend the background by repeating the edge rows (with
a little noise against banding).

    LOCALE=pt-BR python export_ppo.py   # renders_pt-BR/ -> out/asc_pt-BR/01..06.png + sheet.png
    python export_ppo.py                # renders_v3/   -> out/asc_ppo/
"""
import os
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
W, H, TOP = 1290, 2796, 201
ORDER = ["05-bill", "06-doctor", "02-voice", "03-rings", "07-birthday", "04-schedule"]

loc = os.environ.get("LOCALE", "")
src = HERE / (f"renders_{loc}" if loc else "renders_v3")
dst = HERE / "out" / (f"asc_{loc}" if loc else "asc_ppo")
dst.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(0)


def export(p: Path) -> Image.Image:
    img = Image.open(p).convert("RGB")
    h = round(img.height * W / img.width)
    body = np.asarray(img.resize((W, h), Image.LANCZOS)).astype(np.float32)
    top_row, bot_row = body[:8].mean(axis=0), body[-8:].mean(axis=0)
    bottom = H - TOP - h
    if bottom < 0:
        raise SystemExit(f"{p.name}: render too tall ({h}px) for the canvas")
    pad_t = np.repeat(top_row[None], TOP, axis=0) + rng.normal(0, 0.6, (TOP, W, 3))
    pad_b = np.repeat(bot_row[None], bottom, axis=0) + rng.normal(0, 0.6, (bottom, W, 3))
    out = np.concatenate([pad_t, body, pad_b]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGB")


outs = []
for i, slot in enumerate(ORDER, 1):
    im = export(src / f"{slot}.png")
    im.save(dst / f"{i:02d}.png")
    outs.append(im)
    print(f"{slot} -> {dst.name}/{i:02d}.png {im.size}")

thumbs = [o.resize((320, 694), Image.LANCZOS) for o in outs]
gap = 12
sheet = Image.new("RGB", (len(thumbs) * (320 + gap) + gap, 694 + 2 * gap), (40, 40, 40))
for i, t in enumerate(thumbs):
    sheet.paste(t, (gap + i * (320 + gap), gap))
sheet.save(dst / "sheet.png")
print("sheet", dst / "sheet.png")
