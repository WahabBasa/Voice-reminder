"""Keyword rank check for Remi (App Store id 6801797784) via the iTunes Search API.

Usage:
    python rank_check.py                    # keywords.json next to this file, today's date
    python rank_check.py --keywords other.json --out 2026-12-01_check.csv
    python rank_check.py --only-country DE  # one storefront
    python rank_check.py --dry-run          # list the planned requests, no network

Read-only: it only calls https://itunes.apple.com/search and /lookup.
Throttle: ~15 requests/min (Apple starts returning 403/429 around 20/min).
Progress is checkpointed to <out>.partial.jsonl so an interrupted run resumes.
"""
import argparse, csv, datetime, json, os, sys, time
import urllib.parse, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
INTERVAL = 4.0          # seconds between requests (15/min)
BACKOFFS = [60, 120, 240, 480]


def fetch(url, stats):
    for attempt in range(len(BACKOFFS) + 1):
        stats["requests"] += 1
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 rank-check"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            stats["errors"].append(f"{e.code} {url}")
            if e.code in (403, 429, 500, 502, 503) and attempt < len(BACKOFFS):
                print(f"  HTTP {e.code}, backing off {BACKOFFS[attempt]}s", flush=True)
                time.sleep(BACKOFFS[attempt])
                continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            stats["errors"].append(f"{type(e).__name__} {url}")
            if attempt < len(BACKOFFS):
                time.sleep(30)
                continue
            raise
        finally:
            time.sleep(INTERVAL)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--keywords", default=os.path.join(HERE, "keywords.json"))
    ap.add_argument("--date", default=datetime.date.today().isoformat())
    ap.add_argument("--out", default=None, help="CSV path (default <date>_check.csv next to this file)")
    ap.add_argument("--only-country", default=None)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    cfg = json.load(open(a.keywords, encoding="utf-8"))
    app_id = int(cfg["app_id"])
    by_lang = cfg["countries_by_language"]
    jobs = []
    for k in cfg["keywords"]:
        for cc in k.get("countries") or by_lang[k["language"]]:
            if a.only_country and cc != a.only_country.upper():
                continue
            jobs.append((cc, k["language"], k["keyword"], ";".join(k["source"])))
    out = a.out or os.path.join(HERE, f"{a.date}_check.csv")
    if not os.path.isabs(out):
        out = os.path.join(HERE, out)
    print(f"{len(jobs)} search requests planned -> {out}")
    if a.dry_run:
        for j in jobs:
            print(*j, sep=" | ")
        return

    stats = {"requests": 0, "errors": []}
    sys.stdout.reconfigure(encoding="utf-8")

    # 1) is Remi sold in each storefront at all?
    listed = {}
    for cc in sorted({j[0] for j in jobs}):
        r = fetch(f"https://itunes.apple.com/lookup?id={app_id}&country={cc.lower()}", stats)
        listed[cc] = bool(r.get("resultCount"))
        print(f"lookup {cc}: {'listed' if listed[cc] else 'NOT LISTED'}", flush=True)

    # 2) searches, with resume
    partial = out + ".partial.jsonl"
    done = {}
    if os.path.exists(partial):
        for line in open(partial, encoding="utf-8"):
            row = json.loads(line)
            done[(row["country"], row["keyword"])] = row
        print(f"resuming: {len(done)} already done")
    with open(partial, "a", encoding="utf-8") as pf:
        for i, (cc, lang, kw, src) in enumerate(jobs, 1):
            if (cc, kw) in done:
                continue
            url = ("https://itunes.apple.com/search?" + urllib.parse.urlencode(
                {"term": kw, "country": cc.lower(), "entity": "software", "limit": 200}))
            try:
                res = fetch(url, stats).get("results", [])
                ids = [x.get("trackId") for x in res]
                rank = str(ids.index(app_id) + 1) if app_id in ids else ">200" if len(res) >= 200 else f">{len(res)}"
                if app_id not in ids and not listed.get(cc, True):
                    rank = "not_listed"
                tops = [f"{x.get('trackName')} ({x.get('userRatingCount', 0)})" for x in res[:3]]
                row = {"date": a.date, "country": cc, "language": lang, "keyword": kw, "source": src,
                       "remi_rank": rank, "results_count": len(res),
                       "top1": tops[0] if len(tops) > 0 else "", "top2": tops[1] if len(tops) > 1 else "",
                       "top3": tops[2] if len(tops) > 2 else ""}
            except Exception as e:
                row = {"date": a.date, "country": cc, "language": lang, "keyword": kw, "source": src,
                       "remi_rank": "error", "results_count": "", "top1": f"{type(e).__name__}: {e}"[:200],
                       "top2": "", "top3": ""}
            done[(cc, kw)] = row
            pf.write(json.dumps(row, ensure_ascii=False) + "\n"); pf.flush()
            print(f"[{i}/{len(jobs)}] {cc} {kw}: {row['remi_rank']} ({row['results_count']})", flush=True)

    cols = ["date", "country", "language", "keyword", "source", "remi_rank", "results_count", "top1", "top2", "top3"]
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for cc, lang, kw, src in jobs:
            w.writerow(done[(cc, kw)])
    os.remove(partial)
    print(f"done: {stats['requests']} HTTP requests, {len(stats['errors'])} errors")
    for e in stats["errors"]:
        print("  ", e)


if __name__ == "__main__":
    main()
