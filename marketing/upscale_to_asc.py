#!/usr/bin/env python3
"""Upscale approved AI screenshot renders to exact App Store Connect sizes.

Input:  marketing/renders/*.png  (the approved GPT masters, any resolution
        with the 1290:2796 aspect or close to it)
Output: marketing/out/asc/6.7/<name>_1290x2796.png
        marketing/out/asc/6.5/<name>_1242x2688.png

Scale-to-fill + center-crop, Lanczos. The 6.5" size has a slightly different
aspect, so it loses a few edge pixels to the crop — by design.

Usage:
    python upscale_to_asc.py            # converts everything in renders/
    python upscale_to_asc.py 01-lockscreen.png   # just one file
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
SRC_DIR = HERE / "renders"
OUT_DIR = HERE / "out" / "asc"

SIZES = {
    "6.7": (1290, 2796),
    "6.5": (1242, 2688),
}


def convert(src: Path) -> None:
    img = Image.open(src).convert("RGB")
    for label, (w, h) in SIZES.items():
        scale = max(w / img.width, h / img.height)
        rw, rh = round(img.width * scale), round(img.height * scale)
        resized = img.resize((rw, rh), Image.LANCZOS)
        left = (rw - w) // 2
        top = (rh - h) // 2
        out = resized.crop((left, top, left + w, top + h))
        dest = OUT_DIR / label / f"{src.stem}_{w}x{h}.png"
        dest.parent.mkdir(parents=True, exist_ok=True)
        out.save(dest, "PNG")
        print(f"{src.name} -> {dest.relative_to(HERE)}")


def main() -> None:
    if len(sys.argv) > 1:
        sources = [SRC_DIR / name for name in sys.argv[1:]]
        missing = [s for s in sources if not s.exists()]
        if missing:
            sys.exit(f"not found: {', '.join(str(m) for m in missing)}")
    else:
        sources = sorted(SRC_DIR.glob("*.png"))
        if not sources:
            sys.exit(f"no PNGs in {SRC_DIR}")
    for src in sources:
        convert(src)


if __name__ == "__main__":
    main()
