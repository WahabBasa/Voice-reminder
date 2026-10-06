/**
 * The spoken language, read off the writing system (OLD-139).
 *
 * The bake-off transcripts (outputs/stt-bakeoff2) are the fixtures: correctly
 * transcribed Hebrew, Hindi, Persian and Urdu that the parse model tagged "ar".
 */
import { correctLanguageByScript, scriptVerdict } from "../../convex/scriptLanguage";

const HEBREW = "בעוד עשרים דקות תזכירי לי להוציא את הכביסה.";
const HINDI = "मुझे याद दिलाना कि कल शाम पांच बजे मम्मी को फोन करना है।";
const URDU = "تیس منٹ بعد مجھے یاد دلانا کہ کپڑے مشین سے نکالنے ہیں۔";
const PERSIAN = "بیست دقیقه دیگه یادم بنداز لباسا رو از ماشین دربیارم.";
const ARABIC = "ذكرني أن أتصل بأمي غداً الساعة الخامسة مساء.";

describe("scriptVerdict — one script per language", () => {
  it.each([
    ["Hebrew", HEBREW, "he"],
    ["Devanagari", HINDI, "hi"],
    ["Bengali", "আমাকে মনে করিয়ে দিও কাল বিকেল পাঁচটায় মাকে ফোন করতে।", "bn"],
    ["Gurmukhi", "ਮੈਨੂੰ ਕੱਲ੍ਹ ਪੰਜ ਵਜੇ ਯਾਦ ਕਰਾਉਣਾ", "pa"],
    ["Gujarati", "મને કાલે પાંચ વાગ્યે યાદ અપાવજો", "gu"],
    ["Tamil", "நாளை ஐந்து மணிக்கு நினைவூட்டு", "ta"],
    ["Telugu", "రేపు ఐదు గంటలకు గుర్తు చేయి", "te"],
    ["Kannada", "ನಾಳೆ ಐದು ಗಂಟೆಗೆ ನೆನಪಿಸು", "kn"],
    ["Malayalam", "നാളെ അഞ്ചു മണിക്ക് ഓർമ്മിപ്പിക്കുക", "ml"],
    ["Thai", "เตือนฉันพรุ่งนี้ห้าโมงเย็น", "th"],
    ["Hangul", "내일 오후 다섯 시에 엄마한테 전화하라고 알려줘.", "ko"],
    ["Han with kana", "明日の午後五時に母に電話するようにリマインドして。", "ja"],
    ["katakana alone", "リマインド", "ja"],
    ["Han alone", "明天下午五点提醒我给妈妈打电话。", "zh"],
    ["Greek", "Θύμισέ μου αύριο στις πέντε να πάρω τη μαμά", "el"],
    ["Georgian", "ხვალ ხუთ საათზე შემახსენე", "ka"],
    ["Armenian", "Վաղը հինգին հիշեցրու", "hy"],
    ["Arabic", ARABIC, "ar"],
    ["Persian", PERSIAN, "fa"],
    ["Urdu", URDU, "ur"],
  ])("%s → %s", (_name, text, lang) => {
    expect(scriptVerdict([text])?.lang).toBe(lang);
  });

  it("Latin and Cyrillic name no language", () => {
    expect(scriptVerdict(["påminn mig klockan tio om tandläkaren"])).toBeNull();
    expect(scriptVerdict(["Напомни мне завтра в пять позвонить маме"])).toBeNull();
  });

  it("nothing to read names no language", () => {
    expect(scriptVerdict([])).toBeNull();
    expect(scriptVerdict(["", "20:00 — 5!"])).toBeNull();
    expect(scriptVerdict([undefined, 42, null])).toBeNull();
  });

  it("a script it does not know names no language", () => {
    expect(scriptVerdict(["ነገ በአምስት ሰዓት አስታውሰኝ"])).toBeNull(); // Ethiopic
  });
});

describe("scriptVerdict — Arabic, Persian or Urdu", () => {
  it("Urdu-only letters (ٹ ڈ ڑ ں ے ھ ہ) make it Urdu, Persian letters or not", () => {
    expect(scriptVerdict(["مجھے یاد دلانا کہ کل شام پانچ بجے ممی کو فون کرنا ہے"])?.lang).toBe("ur");
    for (const letter of ["ٹ", "ڈ", "ڑ", "ں", "ے", "ھ", "ہ"]) {
      expect(scriptVerdict([`یاد ${letter}`])?.lang).toBe("ur");
    }
  });

  it("پ چ ژ گ and the ک/ی spellings without an Urdu letter make it Persian", () => {
    for (const letter of ["پ", "چ", "ژ", "گ", "ک", "ی"]) {
      expect(scriptVerdict([`بعد ${letter}`])?.lang).toBe("fa");
    }
    // ک and ی alone, no پ چ ژ گ: still Persian, since Urdu writes ے/ں/ہ everywhere.
    expect(scriptVerdict(["یک ساعت دیگر"])?.lang).toBe("fa");
  });

  it("Arabic text with a stray loan letter stays Arabic", () => {
    expect(scriptVerdict(["ذكرني بشرب البيبسي في المساء پ"])?.lang).toBe("ar");
  });

  it("Arabic script with no telling letter at all is Arabic", () => {
    expect(scriptVerdict(["بعد عشرين دقيقة"])?.lang).toBe("ar");
  });
});

describe("scriptVerdict — mixed scripts: the dominant one wins", () => {
  it("a Hebrew take with an English brand name is Hebrew", () => {
    expect(scriptVerdict(["תזכיר לי להתחבר ל-Zoom מחר בחמש"])?.lang).toBe("he");
  });

  it("an English take with a Hebrew word in it is left to the model", () => {
    expect(scriptVerdict(["remind me to buy challah, חלה, tomorrow at five"])).toBeNull();
  });

  it("counts the transcript, the title and the line together", () => {
    expect(scriptVerdict(["Call אמא", "התקשר לאמא", "תתקשר לאמא."])?.lang).toBe("he");
  });

  it("a tie with Latin leaves the model's tag alone", () => {
    expect(scriptVerdict(["ab אב"])).toBeNull();
  });
});

describe("correctLanguageByScript", () => {
  it.each([
    ["Hebrew", HEBREW, "he"],
    ["Hindi", HINDI, "hi"],
    ["Urdu", URDU, "ur"],
    ["Persian", PERSIAN, "fa"],
  ])("overrides a wrong \"ar\" for %s", (_name, text, lang) => {
    expect(correctLanguageByScript("ar", [text])).toBe(lang);
  });

  it("leaves real Arabic alone", () => {
    expect(correctLanguageByScript("ar", [ARABIC])).toBe("ar");
  });

  it("fills in a missing tag from an unambiguous script", () => {
    expect(correctLanguageByScript(undefined, [HEBREW])).toBe("he");
    expect(correctLanguageByScript("english", [HINDI])).toBe("hi");
  });

  it("keeps the model's tag where the script cannot say", () => {
    expect(correctLanguageByScript("sv", ["påminn mig klockan tio"])).toBe("sv");
    expect(correctLanguageByScript("UK", ["Нагадай мені завтра"])).toBe("uk");
    expect(correctLanguageByScript(undefined, ["remind me at ten"])).toBeUndefined();
  });

  it("lets the model pick a language the letters cannot tell apart", () => {
    expect(correctLanguageByScript("mr", [HINDI])).toBe("mr");
    expect(correctLanguageByScript("ne", [HINDI])).toBe("ne");
    expect(correctLanguageByScript("ps", [ARABIC])).toBe("ps");
    expect(correctLanguageByScript("ja", ["明日五時"])).toBe("ja");
  });

  it("does not let an alternate cross scripts", () => {
    // "mr" is a Devanagari alternate, not a Hebrew one.
    expect(correctLanguageByScript("mr", [HEBREW])).toBe("he");
    // Han with kana is Japanese, whatever the model said.
    expect(correctLanguageByScript("zh", ["明日の午後五時"])).toBe("ja");
  });
});
