# Hungarian (hu) UI translation review (2026-10-10)

Independent review of `hu.json` against `strings-en.json` and `strings-inventory.md`. Every string was back-translated to English and compared with the source; the table lists every string changed.

**Verdict: SHIP**

- Careful translation: formal Ön register as on Hungarian iOS, verbal-noun buttons (Törlés, Visszaállítás), Apple terms (Mégsem, Kész, Emlékeztetők).
- Placeholders never carry case suffixes; colon/parenthesis frames everywhere ("Felismerés nyelve: angol", "Remi ezt a nyelvet még nem beszéli: {language}" with fallback "ismeretlen nyelv"). This already satisfies the language-name rule.
- The one real issue was the paywall legal disclosure saying "we" charge the Apple Account ("terheljük"). Apple, not the developer, charges; fixed to the impersonal "terhelik" so the legal meaning matches the English ("Payment is charged to your Apple Account").

## Changes (8)

| key | before | after | back-translation | why |
|---|---|---|---|---|
| `composer.speak.a11y` | Inkább kimondom | Kimondás gépelés helyett | Speaking instead of typing | "Inkább kimondom" ("I'd rather say it") put the user's voice in a VoiceOver button label; buttons use a verbal noun in this file. |
| `settings.row.language` | (missing: new key) | Nyelv | Language | New key: added to strings-en.json during this review; translated here so the file validates. |
| `language.sheet.title` | (missing: new key) | Válassza ki a nyelvet | Choose the language | New key: added to strings-en.json during this review; translated here so the file validates. |
| `language.sheet.subtitle` | (missing: new key) | Remi ezt használja az appban, és ennek alapján érti meg, amit mond. | Remi uses it in the app, and uses it to understand what you say. | New key: added to strings-en.json during this review; translated here so the file validates. |
| `language.sheet.continue` | (missing: new key) | Tovább | Continue / Next | New key: added to strings-en.json during this review; translated here so the file validates. |
| `paywall.table.row.schedules` | Hétköznapok, dátumok, néhány naponta | A hét választott napjai, dátumok, néhány naponta | Chosen days of the week, dates, every few days | "Hétköznapok" means Monday–Friday; in Remi "Weekdays" is the Weekly mode where the user picks days of the week (orchestrator correction). |
| `paywall.legal.disclosure.generic` | {product}: automatikusan megújuló előfizetés. A díjat a vásárlás megerősítésekor terheljük az Apple-fiókjára, és az előfizetés a lemondásig automatikusan megújul. Bármikor kezelheti vagy lemondhatja a Beállítások > Apple-fiók > Előfizetések menüben. | {product}: automatikusan megújuló előfizetés. A díjat a vásárlás megerősítésekor az Apple-fiókjára terhelik, és az előfizetés a lemondásig automatikusan megújul. Bármikor kezelheti vagy lemondhatja a Beállítások > Apple-fiók > Előfizetések menüben. | {product}: auto-renewing subscription. The payment is charged to your Apple Account at confirmation of purchase, and the subscription renews automatically until cancelled. You can manage or cancel it anytime in Settings > Apple Account > Subscriptions. | Legal: "terheljük" (we charge) made the developer the charging party; the English is passive and Apple charges. Impersonal "terhelik" restores the exact meaning. |
| `paywall.legal.disclosure.priced` | {product}: {price} / {term}. A díjat a vásárlás megerősítésekor terheljük az Apple-fiókjára. Az előfizetés automatikusan megújul ugyanezen az áron ({price} / {term}), és a fiókját minden megújítás előtt 24 órán belül terheljük, kivéve, ha az automatikus megújítást legalább 24 órával az aktuális időszak vége előtt kikapcsolja. Bármikor kezelheti vagy lemondhatja a Beállítások > Apple-fiók > Előfizetések menüben. | {product}: {price} / {term}. A díjat a vásárlás megerősítésekor az Apple-fiókjára terhelik. Az előfizetés automatikusan megújul ugyanezen az áron ({price} / {term}), és a fiókját minden megújítás előtt 24 órán belül megterhelik, kivéve, ha az automatikus megújítást legalább 24 órával az aktuális időszak vége előtt kikapcsolja. Bármikor kezelheti vagy lemondhatja a Beállítások > Apple-fiók > Előfizetések menüben. | {product}: {price} / {term}. The payment is charged to your Apple Account at confirmation of purchase. The subscription renews automatically at the same price ({price} / {term}), and your account is charged within 24 hours before each renewal, unless you turn off auto-renewal at least 24 hours before the end of the current period. You can manage or cancel it anytime in Settings > Apple Account > Subscriptions. | Legal: both "terheljük" (we charge) changed to impersonal "terhelik / megterhelik"; every other clause was already exact. |

## Kept as is / notes for the owner

- `paywall.hero.default.*` "Ne felejtsen. / Emlékezzen / időben." turns "Forget less" into "Don't forget"; kept because the literal "Felejtsen kevesebbet." (21 chars) breaks the ~12-char hero line. The closing headline keeps the literal form.
- `today.header.getPro` = "Pro verzió" (10) has no verb; kept for the ~10-char pill. "Legyen Pro" (10) is an option if the owner wants a call to action.
- `quickChoice.pickTime` = "Időpont…" drops the verb to fit ~16 chars ("Időpont választása…" is 20); kept.
- `aiConsent.allow` "Engedélyezés" (12) and `permission.enabled` "Bekapcsolva" (11) run 1-2 chars over the ~10 guide; both are Apple's own words with no shorter natural form. Check on device.
- `paywall.cta.trial` "{length} ingyenes próba" ("7 napos ingyenes próba", 22) has no verb; adding "indítása" would exceed ~24.
- Upgrade is rendered as "előfizetés" (subscribe) throughout; consistent and natural in Hungarian.
