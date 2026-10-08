"""Generate App Store screenshot drafts with OpenRouter (GPT-5.4 Image 2).

Run through PTC so the key comes from the keyring:  ptc run gen_or_shots.py [slot ...]
Writes renders_v3/<slot>.png
"""
import base64, os, sys, time
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
OUT = HERE / "renders_v3"
OUT.mkdir(exist_ok=True)
MODEL = "openai/gpt-5.4-image-2"
KEY = os.environ["OPENROUTER_API_KEY"]

STYLE = """Design a TALL PORTRAIT iPhone App Store screenshot (portrait orientation, 1024x1536, never square) for the app "Remi", a voice reminder app. The whole phone must be visible from top to bottom with background margin around it; never crop the phone.
Style rules (match across the whole set):
- Soft light-blue vertical gradient background, airy and clean. No clutter: at most two small decorative emoji bubbles, kept to the edges.
- Headline at the top in a heavy, very bold geometric sans-serif (Montserrat ExtraBold look), large, centered, dark navy #0E1730, with the key words in Remi blue #3970FF. The headline must be crisp and perfectly spelled, readable at thumbnail size. No subtitle unless stated.
- Below the headline, one modern iPhone (thin black bezel, Dynamic Island) showing the app screen. Keep the app UI faithful to the reference image provided: same layout, fonts, colors, list items. Do not invent extra buttons.
- At most one or two white speech-bubble callouts with soft shadow, overlapping the phone edge, with a small blue sound-wave icon. Callout text in an elegant serif, dark navy, perfectly spelled.
- Never show the words "VoiceReminder"; the app name is "Remi".
"""

SHOTS = {
    "01-says-time": dict(
        refs=["renders/01-lockscreen.png"],
        prompt=STYLE + """
Headline (two lines): "Says the time." (navy) / "And what to do." with "what to do" in blue.
Phone screen: iOS lock-screen alarm ringing, like the reference: alarm label "Take Morning Pills" with an alarm-clock icon, huge time "8:00", small app name "Remi" under the time, a big blue "Later" button and a "slide to stop" slider.
One large speech bubble beside the phone (NOT covering the time digits) with a blue sound-wave icon: "It's 8:00. Take your morning pills."
Small pill emoji bubble top-left as decoration.""",
    ),
    "02-voice": dict(
        refs=["renders/02-recording.png"],
        prompt=STYLE + """
Headline (two lines): "Set reminders" (navy) / "with voice commands" with "voice commands" in blue.
Phone screen: the app's Today list (title "Today", date "Monday, 12 Oct") with these items, each with its emoji tile: "Take Morning Pills / 8:00 am · Daily" (pill emoji), "Dentist Appointment / 3:00 pm" (tooth emoji), "Pick Up Kids / 3:00 pm · Weekdays" (school-bus emoji). A "New Recording" sheet open at the bottom showing "Listening..." with a waveform, a red-dot timer "00:03" and a blue stop button, like the reference.
Speech bubble on the left with a blue microphone icon: "Remind me on the 15th to pay the electricity bill".
Result card on the right with a lightning-bolt emoji tile: "Pay Electricity Bill" / "Thu 15 Oct · 9:00 am".""",
    ),
    "03-rings": dict(
        refs=["renders/01-lockscreen.png", "renders/03-editsheet.png"],
        prompt=STYLE + """
Headline (two lines): "Always rings." (navy) / "Even on silent." with "Even on silent" in blue.
Small subtitle under the headline in a clean medium-weight sans, slate grey but clearly readable (not tiny): "Keeps going until you turn it off".
Add a small white chip near the phone with a muted-speaker icon crossed out and the text "Silent mode".
Phone screen: iOS lock-screen alarm ringing (like the first reference): label "Pick Up Kids" with a school-bus emoji, time "3:05", app name "Remi", blue "Later" button, "slide to stop" slider.
Two stacked speech bubbles beside the phone, each with a blue sound-wave icon: top "Pick up the kids" with small grey text "3:00 PM", bottom "Pick up the kids" with small grey text "3:05 PM · again". It shows the alarm repeating until stopped.""",
    ),
    "04-schedule": dict(
        refs=["renders/04-calendar.png"],
        prompt=STYLE + """
Headline (one line): "Any schedule" with "Any" in blue and "schedule" navy.
Phone screen: the app's week calendar view like the reference: "Monday", "OCT 2026", a week strip Sun 11 to Sat 17 with Mon 12 selected, and reminders each with an emoji tile: "Take Morning Pills / 8:00 am · Daily" (pill), "Drink Water / Every 2 hours" (water drop), "Pick Up Kids / 3:00 pm · Weekdays" (school bus), "Mom's Birthday / Fri 16 Oct" (birthday cake). Bottom tab bar with a blue mic button.
Three small white pill-shaped chips with a blue repeat icon, floating around the phone: "Every day", "Weekdays", "Every 2 hours".
No speech bubbles and no other text anywhere: only the headline, the phone, and those three chips.""",
    ),
    "05-bill": dict(
        refs=["renders/01-lockscreen.png"],
        prompt=STYLE + """
Pain-point screenshot. Headline (two lines): "Never forget" (navy) / "the water bill again" with "water bill" in blue.
Phone screen: iOS lock-screen alarm ringing, like the reference: label "Pay Water Bill" with a water-drop emoji, huge time "9:00", app name "Remi", blue "Later" button, "slide to stop" slider.
One large speech bubble beside the phone with a blue sound-wave icon: "Pay the water bill."
A small white chip near the phone with a calendar icon: "Due today".""",
    ),
    "06-doctor": dict(
        refs=["renders/01-lockscreen.png"],
        prompt=STYLE + """
Pain-point screenshot. Headline (two lines): "Never miss" (navy) / "the doctor again" with "the doctor" in blue.
Phone screen: iOS lock-screen alarm ringing, like the reference: label "Doctor Appointment" with a stethoscope emoji, huge time "10:15", app name "Remi", blue "Later" button, "slide to stop" slider.
One large speech bubble beside the phone with a blue sound-wave icon: "Your doctor's appointment is in 15 minutes."
A small white chip near the phone with a bell icon: "Heads-up".""",
    ),
    "07-birthday": dict(
        refs=["renders/01-lockscreen.png"],
        prompt=STYLE + """
Pain-point screenshot. Headline (two lines): "Never forget" (navy) / "Mom's birthday" with "Mom's birthday" in blue.
Phone screen: iOS lock-screen alarm ringing, like the reference: label "Call Mom" with a birthday-cake emoji, huge time "9:00", app name "Remi", blue "Later" button, "slide to stop" slider.
One large speech bubble beside the phone with a blue sound-wave icon: "Call Mom. It's her birthday."
Small birthday-cake emoji bubble top-left as decoration.""",
    ),
}


def data_url(p: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(p.read_bytes()).decode()


def generate(slot: str, spec: dict) -> None:
    content = [{"type": "text", "text": spec["prompt"]}]
    for r in spec["refs"]:
        content.append({"type": "image_url", "image_url": {"url": data_url(HERE / r)}})
    body = {
        "model": MODEL,
        "messages": [{"role": "user", "content": content}],
        "modalities": ["image", "text"],
        "image_config": {"aspect_ratio": os.environ.get("ASPECT", "9:16"), "image_size": os.environ.get("SIZE", "4K")},
    }
    t = time.time()
    resp = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
        json=body,
        timeout=600,
    )
    if resp.status_code != 200:
        print(slot, "HTTP", resp.status_code, resp.text[:500])
        return
    j = resp.json()
    msg = j["choices"][0]["message"]
    imgs = msg.get("images") or []
    if not imgs:
        print(slot, "no image returned; text:", (msg.get("content") or "")[:300])
        return
    url = imgs[0]["image_url"]["url"]
    raw = base64.b64decode(url.split(",", 1)[1])
    (OUT / f"{slot}.png").write_bytes(raw)
    cost = (j.get("usage") or {}).get("cost")
    print(slot, "ok", f"{time.time() - t:.0f}s", "cost", cost)


if __name__ == "__main__":
    slots = [s for s in os.environ.get("SLOTS", "").split(",") if s] or sys.argv[1:] or list(SHOTS)
    for s in slots:
        generate(s, SHOTS[s])
