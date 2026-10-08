import json, os, sys, time
from google_play_scraper import reviews, Sort

APP = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), 'raw', APP)
os.makedirs(OUT, exist_ok=True)

PAIRS = {
    'en': ['us', 'gb', 'in', 'ca', 'au', 'ng', 'za', 'pk', 'ph', 'my', 'ae', 'sa'],
    'ar': ['ae', 'sa', 'eg', 'us'],
    'ja': ['jp', 'us'], 'ko': ['kr', 'us'],
    'es': ['es', 'mx', 'us'], 'pt': ['br'], 'fr': ['fr', 'ca'], 'de': ['de'],
    'it': ['it'], 'ru': ['ru', 'ua'], 'tr': ['tr'], 'hi': ['in'], 'id': ['id'],
    'vi': ['vn'], 'th': ['th'], 'zh': ['tw'], 'zh-TW': ['tw'], 'zh-CN': ['us'],
    'nl': ['nl'], 'pl': ['pl'], 'ms': ['my'], 'fil': ['ph'], 'tl': ['ph'],
    'ur': ['pk'], 'fa': ['ir'], 'he': ['il'], 'iw': ['il'], 'uk': ['ua'],
}
MAX = int(sys.argv[2]) if len(sys.argv) > 2 else 100000
SKIP = set(sys.argv[3].split(',')) if len(sys.argv) > 3 else set()

for lang, countries in PAIRS.items():
    for c in countries:
        fn = os.path.join(OUT, f'{lang}_{c}.json')
        if os.path.exists(fn) or f'{lang}_{c}' in SKIP:
            continue
        allr, token, tries = [], None, 0
        while True:
            try:
                res, token = reviews(APP, lang=lang, country=c, sort=Sort.NEWEST,
                                     count=200, continuation_token=token)
            except Exception as e:
                tries += 1
                print(f'  {lang}/{c} error {e!r}, backoff', flush=True)
                if tries > 4:
                    break
                time.sleep(10 * tries)
                continue
            allr.extend(res)
            if not res or token is None or token.token is None or len(allr) >= MAX:
                break
            time.sleep(0.4)
        for r in allr:
            for k in ('at', 'repliedAt'):
                if r.get(k):
                    r[k] = r[k].isoformat()
        with open(fn, 'w', encoding='utf-8') as f:
            json.dump(allr, f, ensure_ascii=False)
        print(f'{APP} {lang}/{c}: {len(allr)}', flush=True)
        time.sleep(1)
