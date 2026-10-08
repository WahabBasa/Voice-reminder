"""Cheap-model bake-off for Remi App Store screenshots.

Prompts + reference images come from gen_snapshot.py (a frozen copy of
../gen_or_shots.py, 2026-10-08) so the comparison uses exactly the production
prompt. Run via PTC (key from keyring):  ptc run --timeout 900 bakeoff/bakeoff.py
Env: CONFIGS=flare-med,nb21  SHOTS=es-voice,pt-bday   (defaults: all)
Logs every call to calls.json; hard cap $1.50 across the log.
"""
import base64, io, json, os, sys, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
from PIL import Image

HERE = Path(__file__).resolve().parent
MK = HERE.parent
sys.path.insert(0, str(HERE))
os.environ.pop("LOCALE", None)
import gen_snapshot as g  # noqa: E402

KEY = os.environ["OPENROUTER_API_KEY"]
LOG = HERE / "calls.json"
CAP = 1.50
EST = 0.12  # worst-case per call, for the pre-flight cap check

SHOTS = {
    "es-voice": g.localized_shots("es-MX")["02-voice"],
    "pt-bday": g.localized_shots("pt-BR")["07-birthday"],
}

CONFIGS = {
    "flare-med": dict(model="openai/gpt-image-2.5-flare", extra=dict(aspect_ratio="9:16", quality="medium", output_format="png")),
    "flare-high": dict(model="openai/gpt-image-2.5-flare", extra=dict(aspect_ratio="9:16", quality="high", output_format="png")),
    "nb21-2k": dict(model="google/gemini-nano-banana-2.1", extra=dict(aspect_ratio="9:16", resolution="2K")),
    "seedream5flash-2k": dict(model="bytedance-seed/seedream-5-0-flash", extra=dict(aspect_ratio="9:16", resolution="2K")),
    "qwen3-2k": dict(model="qwen/qwen-image-3", extra=dict(aspect_ratio="9:16", resolution="2K")),
}

H = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}


def load():
    return json.loads(LOG.read_text()) if LOG.exists() else []


def data_url(p: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(p.read_bytes()).decode()


def run(cfg: str, shot: str) -> dict:
    c, s = CONFIGS[cfg], SHOTS[shot]
    body = dict(model=c["model"], prompt=s["prompt"], n=1, **c["extra"])
    body["input_references"] = [{"type": "image_url", "image_url": {"url": data_url(MK / r)}} for r in s["refs"]]
    t = time.time()
    try:
        r = requests.post("https://openrouter.ai/api/v1/images", headers=H, json=body, timeout=600)
    except Exception as ex:
        return dict(cfg=cfg, shot=shot, ok=False, cost=0, err=str(ex)[:300], secs=round(time.time() - t))
    dt = round(time.time() - t)
    if r.status_code != 200:
        return dict(cfg=cfg, shot=shot, ok=False, status=r.status_code, cost=0, err=r.text[:500], secs=dt)
    j = r.json()
    cost = (j.get("usage") or {}).get("cost")
    try:
        im = Image.open(io.BytesIO(base64.b64decode(j["data"][0]["b64_json"])))
    except Exception as ex:
        return dict(cfg=cfg, shot=shot, ok=False, cost=cost or 0, err=f"decode: {ex}; {str(j)[:300]}", secs=dt)
    (HERE / cfg).mkdir(exist_ok=True)
    im.save(HERE / cfg / f"{shot}.png")
    return dict(cfg=cfg, shot=shot, ok=True, cost=cost, size=list(im.size), secs=dt, usage=j.get("usage"))


if __name__ == "__main__":
    cfgs = [x for x in os.environ.get("CONFIGS", "").split(",") if x] or list(CONFIGS)
    shots = [x for x in os.environ.get("SHOTS", "").split(",") if x] or list(SHOTS)
    jobs = [(c, s) for c in cfgs for s in shots]
    spent = sum(x.get("cost") or 0 for x in load())
    if spent + EST * len(jobs) > CAP:
        sys.exit(f"cap: spent {spent:.4f} + {len(jobs)} jobs x {EST} > {CAP}")
    with ThreadPoolExecutor(6) as ex:
        res = list(ex.map(lambda a: run(*a), jobs))
    log = load() + [dict(r, ts=time.strftime("%H:%M:%S")) for r in res]
    LOG.write_text(json.dumps(log, indent=1))
    for r in res:
        print(r["cfg"], r["shot"], "OK" if r["ok"] else "FAIL", "cost", r.get("cost"), r.get("size"), f'{r.get("secs")}s', r.get("err", "")[:300])
    print("total logged spend", round(sum(x.get("cost") or 0 for x in log), 4))
    u = requests.get("https://openrouter.ai/api/v1/key", headers=H, timeout=30).json().get("data", {})
    print("key usage", u.get("usage"), "limit", u.get("limit"))
