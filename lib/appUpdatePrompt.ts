/**
 * "Update available" prompt — everything but the screen.
 *
 * The server (convex/appUpdate.ts `check`) says whether this install is older
 * than what the App Store sells, and whether updating is required. This module
 * holds the rest of the decision, all pure or close to it:
 *
 *   - its own small string table in the 35 UI languages. Deliberately NOT the
 *     i18n catalogs: this same file ships to older app versions that have no
 *     catalogs (1.0.1) or different ones (1.0.2), so it must stand alone.
 *   - which language to speak: the app's UI language first, then the iPhone's
 *     preferred languages, then English (`pickPromptLanguage`).
 *   - the 24 h snooze after "Later" (AsyncStorage), never applied when required.
 *   - holds: screens the prompt must never cover (a ringing alarm, the
 *     first-launch language wheel, the AI-consent card, a permission prompt,
 *     a recording, the splash) register a hold while they are up; the prompt
 *     waits until there are none.
 *
 * Self-contained by design: no imports from the rest of the app, so the same
 * file drops into every version unchanged.
 */
import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── the store page ──────────────────────────────────────────────────────────

export const APP_STORE_ID = "6801797784";
export const STORE_URL = `itms-apps://apps.apple.com/app/id${APP_STORE_ID}`;
export const STORE_WEB_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;

// ─── what the server says ────────────────────────────────────────────────────

export type UpdateDecision = { show: boolean; required: boolean; latest?: string };

/** The server's answer, defensively read: anything malformed is "no". */
export function readDecision(value: unknown): UpdateDecision {
  const v = value as any;
  if (!v || typeof v !== "object" || v.show !== true) return { show: false, required: false };
  const out: UpdateDecision = { show: true, required: v.required === true };
  if (typeof v.latest === "string") out.latest = v.latest;
  return out;
}

/** "1.0.2" passes; "", "1.0.2-beta", null do not. Mirrors the server's rule. */
export function isVersionString(value: unknown): value is string {
  return typeof value === "string" && /^\d{1,6}(\.\d{1,6}){0,3}$/.test(value.trim());
}

/** The first candidate that looks like a version (runtime version, then config). */
export function pickInstalledVersion(...candidates: unknown[]): string | null {
  for (const c of candidates) if (isVersionString(c)) return c.trim();
  return null;
}

/** "Later" exists only when the update is not required. */
export function showsLater(decision: UpdateDecision): boolean {
  return !decision.required;
}

// ─── snooze ──────────────────────────────────────────────────────────────────

export const SNOOZE_MS = 24 * 60 * 60 * 1000;
export const SNOOZE_KEY = "vr.updatePrompt.snoozedAt";

/** Whether a "Later" tapped at `snoozedAt` still silences the prompt at `now`. */
export function isSnoozed(snoozedAt: number | null, now: number): boolean {
  if (snoozedAt === null || !Number.isFinite(snoozedAt)) return false;
  // A clock that moved backwards past the tap ends the snooze rather than
  // stretching it.
  return now >= snoozedAt && now - snoozedAt < SNOOZE_MS;
}

/** Whether the prompt should be offered: the server says so and "Later" has expired. */
export function shouldOffer(decision: UpdateDecision, snoozedAt: number | null, now: number): boolean {
  if (!decision.show) return false;
  if (decision.required) return true;
  return !isSnoozed(snoozedAt, now);
}

export async function loadSnoozedAt(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(SNOOZE_KEY);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function saveSnoozedAt(at: number): Promise<void> {
  try {
    await AsyncStorage.setItem(SNOOZE_KEY, String(at));
  } catch {
    // A snooze that fails to persist only means the prompt may come back sooner.
  }
}

// ─── holds: screens the prompt must never cover ──────────────────────────────

const holds = new Map<string, number>();
const holdListeners = new Set<() => void>();

function notifyHolds(): void {
  for (const l of Array.from(holdListeners)) l();
}

/** Registers a hold; call the returned function to release it (idempotent). */
export function holdUpdatePrompt(reason: string): () => void {
  holds.set(reason, (holds.get(reason) ?? 0) + 1);
  notifyHolds();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const n = (holds.get(reason) ?? 1) - 1;
    if (n <= 0) holds.delete(reason);
    else holds.set(reason, n);
    notifyHolds();
  };
}

export function isUpdatePromptHeld(): boolean {
  return holds.size > 0;
}

export function updatePromptHoldReasons(): string[] {
  return Array.from(holds.keys());
}

export function subscribeUpdatePromptHolds(listener: () => void): () => void {
  holdListeners.add(listener);
  return () => {
    holdListeners.delete(listener);
  };
}

/** Holds the prompt while `active` is true and the calling component is mounted. */
export function useUpdatePromptHold(reason: string, active: boolean = true): void {
  useEffect(() => {
    if (!active) return;
    return holdUpdatePrompt(reason);
  }, [reason, active]);
}

/** Test seam. */
export function __resetUpdatePromptHoldsForTests(): void {
  holds.clear();
  holdListeners.clear();
}

/**
 * Whether the prompt is on screen right now. `offered` is the server + snooze
 * verdict; the rest is "is this a moment we may interrupt": Home showing,
 * nothing held, the app in the foreground (iOS system permission dialogs make
 * it inactive), and startup settled.
 */
export function isPromptVisible(s: {
  offered: boolean;
  dismissed: boolean;
  onHome: boolean;
  held: boolean;
  appActive: boolean;
  settled: boolean;
}): boolean {
  return s.offered && !s.dismissed && s.onHome && !s.held && s.appActive && s.settled;
}

// ─── strings ─────────────────────────────────────────────────────────────────

export type PromptStrings = {
  title: string;
  body: string;
  /** Replaces `body` when the update is required. */
  required: string;
  update: string;
  later: string;
};

/**
 * The prompt's own copy. Keys are the app's language choices: base code, with
 * Chinese split by script. pt is Brazilian, es Mexican, like the UI catalogs.
 * Never names a provider.
 */
export const PROMPT_STRINGS: Readonly<Record<string, PromptStrings>> = {
  en: { title: "Update available", body: "A new version of Remi is ready.", required: "Update Remi to keep using it.", update: "Update", later: "Later" },
  ar: { title: "تحديث متوفر", body: "إصدار جديد من Remi جاهز.", required: "حدّث Remi لمواصلة استخدامه.", update: "تحديث", later: "لاحقًا" },
  bn: { title: "আপডেট উপলব্ধ", body: "Remi-এর নতুন সংস্করণ এসেছে।", required: "Remi ব্যবহার চালিয়ে যেতে আপডেট করুন।", update: "আপডেট", later: "পরে" },
  cs: { title: "Nová aktualizace", body: "Nová verze aplikace Remi je připravená.", required: "Aktualizujte Remi, abyste ji mohli dál používat.", update: "Aktualizovat", later: "Později" },
  da: { title: "Opdatering klar", body: "En ny version af Remi er klar.", required: "Opdater Remi for at blive ved med at bruge den.", update: "Opdater", later: "Senere" },
  de: { title: "Update verfügbar", body: "Eine neue Version von Remi ist da.", required: "Aktualisiere Remi, um es weiter zu nutzen.", update: "Update", later: "Später" },
  el: { title: "Νέα ενημέρωση", body: "Μια νέα έκδοση του Remi είναι έτοιμη.", required: "Ενημερώστε το Remi για να συνεχίσετε να το χρησιμοποιείτε.", update: "Ενημέρωση", later: "Αργότερα" },
  es: { title: "Nueva versión", body: "Hay una nueva versión de Remi lista.", required: "Actualiza para seguir usando Remi.", update: "Actualizar", later: "Más tarde" },
  fa: { title: "به‌روزرسانی جدید", body: "نسخهٔ تازه‌ای از Remi آماده است.", required: "برای ادامهٔ استفاده از Remi، آن را به‌روز کنید.", update: "به‌روزرسانی", later: "بعداً" },
  fi: { title: "Päivitys saatavilla", body: "Uusi Remi-versio on valmis.", required: "Päivitä Remi, jotta voit jatkaa sen käyttöä.", update: "Päivitä", later: "Myöhemmin" },
  fr: { title: "Mise à jour disponible", body: "Une nouvelle version de Remi est prête.", required: "Mettez à jour Remi pour continuer à l’utiliser.", update: "Mettre à jour", later: "Plus tard" },
  he: { title: "עדכון זמין", body: "גרסה חדשה של Remi מוכנה.", required: "יש לעדכן את Remi כדי להמשיך להשתמש בה.", update: "עדכון", later: "אחר כך" },
  hi: { title: "अपडेट उपलब्ध है", body: "Remi का नया वर्शन तैयार है।", required: "Remi इस्तेमाल करते रहने के लिए इसे अपडेट करें।", update: "अपडेट करें", later: "बाद में" },
  hu: { title: "Frissítés érhető el", body: "Elkészült a Remi új verziója.", required: "A további használathoz frissíteni kell a Remit.", update: "Frissítés", later: "Később" },
  id: { title: "Pembaruan tersedia", body: "Versi baru Remi sudah siap.", required: "Perbarui Remi agar tetap bisa digunakan.", update: "Perbarui", later: "Nanti" },
  it: { title: "Nuova versione", body: "È pronta una nuova versione di Remi.", required: "Aggiorna Remi per continuare a usarla.", update: "Aggiorna", later: "Più tardi" },
  ja: { title: "アップデートがあります", body: "Remiの新しいバージョンが利用できます。", required: "Remiを引き続き使うには、アップデートしてください。", update: "アップデート", later: "あとで" },
  ko: { title: "업데이트 가능", body: "Remi의 새 버전이 준비되었습니다.", required: "Remi를 계속 사용하려면 업데이트하세요.", update: "업데이트", later: "나중에" },
  ms: { title: "Kemas kini tersedia", body: "Versi baharu Remi sudah sedia.", required: "Kemas kini Remi untuk terus menggunakannya.", update: "Kemas kini", later: "Kemudian" },
  nb: { title: "Oppdatering klar", body: "En ny versjon av Remi er klar.", required: "Oppdater Remi for å fortsette å bruke den.", update: "Oppdater", later: "Senere" },
  nl: { title: "Update beschikbaar", body: "Er is een nieuwe versie van Remi.", required: "Werk Remi bij om de app te blijven gebruiken.", update: "Bijwerken", later: "Later" },
  pl: { title: "Dostępna aktualizacja", body: "Nowa wersja Remi jest gotowa.", required: "Zaktualizuj Remi, aby dalej z niej korzystać.", update: "Aktualizuj", later: "Później" },
  pt: { title: "Atualização disponível", body: "Uma nova versão do Remi está pronta.", required: "Atualize o Remi para continuar usando.", update: "Atualizar", later: "Mais tarde" },
  ro: { title: "Actualizare disponibilă", body: "O nouă versiune Remi este gata.", required: "Actualizează Remi pentru a-l folosi în continuare.", update: "Actualizează", later: "Mai târziu" },
  ru: { title: "Доступно обновление", body: "Готова новая версия Remi.", required: "Обновите Remi, чтобы продолжить им пользоваться.", update: "Обновить", later: "Позже" },
  sv: { title: "Uppdatering finns", body: "En ny version av Remi är klar.", required: "Uppdatera Remi för att fortsätta använda den.", update: "Uppdatera", later: "Senare" },
  sw: { title: "Sasisho linapatikana", body: "Toleo jipya la Remi liko tayari.", required: "Sasisha Remi ili uendelee kuitumia.", update: "Sasisha", later: "Baadaye" },
  th: { title: "มีอัปเดตใหม่", body: "Remi เวอร์ชันใหม่พร้อมแล้ว", required: "อัปเดต Remi เพื่อใช้งานต่อ", update: "อัปเดต", later: "ภายหลัง" },
  tl: { title: "May bagong update", body: "Handa na ang bagong bersyon ng Remi.", required: "I-update ang Remi para patuloy itong magamit.", update: "I-update", later: "Mamaya" },
  tr: { title: "Güncelleme var", body: "Remi'nin yeni sürümü hazır.", required: "Remi'yi kullanmaya devam etmek için güncelleyin.", update: "Güncelle", later: "Sonra" },
  uk: { title: "Доступне оновлення", body: "Нова версія Remi готова.", required: "Оновіть Remi, щоб і надалі ним користуватися.", update: "Оновити", later: "Пізніше" },
  ur: { title: "اپ ڈیٹ دستیاب ہے", body: "Remi کا نیا ورژن تیار ہے۔", required: "Remi استعمال جاری رکھنے کے لیے اپ ڈیٹ کریں۔", update: "اپ ڈیٹ کریں", later: "بعد میں" },
  vi: { title: "Có bản cập nhật", body: "Đã có phiên bản Remi mới.", required: "Hãy cập nhật Remi để tiếp tục sử dụng.", update: "Cập nhật", later: "Để sau" },
  "zh-Hans": { title: "有可用更新", body: "Remi 新版本已就绪。", required: "请更新 Remi 以继续使用。", update: "更新", later: "稍后" },
  "zh-Hant": { title: "有可用的更新", body: "Remi 新版本已準備就緒。", required: "請更新 Remi 以繼續使用。", update: "更新", later: "稍後" },
};

/** Languages written right to left. */
export const RTL_PROMPT_LANGUAGES: readonly string[] = ["ar", "he", "fa", "ur"];

/**
 * A language tag → a PROMPT_STRINGS key, or null when the prompt has no copy
 * for it. "pt-BR" → "pt", "zh-TW" → "zh-Hant", "fil-PH" → "tl", "iw" → "he",
 * "no" → "nb".
 */
export function promptLanguageFor(tag: unknown): string | null {
  if (typeof tag !== "string") return null;
  const parts = tag.trim().replace(/_/g, "-").split("-").filter(Boolean);
  if (parts.length === 0) return null;
  let base = parts[0].toLowerCase();
  const aliases: Record<string, string> = { fil: "tl", iw: "he", in: "id", no: "nb", nn: "nb" };
  base = aliases[base] ?? base;
  if (base === "zh") {
    const rest = parts.slice(1).map((p) => p.toLowerCase());
    const traditional =
      rest.includes("hant") ||
      (!rest.includes("hans") && rest.some((p) => p === "tw" || p === "hk" || p === "mo"));
    return traditional ? "zh-Hant" : "zh-Hans";
  }
  return Object.prototype.hasOwnProperty.call(PROMPT_STRINGS, base) ? base : null;
}

/**
 * The language to speak: the first candidate the prompt has copy for, in the
 * order given (the app's UI language first, then the iPhone's preferred
 * languages), else English.
 */
export function pickPromptLanguage(candidates: readonly unknown[]): string {
  for (const c of candidates) {
    const lang = promptLanguageFor(c);
    if (lang) return lang;
  }
  return "en";
}

export function promptStringsFor(lang: string): PromptStrings {
  return PROMPT_STRINGS[lang] ?? PROMPT_STRINGS.en;
}

export function isRtlPromptLanguage(lang: string): boolean {
  return RTL_PROMPT_LANGUAGES.includes(lang);
}

/**
 * The style that puts a line's text against its reading start edge. Fabric
 * swaps an explicit 'left'/'right' under an RTL layout, so the physical edge
 * is computed from both the text's direction and the layout's.
 */
export function textEdgeStyle(
  rtlText: boolean,
  layoutRTL: boolean
): { textAlign: "left" | "right"; writingDirection: "ltr" | "rtl" } {
  const physicalRight = rtlText;
  // Under an RTL layout 'left' renders on the right edge, and vice versa.
  const textAlign = physicalRight !== layoutRTL ? "right" : "left";
  return { textAlign, writingDirection: rtlText ? "rtl" : "ltr" };
}
