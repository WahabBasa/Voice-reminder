# Remi 1.0.5: keyword and metadata proposal

Drafted 2026-11-03. **Proposal only.** Nothing has been written to App Store Connect: no version created, no metadata changed. The user reviews this first.

**Inputs**
- Rank baseline: `docs/aso/rankings/2026-11-03_baseline.csv` (iTunes Search API, top 200, taken two days after 1.0.4 went live).
- Live 1.0.4 title, subtitle and keyword field per locale: pulled from ASC today (scratch `asc.json`).
- Apple Ads keyword lists (scratch `ads_kw.json`).
- Playbook: `docs/aso/transcripts/aso-keywords-locales-playbook.md`.
- User voice: `research/user-voice-de-2026-10-28.md`, `research/user-voice-ar-2026-10-28.md`, `research/localization/ar-SA.md`.
- Apple's storefront-to-localization table: https://developer.apple.com/help/app-store-connect/reference/app-store-localizations/ (fetched today).

Notation: rank `12/12` means "#12 of 12 results"; `>180` means "not in the 180 results returned". Character counts are Unicode characters, the way ASC counts them. The live ar-SA and pt-BR fields prove this: they would be over 100 if ASC counted bytes.

---

## 0. Rules applied, and two findings that shape everything

**Playbook rules applied**
- Title carries the most weight, then the subtitle, then the keyword field.
- Never repeat a word across title, subtitle and keyword field in the same locale: the store keeps only the weakest placement.
- Singular forms only.
- Specific beats broad: wrong-intent installs turn into bad reviews.
- Keyword field: commas, no spaces.
- Allow 1–2 weeks to judge a change.

**Finding 1: the US ranking problem is authority, not placement.**
- Our title phrase "talking alarm clock" sits in the highest-weight field, yet ranks only #120 in the US and #114 in GB.
- "voice reminder(s)" sits in the subtitle and is absent from the top 177–184 in every storefront. Every app above us on it is a reminder app, many with thousands of ratings; the top one, "Reminder with Voice Reminders", has 17,562 US ratings. With almost no ratings or downloads, we can't win head terms in the US by moving words around.
- The same subtitle words do work in Spanish: es-MX is indexed on the US storefront, and "recordatorios con voz" ranks **#1 in the US**.
- So: keep the en-US title and subtitle, and spend the effort where metadata actually moves rank (DE, AR, BR/MX long tail, SE).
- Ratings and Apple Ads are what move the US head terms.

**Finding 2: Apple's storefront table changes the en-GB and sv decision.** From Apple's table (fetched today):

| Storefront | Default language | Additional languages indexed |
|---|---|---|
| US | English (US) | Arabic, Chinese (S/T), French, Korean, **Portuguese (BR), Spanish (MX)**, Russian, Vietnamese |
| GB | **English (UK)** | none |
| AU | English (Australia) | English (UK) |
| AE, SA | **English (UK)** | Arabic |
| SE | Swedish | English (UK) |
| DE | German | English (UK) |
| CH | German | English (UK), French, Italian |
| BR | Portuguese (BR) | English (UK) |
| MX | Spanish (MX) | English (UK) |

- We have no en-GB, so **en-US currently stands in for "English (UK)" in about 170 storefronts**. The baseline shows it: English terms rank in CH (talking alarm #25), SE (speaking alarm clock #16) and AE (forgetful #15), even though CH also has our de-DE.
- If we add en-GB, it replaces en-US in all of those storefronts. That is useful (see §6), but en-GB must carry the English terms that already work there.
- **"remi" (brand) can't be fixed with metadata.** It is already the first word of every title. It loses to Remini (358k ratings) and to "Remi"/Rummy card games. It ranks #34 in FR and #90 in SE, and nowhere in US, BR or DE. It will climb only with downloads. No action.

---

## 1. en-US (indexed in the US; today it also stands in for English (UK) in ~170 storefronts)

| Field | Current | Chars | Proposed | Chars |
|---|---|---|---|---|
| Title | `Remi: Talking Alarm Clock` | 25 | **keep** `Remi: Talking Alarm Clock` | 25 |
| Subtitle | `Voice reminders, said out loud` | 30 | **keep** `Voice reminders, said out loud` | 30 |
| Keywords | `speaking,announce,announcer,time,timer,chime,hourly,med,forgetful,adhd,talk,ring,wake,remember,water` | 100 | `speaking,spoken,announcer,time,forgetful,hourly,chime,adhd,med,nag,alert,memo,senior,elderly,wake` | 97 |

**Why each change**
- **Title kept.** It was chosen deliberately on 10-28, and the evidence doesn't justify changing it:
  - Its phrase ranks #120 US / #114 GB but #39 AU, #43 FR and #58 SE, so it's climbing where competition is thinner.
  - The obvious alternative, "voice reminder", is worse ground (Finding 1).
- **Subtitle kept.** The other candidates either repeat title words ("talking", "alarm", "clock") or hit rejected wording ("speaks" and its variants). "said out loud" adds only "loud" as a real search modifier, but changing it costs the 10-28 decision for no measured gain. Revisit after a ratings base exists.
- **Kept, because they work:**
  - `speaking`: speaking alarm clock #28 US, #7 FR; speaking alarm #59 US, #7 FR.
  - `announcer` + `time`: time announcer #22 FR, #28 SE, #38 AE, #43 CH.
  - `forgetful`: #14 FR, #15 AE, #37 AU, #55 GB, #105 US. This is our best single word.
  - `hourly` + `chime`: hourly chime #89 SE, #97 AE.
- **Dropped: `announce`.** It ranks 52–121 only as a lone word (no one searches "announce" for this), and `announcer` covers the phrase.
- **Dropped: `timer`, `talk`, `ring`, `remember`, `water`.** Each ranks nowhere (>164–197 in all six English storefronts), and the people searching them want something else: Clock/Timer Plus, Talkie/HelloTalk, Ring doorbell, Apple Reminders, water trackers (Waterllama, 164k ratings).
- **Added: `spoken`.** It pairs with "alarm" and "reminder" from the title and subtitle ("spoken alarm", "spoken reminder"). "Spoken Alarm" sits at #1 for "speaking alarm" in AU, with 0 ratings, so it's thin ground. It isn't visible copy, so the "speaks" rule doesn't apply. Untested.
- **Added: `nag`, `alert`.** They match the snooze-nag behaviour ("nag reminder", "voice alert", "alarm alert"). Untested.
- **Added: `memo`.** It catches "voice memo reminder" / "voice memo alarm", the way iPhone users describe recording a reminder. Watch for voice-recorder intent. Untested.
- **Added: `senior`, `elderly`.** "Talking clock for elderly" is where the German and Arabic research found the real demand (seniors, adult children). Untested in English.
- **Kept, flag for the user: `med`.** It is a medicine term that already sits in the field and ranks nowhere as a single word (>159–194). It may still help "med reminder" (unmeasured). Keep or drop is the user's call.
- **Kept: `wake`, `adhd`.** Both rank nowhere alone, but they feed "wake up alarm" and "adhd reminder" combinations. Low cost.

---

## 2. pt-BR (indexed in BR, and also in the US)

| Field | Current | Chars | Proposed | Chars |
|---|---|---|---|---|
| Title | `Remi: Lembretes por Voz` | 23 | **keep** `Remi: Lembretes por Voz` | 23 |
| Subtitle | `O despertador falante` | 21 | `Despertador falante e alarme` | 28 |
| Keywords | `relógio,alarme,fala,falar,hora,remédio,boleto,consulta,aniversário,esquecido,TDAH,lembrar,água` | 94 | `fala,falado,relógio,remédio,boleto,consulta,compromisso,aniversário,esquecido,tdah,hora,idoso,água` | 98 |

**Why each change**
- **Title kept.** "lembretes por voz" and "lembrete por voz" both rank **#3**, and "lembrete falado" ranks #14.
- **Subtitle: "O" becomes "e alarme".** The "O" carries nothing. "alarme falante" is our best "talking alarm" phrase in BR (#107), and moving "alarme" into the subtitle gives it more weight while keeping "despertador falante" (the Apple Ads term, now >181).
- **Removed `alarme` from the keyword field.** It moved to the subtitle, and the playbook says never repeat.
- **Kept, because they work in combination:**
  - `boleto`: lembrete de boleto #32 of 82.
  - `consulta`: lembrete de consulta #38.
  - `esquecido`: #40.
  - `tdah`: lembretes tdah #36.
- **Dropped: `falar`, `lembrar`.** Neither ranks (>189 and #186). `fala` stays for "alarme/despertador que fala".
- **Added: `falado`.** It makes "lembrete falado" (#14 of 56, thin) match explicitly.
- **Added: `compromisso`.** "Lembrete de compromisso" is everyday Brazilian for an appointment reminder, next to `consulta`. Untested.
- **Added: `idoso` (elderly).** It targets the senior and caregiver demand. Untested.
- **Kept, flag for the user: `remédio`.** It is a medicine term already in the field and dead today (lembrete de remédio >196; that space belongs to "Hora do Medicamento", 23k ratings). It can stay or go.
- **Kept: `relógio`, `hora`, `água`.** They rank nowhere alone (>185–190) but feed "relógio falante" and "lembrete beber água". Nothing better competes for the space.

---

## 3. es-MX (indexed in MX, and also in the US)

| Field | Current | Chars | Proposed | Chars |
|---|---|---|---|---|
| Title | `Remi: Recordatorios con voz` | 27 | **keep** `Remi: Recordatorios con voz` | 27 |
| Subtitle | `La alarma que te dice para qué` | 30 | `Alarma y despertador que habla` | 30 |
| Keywords | `reloj,despertador,habla,hablar,hora,pastillas,medicina,cita,recibo,cumpleaños,pendientes,tdah,agua` | 98 | `reloj,parlante,pastillas,medicina,cita,pago,tarjeta,cumpleaños,pendientes,tdah,olvidadizo,hora,agua` | 99 |

**Why each change**
- **Title kept.** It is our strongest title anywhere:
  - recordatorios con voz: #3 MX, **#1 US**.
  - recordatorio con voz: #1 MX, #5 US.
  - alarma con voz: #7 MX, #10 US.
- **Subtitle changed.** In the current one, only "alarma" is a search word ("la", "que", "te", "dice", "para", "qué" carry nothing). It also says "the alarm that tells you what for", which is close to the English "tells you why" the user rejected.
  - The new subtitle puts all three category words in the second-strongest field: alarma, despertador and habla.
  - That covers "alarma que habla" (#15 MX), "despertador que habla" (#118 MX) and "alarma con voz" (with the title).
- **Removed from the keyword field: `despertador`, `habla`.** Both moved to the subtitle (no repeats).
- **Dropped: `hablar`.** It ranks nowhere (>184).
- **Swapped `recibo` for `pago` + `tarjeta`.** `recibo` ranks nowhere (>186) and attracts invoice apps. "recordatorio de pago de tarjeta" has only 21 results in MX, and "recordatorio de pagos" is an Apple Ads keyword.
- **Added: `parlante`.** "Reloj parlante" (talking clock) pairs with `reloj`. Untested.
- **Added: `olvidadizo`.** It mirrors `forgetful` / `esquecido`, our best words in EN and PT. Untested.
- **Kept:**
  - `tdah`: recordatorios tdah #12 MX.
  - `cita`: recordatorio de citas #133.
  - `cumpleaños`: #115.
  - `pendientes`: #154.
- **Kept, flag for the user: `pastillas`, `medicina`.** Both are medicine terms already in the field, and `pastillas` actually ranks: #82 alone, alarma para pastillas #40 MX / #81 US, recordatorio de pastillas #101. The user decides whether they stay.
- **Kept: `agua`, `hora`.** They rank nowhere but fill leftover space.
- **Native check:** "Alarma y despertador que habla". I read "que habla" as attaching to "despertador", which is grammatical. If a native speaker would expect "hablan", use `Despertador y alarma que habla` (30) instead.

---

## 4. de-DE (indexed in DE, CH and AT)

| Field | Current | Chars | Proposed | Chars |
|---|---|---|---|---|
| Title | `Remi: Sprechender Wecker` | 24 | **keep** `Remi: Sprechender Wecker` | 24 |
| Subtitle | `Sagt dir laut, was ansteht` | 26 | `Spracherinnerung & Zeitansage` | 29 |
| Keywords | `zeitansage,ansage,ansagen,sprachansage,termine,erinnerung,medikamentenwecker,pillenwecker,tabletten` | 99 | `ansage,ansagen,sprachansage,termine,erinnerung,medikamentenwecker,uhrzeit,uhr,sprachausgabe,senioren` | 100 |

**Why each change**
- **Title kept.** "sprechender wecker" is the term users and hardware shops use (40 Play reviews), and it ranks #47 in CH. In DE it was >176 today, which is likely index noise or authority; recheck.
- **Subtitle changed.** "Sagt dir laut, was ansteht" has no search words. The new subtitle is taken word for word from the user-voice research's subtitle list (`user-voice-de` §4). It fills two gaps:
  - **spracherinnerung**: only 6 results and we're not among them, because the word isn't in our metadata. One app owns it ("Spracherinnerung: Voremi Ai", 1 rating).
  - **zeitansage**: we're #12 of 12 (last) with it in the keyword field. In the subtitle it should rise. It is the #1 German Apple Ads keyword and has 18 Play mentions.
- **Removed `zeitansage` from the keyword field.** It moved to the subtitle (no repeats).
- **Kept, because they rank top 10:**
  - termine ansagen: #1 of 1.
  - termin ansage: #1 of 1.
  - sprachansage wecker: #2 of 2.
  - medikamentenwecker: #3 of 4.
  - erinnerung ansagen: #9 of 9.
  - sprachansage: #10 of 10.
  - sprechende erinnerung: #10 of 11.
- **Added: `uhrzeit`.** For "uhrzeit ansage" (6 results, we're absent; 6 Play mentions of "Uhrzeit angesagt").
- **Added: `uhr`.** For "sprechende uhr" (>186), "zeitansage uhr" (9 results, we're absent) and "sprechende uhr" as the Alzheimer Society's term.
- **Added: `sprachausgabe`.** "wecker mit sprachausgabe" returns 0 results today, so nobody has it; it has 11 Play mentions ("Bester Wecker mit Sprachausgabe").
- **Added: `senioren`.** "sprechender wecker senioren" has 3 results and we're absent.
- **Dropped, flag for the user: `pillenwecker`, `tabletten`.** Both are medicine terms and dead: pillenwecker >179, tabletten >186, and tabletten wecker / tabletten erinnerung >180, where MyTherapy and mediteo have 15–20k ratings. The space buys four terms with fewer than 10 competitors. `medikamentenwecker` stays because it ranks #3. If the user wants a medicine word kept, put `tabletten` back in place of `senioren` (8 chars each).
- **Gap left open: "wecker mit ansage".** It has 1 result and we're absent even though "wecker" and "ansage" are both ours. The API seems to need "mit". Nothing to fix in metadata; recheck after the change.
- **Native check:** "Spracherinnerung & Zeitansage" comes from the research doc, not a native speaker. "Spracherinnerung" itself is attested (Play review ad1e98eb, and a competitor's title). The pairing reads as a list of two nouns, which is normal for German store subtitles, but a native check is worth it.

---

## 5. ar-SA (indexed in AE, SA and the other Arab storefronts, and also in the US)

| Field | Current | Chars | Proposed | Chars |
|---|---|---|---|---|
| Title | `Remi: منبه ناطق بالعربي` | 23 | **keep** `Remi: منبه ناطق بالعربي` | 23 |
| Subtitle | `ذكرني بالصوت ويرن حتى تنتبه` | 27 | **keep** `ذكرني بالصوت ويرن حتى تنتبه` | 27 |
| Keywords | `الساعة,الناطقة,ساعة,ناطقة,الساعه,الناطقه,ساعه,ناطقه,نطق,الوقت,الناطق,تذكير,الدواء,دواء,مواعيد` | 93 | `الساعة,الناطقة,ساعة,الساعه,الناطقه,ناطقه,ناطقة,الناطق,نطق,الوقت,يتكلم,صوتي,بصوت,عالي,تذكير,الدواء` | 97 |

**Why each change**
- **Title and subtitle kept.** They hold:
  - منبه ناطق بالعربي: #1 of 2.
  - منبه ناطق: #5.
  - المنبه الناطق: #5.
  - تذكير صوتي بالعربي: #5.
  - ذكرني بالصوت: #6 of 7.
  - تطبيق ذكرني: #39.
- **Keyword field: everything that ranks stays.**
  - الساعه الناطقه: #1 of 1.
  - الناطقه: #2.
  - ناطقه: #3.
  - منبه الوقت الناطق: #4 of 4 (uses الوقت).
  - منبه الوقت بالصوت: #6.
  - نطق الوقت: #15.
  - الناطقة: #26.
  - الناطق: #49.
- **Added: `يتكلم`.** "منبه يتكلم" returns **1 result** and we're not in it. ⚠️ **Not verified as natural Gulf usage:** the AR research found no user posts with it and marks it "test cheaply". It costs 5 characters. It was the research's top title idea, and "يتكلم" is plain MSA/Gulf for "talks".
- **Added: `صوتي`.** منبه صوتي is #73 and is a live Apple Ads term. Writing صوتي out explicitly should lift it and تذكير صوتي (>195). Intent caveat from the research: تذكير صوتي is dominated by religious reminder apps.
- **Added: `بصوت`, `عالي`.** "منبه بصوت عالي" (loud alarm) returns 13 results and we're absent. The research saw it in 2 sources. It matches the ring-until-you-notice line in our subtitle.
- **Dropped: `ساعه`, `دواء`, `مواعيد`.** All three rank nowhere alone (>178–182), and so do their combinations:
  - ساعه ناطقه >194.
  - منبه الدواء >193.
  - منبه المواعيد >191.
  - تذكير بالمواعيد >195.
- **Kept, flag for the user: `الدواء`.** It is a medicine term already in the field, for منبه الدواء / تذكير الدواء, which Dawai and MyTherapy own. It's dead today. Keep or drop is the user's call; dropping it frees 6 characters.
- **Kept: `ساعة`.** It feeds the Apple Ads term ساعة ناطقة, whose baseline result count was 0, which looks like an API glitch.
- **Native check:** the ة→ه spelling variants follow the research's observation of how Gulf reviewers type. The ه forms are the ones ranking #1–3, which supports that.

---

## 6. New localizations

### 6a. en-GB: **add it** (recommended)
- **Why.** en-GB is the default language in GB, AE and SA, and the English slot in SE, DE, CH, BR, MX and about 160 other storefronts (Finding 2). Today en-US fills that slot by default. Adding en-GB gives a separate keyword set for the whole non-US English world, so US tests stop moving AE, SE and CH ranks, and the reverse.
- **Risk.** Whatever en-GB holds **replaces** en-US in those storefronts, so it must carry the words that already rank there. Keep the title and subtitle the same so the brand stays consistent.
- **Spelling.** UK spelling doesn't matter for these words.

| Field | Proposed | Chars |
|---|---|---|
| Title | `Remi: Talking Alarm Clock` | 25 |
| Subtitle | `Voice reminders, said out loud` | 30 |
| Keywords | `speaking,spoken,announcer,time,forgetful,hourly,chime,adhd,med,nag,alert,senior,elderly,wake,nudge` | 98 |

- **Keywords.** Same core as the new en-US set (speaking, announcer, time, forgetful: the words behind the FR/CH/SE/AE ranks).
- **One deliberate difference.** en-GB uses `nudge` where en-US uses `memo`, so the two sets can be told apart in later rank runs.
- **"speaking clock".** It is the British name for the service (BT's 123 line). It's covered through `speaking` + "clock" in the title: GB #151, AE #42, SE #37, FR #27.
- **`med`.** Flag it here the same way as in en-US.

### 6b. en-AU: **not now**
- AU indexes en-AU plus en-GB, so en-AU would add a second, AU-only field of 100 characters.
- AU had 1 impression and 0 installs in October.
- The playbook says to add locales where traction shows. Once en-GB exists, AU already gets it, and it's the AU fallback.
- Revisit if the AU Apple Ads campaign produces installs. If it does, fill en-AU with the leftover words (e.g. `announce,timer,talk,repeat,interval,routine,habit,nagging`), never the core set (that's already in en-GB).

### 6c. sv (Swedish): **add it**, with a native check
- **Why.** Every Swedish term in the baseline is nearly empty, and we're absent from all of them because we have no sv metadata:

| Term | Results |
|---|---|
| röstlarm | 1 |
| röstpåminnelse | 3 |
| talande klocka | 5 |
| talande väckarklocka | 5 |
| talande alarm | 5 |
| läkemedelspåminnelse | 6 |
| pillerpåminnelse | 11 |
| väckarklocka med röst | 13 |

- **Ads.** The SE Apple Ads campaign is already live and bids on these terms. Ads point at an English page today.
- **English stays indexed in SE.** SE indexes Swedish plus English (UK), so adding sv keeps the English terms indexed: en-US now, en-GB once it exists. This is the same pattern as CH today.

| Field | Proposed | Chars |
|---|---|---|
| Title | `Remi: Talande väckarklocka` | 26 |
| Subtitle | `Röstpåminnelse och röstlarm` | 27 |
| Keywords (with medicine) | `klocka,alarm,larm,röst,påminnelse,glömsk,adhd,tid,senior,väckare,uppläsning,medicinpåminnelse,piller` | 100 |
| Keywords (no medicine) | `klocka,alarm,larm,röst,påminnelse,glömsk,adhd,tid,senior,väckare,uppläsning,tidsangivelse,minne` | 95 |

- **Title and subtitle cover:**
  - talande väckarklocka, talande alarm and talande klocka (title + `alarm`/`klocka`).
  - röstpåminnelse and röstlarm.
  - väckarklocka med röst and påminnelse med röst (`röst`).
- **Medicine words are new here.** Medicine words aren't in any Swedish field today, so this is the user's call:
  - medicinpåminnelse: 61 results.
  - läkemedelspåminnelse: 6 results; it needs both halves, which this field doesn't give, so it's left out.
  - pillerpåminnelse: 11 results.
- **Dropped "fröken ur".** Fröken Ur is the Swedish speaking-clock service, but the term returns 180 results dominated by watch apps.
- ⚠️ **Not native.** Have a Swedish speaker check `glömsk` (forgetful), `väckare` (colloquial alarm clock), `uppläsning` (reading aloud), `tidsangivelse` (time announcement), and that the subtitle reads naturally.

### 6d. What each new localization needs besides the three fields

| Item | en-GB | sv |
|---|---|---|
| Description | Copy en-US as is | Translate en-US (native check). Not a ranking field on iOS, but shown on the page |
| Promotional text | Copy en-US | Translate |
| What's New | Copy | Translate |
| Screenshots | Reuse the en-US v4 set as is | Reuse the en-US v4 set for launch (allowed). Swedish captions later: the playbook says screenshot text is a ranking and conversion signal |
| Support / privacy / marketing URLs | Same as en-US | Same |
| App-info localization (name + subtitle live there, plus privacy URL) | Needs a new app-info localization, not only a version localization | Same |
| In-app purchase / subscription display names | Optional; defaults to the primary language | Optional |

### 6e. Optional, the user's call: a "US matrix" locale for "voice reminder"
- The playbook's trick: the US also indexes Arabic, Chinese (S/T), French, Korean, Russian and Vietnamese.
- A Russian (ru) localization with an English title such as `Remi: Voice Reminder Alarm` (26) would give "voice reminder" title weight in the US without touching the en-US title.
- **Russia is on our "avoid" list** (country-selection doc), so Russian users seeing English costs nothing.
- **Risks:**
  - App Review may question English metadata in a Russian locale.
  - It is keyword-stuffing in spirit.
  - "voice reminder" is heavily contested in the US anyway (Finding 1).
- **Not recommended for 1.0.5.** It's listed because the brief asked for the "voice reminder" gap to be addressed.

---

## 7. Flags for the user

- **Medicine terms in the keyword fields:**
  - en-US and en-GB: `med`.
  - pt-BR: `remédio`.
  - es-MX: `pastillas`, `medicina`.
  - de-DE: `medikamentenwecker` (kept because it ranks #3); `pillenwecker` and `tabletten` are proposed for removal.
  - ar-SA: `الدواء`.
  - sv: optional `medicinpåminnelse`, `piller`.
  - None are in an en-US title or subtitle.
- **Native checks needed:** the de-DE subtitle; the ar-SA `يتكلم` (unverified usage); the es-MX subtitle grammar; all sv strings.
- **No AI provider names and no competitor brands** appear in any field. "fröken ur" is a public service name, not an app brand, and it was dropped anyway.

## 8. Caveats

- **The iTunes Search API is not the App Store search** (see `rankings/README.md`). Ranks are approximate; it's one snapshot.
- A change takes 1–2 weeks to show. Rerun `rank_check.py` about 14 days after 1.0.5 goes live, at the same time of day.
- Before that rerun, add the new terms to `keywords.json`: spoken, nag, alert, memo, senior/elderly, compromisso, idoso, parlante, olvidadizo, pago/tarjeta, uhrzeit, sprachausgabe, يتكلم, منبه بصوت عالي, and the sv set.
- **No search-volume data.** Apple Ads search-popularity hasn't been pulled for any of the new terms. A term with few competitors can also have no searchers. Check popularity in the Apple Ads keyword tool before betting on the sv and DE gaps.
- Changing the subtitles in es-MX, pt-BR and de-DE all at once makes it hard to tell which change moved what. The ranks they protect are in the titles and keyword fields, so the downside is limited.

## 9. Summary: highest-impact changes

1. **de-DE subtitle → `Spracherinnerung & Zeitansage`, plus `uhrzeit`, `uhr`, `sprachausgabe`, `senioren` in the field.** It fills German gaps where 0–12 apps compete, and it lifts zeitansage from #12 of 12.
2. **Add an sv localization** (`Remi: Talande väckarklocka` / `Röstpåminnelse och röstlarm`): every Swedish term has 1–13 competitors and the SE ad campaign is already live.
3. **es-MX and pt-BR subtitles carry the category words** (`Alarma y despertador que habla`, `Despertador falante e alarme`) and keep the titles that rank #1–3.
4. **en-US: keep the title and subtitle, replace the six dead words** (timer, talk, ring, remember, water, announce) with spoken, nag, alert, memo, senior, elderly. The US problem is ratings, not placement.
5. **Add en-GB** as the separate English set for the ~170 non-US storefronts, and add `يتكلم`, `صوتي`, `بصوت`, `عالي` to ar-SA. Skip en-AU for now.
