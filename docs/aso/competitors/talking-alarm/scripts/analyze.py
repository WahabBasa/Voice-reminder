import json, os, sys, glob, csv, collections
from langdetect import detect_langs, DetectorFactory
DetectorFactory.seed = 0

APP = sys.argv[1]
OUTDIR = sys.argv[2]
RAW = os.path.join(os.path.dirname(__file__), 'raw', APP)

revs = {}
pairs = collections.defaultdict(set)
pair_counts = {}
for fn in sorted(glob.glob(os.path.join(RAW, '*.json'))):
    pair = os.path.basename(fn)[:-5]
    data = json.load(open(fn, encoding='utf-8'))
    pair_counts[pair] = len(data)
    for r in data:
        rid = r['reviewId']
        revs.setdefault(rid, r)
        pairs[rid].add(pair)

from lingua import Language as L, LanguageDetectorBuilder
LANGS = [L.ENGLISH, L.ARABIC, L.JAPANESE, L.KOREAN, L.SPANISH, L.PORTUGUESE, L.FRENCH, L.GERMAN,
         L.ITALIAN, L.RUSSIAN, L.TURKISH, L.HINDI, L.INDONESIAN, L.MALAY, L.VIETNAMESE, L.THAI,
         L.CHINESE, L.DUTCH, L.POLISH, L.TAGALOG, L.URDU, L.PERSIAN, L.HEBREW, L.UKRAINIAN,
         L.ROMANIAN, L.CATALAN, L.SWEDISH, L.GREEK, L.CZECH, L.HUNGARIAN, L.BENGALI]
DET = LanguageDetectorBuilder.from_languages(*LANGS).with_minimum_relative_distance(0.1).build()
ARDET = LanguageDetectorBuilder.from_languages(L.ARABIC, L.PERSIAN, L.URDU).build()

def det(t):
    t = (t or '').strip()
    letters = sum(ch.isalpha() for ch in t)
    if letters < 2:
        return 'und'  # emoji / punctuation only
    # script shortcuts are more reliable on very short text
    if any('぀' <= ch <= 'ヿ' for ch in t): return 'ja'
    if any('가' <= ch <= '힯' for ch in t): return 'ko'
    if any('฀' <= ch <= '๿' for ch in t): return 'th'
    if any('֐' <= ch <= '׿' for ch in t): return 'he'
    if any('؀' <= ch <= 'ۿ' for ch in t):
        # keyboard-letter signal: Urdu-only letters, then Persian keheh/farsi-yeh/peh/che/zhe/gaf
        if any(ch in 'ےںٹڈڑہھ' for ch in t): return 'ur'
        if any(ch in 'کیپچژگ' for ch in t): return 'fa'
        return 'ar'
    l = DET.detect_language_of(t)
    return l.iso_code_639_1.name.lower() if l else 'und'

rows = []
for rid, r in revs.items():
    rows.append({
        'reviewId': rid, 'date': (r.get('at') or '')[:10], 'score': r.get('score'),
        'text': (r.get('content') or '').replace('\r', ' ').replace('\n', ' '),
        'thumbsUp': r.get('thumbsUpCount'), 'appVersion': r.get('reviewCreatedVersion') or r.get('appVersion'),
        'queryPairs': ';'.join(sorted(pairs[rid])), 'queryLangs': ';'.join(sorted({p.split('_')[0] for p in pairs[rid]})),
        'detectedLang': det(r.get('content')),
    })
rows.sort(key=lambda x: x['date'], reverse=True)
os.makedirs(OUTDIR, exist_ok=True)
with open(os.path.join(OUTDIR, 'reviews.csv'), 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else ['reviewId'])
    w.writeheader(); w.writerows(rows)

# overlap stats for country-effect test
ids = {}
for fn in glob.glob(os.path.join(RAW, '*.json')):
    ids[os.path.basename(fn)[:-5]] = {r['reviewId'] for r in json.load(open(fn, encoding='utf-8'))}
def ov(a, b):
    if a in ids and b in ids:
        A, B = ids[a], ids[b]
        u = len(A | B) or 1
        return f'{a}={len(A)} {b}={len(B)} shared={len(A & B)} jaccard={len(A & B)/u:.2f}'
    return f'{a}/{b} missing'
summary = {
    'total_unique': len(rows), 'empty_text': sum(1 for r in rows if not r['text'].strip()),
    'pair_counts': pair_counts,
    'overlap': [ov('en_us', x) for x in ['en_gb', 'en_in', 'en_ca', 'en_au', 'en_ng', 'en_pk', 'en_ae', 'en_sa', 'en_ph', 'en_my', 'en_za']]
               + [ov('ar_ae', 'ar_sa'), ov('ar_ae', 'ar_eg'), ov('ar_ae', 'ar_us'), ov('ja_jp', 'ja_us'), ov('ko_kr', 'ko_us'), ov('es_es', 'es_mx'), ov('es_es', 'es_us'), ov('fr_fr', 'fr_ca'), ov('ru_ru', 'ru_ua'), ov('zh_tw', 'zh-TW_tw'), ov('zh-TW_tw', 'zh-CN_us'), ov('fil_ph', 'tl_ph'), ov('he_il', 'iw_il')],
}
def agg(key):
    d = collections.defaultdict(list)
    for r in rows:
        for k in (r[key].split(';') if ';' in r[key] or key.startswith('query') else [r[key]]):
            d[k].append(r['score'])
    return sorted(((k, len(v), sum(v)/len(v)) for k, v in d.items()), key=lambda x: -x[1])
summary['by_detected'] = agg('detectedLang')
summary['by_query_lang'] = agg('queryLangs')
cc = collections.defaultdict(list)
for r in rows:
    for c in {p.split('_')[1] for p in r['queryPairs'].split(';')}:
        cc[c].append(r['score'])
summary['by_query_country'] = sorted(((k, len(v), sum(v)/len(v)) for k, v in cc.items()), key=lambda x: -x[1])
yr = collections.Counter(r['date'][:4] for r in rows)
summary['by_year'] = sorted(yr.items())
# detected vs query lang agreement
summary['detected_vs_query'] = collections.Counter(f"{r['queryLangs']}->{r['detectedLang']}" for r in rows).most_common(40)
json.dump(summary, open(os.path.join(os.path.dirname(__file__), f'summary_{APP}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps(summary, ensure_ascii=False, indent=1))
