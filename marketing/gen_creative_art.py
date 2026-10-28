"""Generate artwork for the iOS 27 creative assets (search results card + product page header).

Run through PTC so the OpenRouter key comes from the keyring:
    [CONCEPTS=concept-2,concept-3] [SIZE=2K] ptc run --timeout 900 marketing/gen_creative_art.py

Writes marketing/out/creative/raw/<concept>.png (16:9 master artwork, NO headline).
The headline is set afterwards by compose_creative.py (Montserrat, exact safe-zone
placement, easy pt-BR / es-MX swaps). Spend is logged to marketing/out/gen_costs.log.
"""
import base64, os, sys, time
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
OUT = HERE / "out" / "creative" / "raw"
OUT.mkdir(parents=True, exist_ok=True)
MODEL = os.environ.get("MODEL", "openai/gpt-5.4-image-2")
KEY = os.environ["OPENROUTER_API_KEY"]
COST_LOG = HERE / "out" / "gen_costs.log"

COMMON = """Create a WIDE LANDSCAPE 16:9 marketing banner artwork for "Remi", an iPhone voice-reminder app.
At the reminder time Remi rings like an alarm and SPEAKS the reminder out loud, even on the lock screen.
Hard rules:
- Absolutely NO headline, NO title, NO logo text and NO other words anywhere except the exact text listed below. Do not write "Remi" anywhere except the small app name on the phone screen. Never write "VoiceReminder".
- The LEFT part of the frame, from the left edge to about 52 percent of the width, must stay calm and simple (smooth background, soft, out of focus, no objects, no text): a headline will be added there later.
- Keep every important element (phone screen content and speech bubble) inside the band between 28 percent and 62 percent of the image height, and between 30 percent and 74 percent of the width. Things outside that band may be cropped.
- Modern iPhone with thin black bezel and Dynamic Island. Phone screen UI must match the reference image: black iOS lock-screen alarm, small alarm-clock icon + label above a huge white time, small app name "Remi" under the time, big rounded blue "Later" button, dark "slide to stop" slider.
- Speech bubble: white, rounded, soft shadow, with a small blue sound-wave icon on the left; text in a clean bold dark-navy sans-serif, large, perfectly spelled.
- Remi blue is #3970FF. Crisp, premium, uncluttered. No prices, no URLs, no other brands or store logos.
"""

CONCEPTS = {
    "concept-1": dict(
        refs=["renders/01-lockscreen.png"],
        prompt=COMMON + """
Scene (lock-screen moment, photographic): a softly lit, bright kitchen counter in the morning. An iPhone stands upright on a small stand on the counter, on the RIGHT side of the frame: phone centered at about 62 percent of the width, phone top at about 22 percent of the height, phone is large and its lower part may run off the bottom edge.
The phone shows the Remi alarm ringing: label "Take Your Medicine" with a pill emoji, time "8:00", app name "Remi", blue "Later" button.
Faint concentric sound-wave arcs radiate from the phone, suggesting it is speaking.
A large white speech bubble coming from the phone, placed overlapping the phone's upper-left corner area (between 40 and 58 percent of the width, between 30 and 45 percent of the height), reading exactly: "Take your medicine."
A small amber pill bottle and a glass of water sit next to the phone, softly out of focus.
The left half is a smooth, blurred, light warm-white kitchen background with no objects.""",
    ),
    # v2 of concept 1 (founder's pick): no bubble, no screen labels. compose_creative.py draws the
    # bubble, the alarm label and the button text, so they can be placed inside the header safe
    # area and localized without re-rendering.
    "concept-1b": dict(
        refs=["renders/01-lockscreen.png"],
        prompt="""Create a WIDE LANDSCAPE 16:9 photographic marketing banner artwork for an iPhone alarm-reminder app.
ABSOLUTELY NO WORDS OR LETTERS ANYWHERE in the image, except the digits "8:00" and the small word "Remi" on the phone screen.
Scene: a real home kitchen in warm golden morning light. Warm, slightly deep tones: honey-oak cabinets, warm cream/beige wall, a warm stone counter. Not white, not washed out: rich mid-tones with gentle depth, like a cozy lifestyle photo. Shallow depth of field, background softly blurred.
An iPhone stands upright on a small dark charging stand on the counter, facing the camera straight on (no tilt, no perspective). Exact placement: the phone's horizontal center at 64 percent of the image width; the phone's top edge at 23 percent of the image height; the phone is 13 percent of the image width wide; the phone's bottom sits in the stand at about 72 percent of the image height. The phone is fully visible.
Phone: modern iPhone, thin black bezel, Dynamic Island. Screen = black iOS alarm lock screen, matching the reference image layout but WITHOUT the label line: the upper part of the screen above the time is EMPTY black (leave room). Then a huge white time "8:00", the small grey word "Remi" under it, then lower down a big rounded Remi-blue (#3970FF) button with NO text on it, and below it a dark grey rounded slider pill with a white rounded-square knob on its left and NO text in it.
Faint white concentric sound-wave arcs radiate from both sides of the phone, suggesting it is speaking out loud.
A small amber pill bottle and a clear glass of water stand on the counter just to the right of the phone, slightly out of focus.
The whole LEFT part of the frame, from the left edge to 55 percent of the width, is a calm, blurred, evenly lit warm wall and counter with no objects (a headline and a speech bubble will be added there later). Keep that area a medium-light warm tone so dark navy text reads well on it.
No speech bubble. No text. No logos, no brands, no prices.""",
    ),
    # Round 3 (2026-10-27): nothing medical. Every word AND the time are drawn by compose_creative.py,
    # so the phone screens here are blank apart from the button and slider shapes.
    "phone-1c": dict(
        refs=["renders/01-lockscreen.png"],
        prompt="""Create a WIDE LANDSCAPE 16:9 photographic marketing banner artwork for an iPhone alarm-reminder app.
ABSOLUTELY NO WORDS, LETTERS OR DIGITS ANYWHERE in the image (not on the phone, not on objects).
Scene: a real home kitchen in warm golden late-afternoon light. Warm, slightly deep tones: honey-oak cabinets, warm cream/beige wall, a warm stone counter. Not white, not washed out: rich mid-tones with gentle depth, like a cozy lifestyle photo. Shallow depth of field, background softly blurred.
An iPhone stands upright on a small dark charging stand on the counter, facing the camera straight on (no tilt, no perspective). Exact placement: the phone's horizontal center at 64 percent of the image width; the phone's top edge at 23 percent of the image height; the phone is 13 percent of the image width wide; the phone's bottom sits in the stand at about 72 percent of the image height. The phone is fully visible.
Phone: modern iPhone, thin black bezel, Dynamic Island. Screen = plain black iOS alarm lock screen with NO text and NO digits at all: the whole upper two thirds of the screen is EMPTY black. In the lower part: a big rounded Remi-blue (#3970FF) button with NO text, and below it a dark grey rounded slider pill with a white rounded-square knob on its left and NO text.
Faint white concentric sound-wave arcs radiate from both sides of the phone, suggesting it is speaking out loud.
A ceramic coffee mug and a small potted herb stand on the counter just to the right of the phone, slightly out of focus. No medicine, no pill bottles.
The whole LEFT part of the frame, from the left edge to 55 percent of the width, is a calm, blurred, evenly lit warm wall and counter with no objects (a headline and a speech bubble will be added there later). Keep that area a medium-light warm tone so dark navy text reads well on it.
No speech bubble. No text. No logos, no brands, no prices.""",
    ),
    "woman-2": dict(
        refs=["renders/01-lockscreen.png"],
        prompt="""Create a WIDE LANDSCAPE 16:9 photographic marketing banner artwork for an iPhone voice-reminder app.
ABSOLUTELY NO WORDS, LETTERS OR DIGITS ANYWHERE in the image (not on the phones, not on objects, no speech bubbles).
Look: a real, warm home kitchen / living space in golden late-afternoon light. Warm, slightly deep tones: honey-oak cabinets, warm cream/beige wall, warm stone counter. Rich mid-tones, shallow depth of field, background softly blurred. Cozy, authentic lifestyle photo, not a studio, not a flat background.
Composition (follow the positions exactly, they matter for cropping; percentages are of the full image):
- The whole UPPER part of the frame, from the top edge down to 46 percent of the height and from 15 to 85 percent of the width, is ONLY a calm, softly blurred, evenly lit warm cream wall: no cabinets, no shelves, no lamps, no objects. A headline goes there later.
1) A friendly woman in her early 40s, natural look, casual sweater, seated at a kitchen counter, a medium shot from the chest up. She sits LEFT OF CENTER and LOW in the frame: the TOP of her hair is at 47 percent of the image height; her FACE (forehead to chin) spans from 51 to 66 percent of the image height and is centered at 40 percent of the image width. Nothing covers her face. Her body runs off the bottom edge. She holds her iPhone in one hand near her chin, screen facing her, speaking into it with a relaxed smile, looking slightly to the right.
2) To her RIGHT on the counter: a second iPhone standing upright on a small dark charging stand, facing the camera straight on. Phone center at 64 percent of the width, phone top edge at 54 percent of the height, phone 8 percent of the image width wide, its stand at about 88 percent of the height. Its screen is plain black with NO text and NO digits: the upper two thirds EMPTY black; in the lower part a big rounded blue (#3970FF) button with no text and below it a dark grey slider pill with a white knob, no text. Faint white concentric sound-wave arcs radiate from both sides of this phone (it is ringing and speaking).
3) Between her face and the counter phone (from 46 to 58 percent of the width, from 56 to 75 percent of the height) keep calm, blurred background: a speech bubble goes there later.
No medicine, no pills. No text, no logos, no brands, no prices.""",
    ),
    "concept-2": dict(
        refs=["renders/01-lockscreen.png", "renders/02-recording.png"],
        prompt=COMMON.replace(
            "- The LEFT part of the frame, from the left edge to about 52 percent of the width, must stay calm and simple (smooth background, soft, out of focus, no objects, no text): a headline will be added there later.\n",
            "- The TOP CENTER area (between 28 and 41 percent of the image height, between 28 and 72 percent of the width) must stay plain background with nothing in it: a headline will be added there later.\n",
        ) + """
Scene (speak, then it talks back), clean illustrated-photographic style on a soft light-blue gradient background. NOTHING may appear above 42 percent of the image height in the middle of the frame (between 26 and 74 percent of the width): that area is plain gradient only.
LEFT moment: a friendly adult woman around 45, shown from the chest up, positioned between 8 and 30 percent of the width, her head at about 45 to 60 percent of the height, holding her iPhone near her mouth and speaking into it. A white speech bubble with a small blue microphone icon, between 30 and 46 percent of the width and between 46 and 56 percent of the height, reading exactly: "Remind me at 8 to take my pills"
A small curved blue arrow with a tiny clock icon, between 40 and 50 percent of the width at about 62 percent of the height, pointing right.
RIGHT moment: an upright iPhone, phone centered at 56 percent of the width, phone TOP edge at 44 percent of the height (the phone is fairly small and its lower part runs off the bottom edge). It shows the Remi lock-screen alarm ringing: label "Take My Pills" with a pill emoji, time "8:00", app name "Remi". Sound-wave arcs radiate from it. A white speech bubble with a blue sound-wave icon, overlapping the phone's right edge, between 60 and 72 percent of the width and between 48 and 57 percent of the height, reading exactly: "Take your pills."
Nothing at all to the right of 74 percent of the width except the soft background. Keep the top-center area empty.""",
    ),
    "concept-3": dict(
        refs=["renders/01-lockscreen.png"],
        prompt=COMMON + """
Scene (bold brand card): a flat, saturated Remi-blue (#3970FF) background with a very subtle lighter radial glow behind the phone and a few faint concentric white sound-wave rings radiating from the phone. No photo, no room.
One iPhone, slightly tilted (about 6 degrees clockwise), on the right: phone centered at about 64 percent of the width, phone top at about 20 percent of the height, large, lower part running off the bottom edge.
The phone shows the Remi alarm ringing: label "Pay the Electric Bill" with a lightning-bolt emoji, time "9:00", app name "Remi", blue "Later" button.
A large white speech bubble overlapping the LOWER-LEFT part of the phone, over the blue Later button area: the bubble spans from 53 to 66 percent of the width and from 52 to 61 percent of the height, and must NOT extend left of 53 percent of the width. It reads exactly: "Pay the electric bill."
The left half of the frame is plain flat blue with nothing in it.""",
    ),
}


def data_url(p: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(p.read_bytes()).decode()


def generate(name: str, spec: dict) -> None:
    content = [{"type": "text", "text": spec["prompt"]}]
    for r in spec["refs"]:
        content.append({"type": "image_url", "image_url": {"url": data_url(HERE / r)}})
    body = {
        "model": MODEL,
        "messages": [{"role": "user", "content": content}],
        "modalities": ["image", "text"],
        "image_config": {"aspect_ratio": "16:9", "image_size": os.environ.get("SIZE", "2K")},
    }
    t = time.time()
    resp = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
        json=body,
        timeout=800,
    )
    if resp.status_code != 200:
        print(name, "HTTP", resp.status_code, resp.text[:500])
        return
    j = resp.json()
    msg = j["choices"][0]["message"]
    cost = (j.get("usage") or {}).get("cost") or 0
    with COST_LOG.open("a") as f:
        f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')}\tcreative\t{name}\t{cost}\n")
    imgs = msg.get("images") or []
    if not imgs:
        print(name, "no image; text:", (msg.get("content") or "")[:300], "cost", cost)
        return
    raw = base64.b64decode(imgs[0]["image_url"]["url"].split(",", 1)[1])
    suffix = os.environ.get("SUFFIX", "")
    (OUT / f"{name}{suffix}.png").write_bytes(raw)
    print(name, "ok", f"{time.time() - t:.0f}s", "cost", cost)


if __name__ == "__main__":
    names = [n for n in os.environ.get("CONCEPTS", "").split(",") if n] or sys.argv[1:] or list(CONCEPTS)
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(3) as ex:
        list(ex.map(lambda n: generate(n, CONCEPTS[n]), names))
