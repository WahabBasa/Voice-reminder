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


# ---------------------------------------------------------------------------
# Localized sets (LOCALE=pt-BR / LOCALE=es-MX). Same layout as the English
# pain-point set; headline, subtitle, speech bubbles and chips OUTSIDE the
# phone are localized, the app UI INSIDE the phone stays English.
# ---------------------------------------------------------------------------
LOC_RULES = {
    "pt-BR": "Brazilian Portuguese",
    "es-MX": "Latin American Spanish",
}


def _loc_style(lang: str) -> str:
    return STYLE + f"""
Language rules (critical):
- Every piece of text OUTSIDE the phone (headline, subtitle, speech bubbles, chips) is in {lang}, spelled EXACTLY as given below, character for character, with every accent mark (ã, é, ç, ñ, í, á, ê) rendered correctly. Do not translate, paraphrase or add words.
- Every piece of text INSIDE the phone screen stays in ENGLISH exactly as given (the app is in English).
- Do not add any text that is not listed here: no extra bubbles, captions, taglines or labels.
"""


def _lock(label: str, emoji: str, time_: str) -> str:
    return (f'Phone screen (all English): iOS lock-screen alarm ringing, like the reference: label "{label}" with a {emoji} emoji, '
            f'huge time "{time_}", app name "Remi", blue "Later" button, "slide to stop" slider. No other text on the phone.')


LOC = {
    "pt-BR": dict(
        bill=dict(h1="Nunca mais deixe", h2="o boleto vencer", blue="o boleto vencer", label="Pay Boleto", emoji="receipt (🧾)",
                  bubble="Pague o boleto.", chip="Vence hoje"),
        doctor=dict(h1="Nunca mais perca", h2="a consulta médica", blue="a consulta médica",
                    bubble="Sua consulta é daqui a 15 minutos.", chip="Aviso"),
        voice=dict(h1="Crie lembretes", h2="por comando de voz", blue="por comando de voz",
                   said="Me lembra dia 15 de pagar o boleto",
                   card_emoji="receipt", card="Pay Boleto"),
        rings=dict(h1="Sempre toca.", h2="Até no silencioso.", blue="Até no silencioso.", sub="Não para até você desligar",
                   chip="Modo silencioso", bubble="Busque as crianças", again="3:05 PM · de novo"),
        bday=dict(h1="Nunca mais esqueça", h2="o aniversário da mãe", blue="o aniversário da mãe",
                  bubble="Liga pra sua mãe. Hoje é aniversário dela."),
        sched=dict(any="Qualquer", rest="rotina", chips=("Todo dia", "Dias úteis", "A cada 2 horas")),
    ),
    "es-MX": dict(
        bill=dict(h1="Que no se te pase", h2="el recibo de la luz", blue="el recibo de la luz", label="Pay Electric Bill",
                  emoji="lightning-bolt (⚡)", bubble="Paga el recibo de la luz.", chip="Vence hoy"),
        doctor=dict(h1="Que no se te olvide", h2="la cita con el doctor", blue="la cita con el doctor",
                    bubble="Tu cita con el doctor es en 15 minutos.", chip="Aviso"),
        voice=dict(h1="Pon recordatorios", h2="con tu voz", blue="con tu voz",
                   said="Recuérdame el 15 pagar el recibo de la luz"),
        rings=dict(h1="Siempre suena.", h2="Aunque esté en silencio.", blue="Aunque esté en silencio.",
                   sub="Sigue sonando hasta que la apagues", chip="Modo silencio", bubble="Recoge a los niños",
                   again="3:05 PM · otra vez"),
        bday=dict(h1="Este año sí te acuerdas", h2="del cumpleaños de tu mamá", blue="del cumpleaños de tu mamá",
                  bubble="Háblale a tu mamá. Hoy es su cumpleaños."),
        sched=dict(any="Cualquier", rest="horario", chips=("Todos los días", "Entre semana", "Cada 2 horas")),
    ),
}


def _two_line(h1: str, h2: str, blue: str) -> str:
    return (f'Headline (exactly two lines, centered): line 1 "{h1}" in navy; line 2 "{h2}" with "{blue}" in Remi blue'
            + ("" if blue == h2 else " and the rest navy") + ". Nothing else in the headline.")


def localized_shots(locale: str) -> dict:
    t = LOC[locale]
    st = _loc_style(LOC_RULES[locale])
    b, d, v, r, k, s = t["bill"], t["doctor"], t["voice"], t["rings"], t["bday"], t["sched"]
    deco = "receipt" if locale == "pt-BR" else "lightning-bolt"
    return {
        "05-bill": dict(refs=["renders/01-lockscreen.png"], prompt=st + f"""
Pain-point screenshot. {_two_line(b['h1'], b['h2'], b['blue'])}
{_lock(b['label'], b['emoji'], '9:00')}
One large speech bubble beside the phone (not covering the time digits) with a blue sound-wave icon: "{b['bubble']}"
A small white chip near the phone with a calendar icon: "{b['chip']}".
Small {deco} emoji bubble top-left as decoration."""),
        "06-doctor": dict(refs=["renders/01-lockscreen.png"], prompt=st + f"""
Pain-point screenshot. {_two_line(d['h1'], d['h2'], d['blue'])}
{_lock('Doctor Appointment', 'stethoscope', '10:15')}
One large speech bubble beside the phone (not covering the time digits) with a blue sound-wave icon: "{d['bubble']}"
A small white chip near the phone with a bell icon: "{d['chip']}"."""),
        "02-voice": dict(refs=["renders/02-recording.png"], prompt=st + f"""
{_two_line(v['h1'], v['h2'], v['blue'])}
Phone screen (all English): the app's Today list (title "Today", date "Monday, 12 Oct") with these items, each with its emoji tile: "Take Morning Pills / 8:00 am · Daily" (pill emoji), "Dentist Appointment / 3:00 pm" (tooth emoji), "Pick Up Kids / 3:00 pm · Weekdays" (school-bus emoji). A "New Recording" sheet open at the bottom showing "Listening..." with a waveform, a red-dot timer "00:03" and a blue stop button, like the reference.
Speech bubble on the left with a blue microphone icon (what the user says, in {LOC_RULES[locale]}): "{v['said']}".
Result card on the right with a {v.get('card_emoji', 'lightning-bolt')} emoji tile (English, it is app UI): "{v.get('card', 'Pay Electricity Bill')}" / "Thu 15 Oct · 9:00 am"."""),
        "03-rings": dict(refs=["renders/01-lockscreen.png", "renders/03-editsheet.png"], prompt=st + f"""
{_two_line(r['h1'], r['h2'], r['blue'])}
Small subtitle under the headline in a clean medium-weight sans, slate grey but clearly readable (not tiny): "{r['sub']}".
Add a small white chip near the phone with a muted-speaker icon crossed out and the text "{r['chip']}".
{_lock('Pick Up Kids', 'school-bus', '3:05')}
Two stacked speech bubbles beside the phone, each with a blue sound-wave icon: top "{r['bubble']}" with small grey text "3:00 PM", bottom "{r['bubble']}" with small grey text "{r['again']}". It shows the alarm repeating until stopped."""),
        "07-birthday": dict(refs=["renders/01-lockscreen.png"], prompt=st + f"""
Pain-point screenshot. {_two_line(k['h1'], k['h2'], k['blue'])}
{_lock('Call Mom', 'birthday-cake', '9:00')}
One large speech bubble beside the phone (not covering the time digits) with a blue sound-wave icon: "{k['bubble']}"
Small birthday-cake emoji bubble top-left as decoration."""),
        "04-schedule": dict(refs=["renders/04-calendar.png"], prompt=st + f"""
Headline (one line, centered): "{s['any']} {s['rest']}" with "{s['any']}" in Remi blue and "{s['rest']}" navy.
Phone screen (all English): the app's week calendar view like the reference: "Monday", "OCT 2026", a week strip Sun 11 to Sat 17 with Mon 12 selected, and reminders each with an emoji tile: "Take Morning Pills / 8:00 am · Daily" (pill), "Drink Water / Every 2 hours" (water drop), "Pick Up Kids / 3:00 pm · Weekdays" (school bus), "Mom's Birthday / Fri 16 Oct" (birthday cake). Bottom tab bar with a blue mic button.
Three small white pill-shaped chips with a blue repeat icon, floating around the phone: "{s['chips'][0]}", "{s['chips'][1]}", "{s['chips'][2]}".
No speech bubbles and no other text anywhere: only the headline, the phone, and those three chips."""),
    }


LOCALE = os.environ.get("LOCALE", "")
if LOCALE:
    SHOTS = localized_shots(LOCALE)
    OUT = HERE / f"renders_{LOCALE}"
    OUT.mkdir(exist_ok=True)
COST_LOG = HERE / "out" / "gen_costs.log"
CAP = float(os.environ.get("CAP", "0") or 0)  # total $ across COST_LOG; 0 = no cap


def spent() -> float:
    if not COST_LOG.exists():
        return 0.0
    tot = 0.0
    for line in COST_LOG.read_text().splitlines():
        try:
            tot += float(line.split("\t")[3])
        except (IndexError, ValueError):
            pass
    return tot


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
        print(slot, "no image returned; text:", (msg.get("content") or "")[:300], "cost", (j.get("usage") or {}).get("cost"))
        with COST_LOG.open("a") as f:
            f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')}\t{LOCALE or 'en'}\t{slot}-noimage\t{(j.get('usage') or {}).get('cost') or 0}\n")
        return
    url = imgs[0]["image_url"]["url"]
    raw = base64.b64decode(url.split(",", 1)[1])
    (OUT / f"{slot}.png").write_bytes(raw)
    cost = (j.get("usage") or {}).get("cost")
    print(slot, "ok", f"{time.time() - t:.0f}s", "cost", cost)
    COST_LOG.parent.mkdir(parents=True, exist_ok=True)
    with COST_LOG.open("a") as f:
        f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')}\t{LOCALE or 'en'}\t{slot}\t{cost or 0}\n")


if __name__ == "__main__":
    slots = [s for s in os.environ.get("SLOTS", "").split(",") if s] or sys.argv[1:] or list(SHOTS)
    if CAP and spent() + 0.30 * len(slots) > CAP:
        sys.exit(f"cap: spent {spent():.2f} + {len(slots)} shots would exceed {CAP}")
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(int(os.environ.get("PAR", "1"))) as ex:
        list(ex.map(lambda s: generate(s, SHOTS[s]), slots))
    print("total logged spend", round(spent(), 4))
