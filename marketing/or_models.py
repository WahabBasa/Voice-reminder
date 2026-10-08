import os, requests

key = os.environ["OPENROUTER_API_KEY"]
r = requests.get("https://openrouter.ai/api/v1/models", headers={"Authorization": f"Bearer {key}"}, timeout=60)
r.raise_for_status()
for m in r.json()["data"]:
    out = m.get("architecture", {}).get("output_modalities") or []
    if "image" in out:
        p = m.get("pricing", {})
        print(m["id"], "| in:", m.get("architecture", {}).get("input_modalities"), "| img $:", p.get("image"), "| completion $:", p.get("completion"))
