"""Side-by-side sheet: baseline (GPT-5.4 Image 2) vs each bake-off config."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
COLS = [
    ("baseline", "GPT-5.4 Image 2 (current)", "$0.29 / 1440x2560"),
    ("flare-med", "GPT Image 2.5 Flare medium", "$0.023 / 864x1536"),
    ("flare-high", "GPT Image 2.5 Flare high", "$0.047 / 864x1536"),
    ("nb21-2k", "Nano Banana 2.1 2K", "$0.057 / 1536x2752"),
    ("seedream5flash-2k", "Seedream 5 Flash 2K", "$0.018 / 1152x2048"),
    ("qwen3-2k", "Qwen Image 3 2K", "$0.033 / 1152x2048"),
]
SHOTS = [("es-voice", "es-MX voice"), ("pt-bday", "pt-BR birthday")]
TW, TH, HEAD, GAP = 450, 800, 90, 14
try:
    fb, fs = ImageFont.truetype("arialbd.ttf", 22), ImageFont.truetype("arial.ttf", 19)
except OSError:
    fb = fs = ImageFont.load_default()
W = GAP + len(COLS) * (TW + GAP)
H = HEAD + len(SHOTS) * (TH + GAP + 30)
sheet = Image.new("RGB", (W, H), (245, 246, 248))
d = ImageDraw.Draw(sheet)
for i, (slug, name, price) in enumerate(COLS):
    x = GAP + i * (TW + GAP)
    d.text((x, 14), name, fill=(15, 23, 48), font=fb)
    d.text((x, 46), price, fill=(80, 90, 110), font=fs)
for r, (shot, label) in enumerate(SHOTS):
    y0 = HEAD + r * (TH + GAP + 30)
    d.text((GAP, y0), label, fill=(57, 112, 255), font=fb)
    for i, (slug, _, _) in enumerate(COLS):
        p = HERE / slug / f"{shot}.png"
        if not p.exists():
            continue
        im = Image.open(p).convert("RGB")
        im.thumbnail((TW, TH), Image.LANCZOS)
        x = GAP + i * (TW + GAP) + (TW - im.width) // 2
        sheet.paste(im, (x, y0 + 30))
sheet.save(HERE / "compare.png")
print(sheet.size)
