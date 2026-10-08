import csv, sys, re, collections, json
path = sys.argv[1]
rows = list(csv.DictReader(open(path, encoding='utf-8-sig')))
T = {
 'ads': r'\bads?\b|advert|anuncio|publicidad|propaganda|publicit|werbung|reklam|iklan|quảng cáo|โฆษณา|إعلان|اعلان|تبلیغ|広告|광고|реклам',
 'alarm fails / unreliable': r"didn'?t (go off|ring|work)|doesn'?t (go off|ring|work)|not (going off|ringing|working)|stopped working|no (suena|funciona|sonó)|dejó de|não (toca|funciona)|ne sonne|لا يعمل|ما يرن|لا يرن|لايرن|لم يرن|ما يشتغل|鳴らない|動かない|鳴らなかった|울리지|안 울|안울|작동.{0,3}않|не (звонит|работает|срабатывает)",
 'voice / TTS quality': r'robot|voice|\bvoz\b|\bvoix\b|stimme|صوت|声|音声|목소리|음성|голос',
 'volume': r'\bloud|volume|quiet|volumen|sonido bajo|音量|볼륨|소리가 작|громк',
 'price / premium / subscription': r'premium|subscri|\bpay\b|paid|price|purchase|pro version|suscrip|pago|pagar|assinatura|اشتراك|مدفوع|課金|有料|유료|결제|подписк|плат',
 'snooze / dismiss': r'snooze|dismiss|posponer|apagar|soneca|غفوة|إيقاف|スヌーズ|止め|스누즈|끄기|отлож',
 'language support': r'language|idioma|langue|sprache|لغة|اللغة|日本語|한국어|язык',
 'weather / news readout': r'weather|clima|tiempo|météo|wetter|طقس|الطقس|天気|날씨|погод',
 'battery / background killed': r'battery|batería|bateria|بطارية|バッテリー|배터리|батаре',
 'easy to use': r'easy|simple|fácil|facil|sencill|facile|einfach|سهل|簡単|使いやす|쉽|편리|удобн|простой',
 'wakes me up / effective': r'wake (me )?up|wakes me|despert|acord|réveill|استيقظ|يصحي|صحيان|起き|目覚め|깨우|일어나|просып|будит',
 'love / great': r'\blove\b|great|excellent|amazing|best|excelente|me encanta|genial|ótimo|رائع|ممتاز|جميل|最高|素晴らしい|좋아|최고|отличн|супер',
}
def tag(t):
    t = t.lower()
    return [k for k, p in T.items() if re.search(p, t)]
groups = {'all': rows}
for lang in ('ja', 'ko', 'ar'):
    groups[lang] = [r for r in rows if lang in r['queryLangs'].split(';') or r['detectedLang'] == lang]
out = {}
for g, rs in groups.items():
    neg = [r for r in rs if r['score'] in ('1', '2')]
    pos = [r for r in rs if r['score'] in ('4', '5')]
    cn = collections.Counter(k for r in neg for k in tag(r['text']))
    cp = collections.Counter(k for r in pos for k in tag(r['text']))
    out[g] = {'n': len(rs), 'neg_n': len(neg), 'pos_n': len(pos),
              'neg_themes': cn.most_common(), 'pos_themes': cp.most_common()}
print(json.dumps(out, ensure_ascii=False, indent=1))
