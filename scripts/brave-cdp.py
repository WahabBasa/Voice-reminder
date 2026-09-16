"""Minimal Chrome DevTools Protocol helper for driving an existing Brave tab without focusing it.

Usage (from bash):
  python outputs/jobs/cdp.py tabs
  python outputs/jobs/cdp.py eval <tab-substring> "<js expression>"
  python outputs/jobs/cdp.py shot <tab-substring> <out.png>
  python outputs/jobs/cdp.py nav  <tab-substring> <url>
"""
import sys, json, base64, itertools, requests, websocket

PORT = 9222
_id = itertools.count(1)


def tabs():
    return [t for t in requests.get(f"http://localhost:{PORT}/json", timeout=5).json() if t["type"] == "page"]


def find_tab(sub):
    for t in tabs():
        if sub.lower() in (t["url"] + " " + t["title"]).lower():
            return t
    raise SystemExit(f"no tab matching {sub!r}")


def call(ws, method, **params):
    i = next(_id)
    ws.send(json.dumps({"id": i, "method": method, "params": params}))
    while True:
        msg = json.loads(ws.recv())
        if msg.get("id") == i:
            if "error" in msg:
                raise RuntimeError(msg["error"])
            return msg.get("result", {})


def connect(sub):
    t = find_tab(sub)
    ws = websocket.create_connection(t["webSocketDebuggerUrl"], timeout=30)
    return t, ws


def evaluate(ws, js):
    r = call(ws, "Runtime.evaluate", expression=js, awaitPromise=True, returnByValue=True)
    res = r.get("result", {})
    if "exceptionDetails" in r:
        return {"exception": r["exceptionDetails"].get("text"), "detail": res.get("description")}
    return res.get("value", res.get("description"))


def main():
    cmd = sys.argv[1]
    if cmd == "tabs":
        for t in tabs():
            print(t["id"][:8], "|", t["title"][:60], "|", t["url"][:100])
        return
    sub = sys.argv[2]
    t, ws = connect(sub)
    if cmd == "eval":
        print(json.dumps(evaluate(ws, sys.argv[3]), indent=1, ensure_ascii=False))
    elif cmd == "shot":
        r = call(ws, "Page.captureScreenshot", format="png")
        open(sys.argv[3], "wb").write(base64.b64decode(r["data"]))
        print("wrote", sys.argv[3])
    elif cmd == "nav":
        call(ws, "Page.navigate", url=sys.argv[3])
        print("navigated", t["id"][:8])
    ws.close()


if __name__ == "__main__":
    main()
