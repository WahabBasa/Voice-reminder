import os, json, requests
from pathlib import Path

KEY = os.environ["OPENROUTER_API_KEY"]
H = {"Authorization": f"Bearer {KEY}"}
OUT = Path(r"C:\Dev\VR\marketing\bakeoff\models.json")
r = requests.get("https://openrouter.ai/api/v1/images/models", headers=H, timeout=60)
print("status", r.status_code)
data = r.json().get("data", [])
print(len(data), "image models")
want = ["flare", "sunburst", "gpt-image-2", "gemini", "seedream", "qwen", "flux", "ideogram", "mai-image", "grok", "riverflow", "recraft", "hunyuan", "muse", "krea"]
res = {}
for m in data:
    mid = m.get("id") or m.get("slug")
    if not any(w in mid for w in want):
        continue
    try:
        e = requests.get(f"https://openrouter.ai/api/v1/images/models/{mid}/endpoints", headers=H, timeout=60).json()
    except Exception as ex:
        e = {"err": str(ex)}
    res[mid] = e
    eps = (e.get("data") or {}).get("endpoints") if isinstance(e.get("data"), dict) else e.get("endpoints") or e.get("data")
    print("==", mid)
    print(json.dumps(eps, default=str)[:900])
OUT.write_text(json.dumps(res, indent=1, default=str))
print("key", requests.get("https://openrouter.ai/api/v1/key", headers=H, timeout=30).json().get("data", {}).get("usage"))
