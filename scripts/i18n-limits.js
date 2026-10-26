/**
 * Length limits for space-constrained UI strings (buttons, pills, tabs, chips,
 * toasts, CTAs, weekday labels…), shared by the jest gate
 * (__tests__/lib/i18nLimits.test.ts) and the report generator.
 *
 *   node scripts/i18n-limits.js            → rewrites docs/localization/app-ui/limits.json
 *                                            and overflow-report.json
 *
 * Limits are in GRAPHEMES (what a reader sees as one character; Intl.Segmenter),
 * not UTF-16 units. A message is measured at its longest: placeholders filled
 * with realistic English samples, every plural/select branch tried.
 *
 * Where a limit comes from: the role the inventory records for the key
 * (docs/localization/app-ui/strings-inventory.md, "Context"), sized from the
 * English layout on a 375 pt-wide iPhone at the element's font size (≈ 7–8 pt
 * per Latin character at 14–16 pt semibold, ≈ 16 pt at the 32 pt serif title).
 * An explicit "Max ~N chars" in the inventory wins. A limit is never below the
 * English string itself.
 */
/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require("fs");
const path = require("path");
const { parse, TYPE } = require("@formatjs/icu-messageformat-parser");

const ROOT = path.resolve(__dirname, "..");
const DOCS = path.join(ROOT, "docs/localization/app-ui");
const LOCALES = path.join(ROOT, "locales");

/** Slack over the limit before a string counts as overflowing. */
function allowedFor(limit) {
  return limit + Math.max(1, Math.ceil(limit * 0.1));
}

/** Roles, matched against the start of the inventory context, in order. */
const ROLES = [
  [/^Bottom tab/i, "tab", 10],
  [/^Pill button in header/i, "headerPill", 10],
  [/^Screen header/i, "screenTitle", 16],
  [/^(Sheet title|Modal title)/i, "sheetTitle", 24],
  [/^Small button/i, "smallButton", 10],
  [/^Button busy state|^Busy state/i, "busyButton", 14],
  [/^(Button|Primary button|Crash screen button|Destructive action-sheet button|Edit sheet confirm|Confirm button)/i, "button", 14],
  [/^Status pill/i, "pill", 10],
  [/^Pill on annual card/i, "badge", 12],
  [/^Status chip/i, "statusChip", 16],
  [/^(Mode chip|Chip)/i, "chip", 16],
  [/^Toast action/i, "toastAction", 12],
  [/^(Toast title|Success toast|Generic alert\/toast title)/i, "toastTitle", 40],
  [/^(Section label|Section header)/i, "sectionLabel", 20],
  [/^Row label/i, "rowLabel", 26],
  [/^(Row value|Date row value)/i, "rowValue", 18],
  [/^Link-style row/i, "linkRow", 24],
  [/^Status line, 2 lines/i, "statusLine2", 60],
  [/^Status line|^Recording sheet status/i, "statusLine", 40],
  // Languages without standard abbreviations (ar, fa, ur…) use full names: up to 8.
  [/^Weekday abbreviation/i, "weekdayShort", 8],
  [/^1-char column header/i, "weekdayNarrow", 2],
  [/^Price suffix/i, "priceSuffix", 5],
  [/^Picker wheel/i, "pickerAmPm", 4],
  [/^12-hour suffix/i, "clockSuffix", 5],
  [/^Plan card kicker/i, "planKicker", 14],
  [/^Column head/i, "columnHead", 6],
  [/^Footer link/i, "footerLink", 18],
  [/^(Serif display hero|Hero line|Hero when opened from an interval request, line)/i, "heroLine", 12],
  [/^Sticky CTA/i, "cta", 24],
  [/^Pro card title/i, "cardTitle", 24],
  [/^Feature row/i, "featureRow", 48],
  [/^Crash screen title/i, "sheetTitle", 24],
];

/**
 * Keys whose inventory row is missing (added later) or doesn't name the
 * on-screen role, with the role they have in the UI.
 */
const EXTRA_KEYS = {
  "settings.row.language": ["Row label", "rowLabel"],
  "language.sheet.title": ["Sheet title", "sheetTitle"],
  "language.sheet.continue": ["Button", "button"],
  "paywall.hero.interval.line2": ["Hero line", "heroLine"],
  "paywall.hero.interval.line3": ["Hero line", "heroLine"],
  "aiConsent.notNow": ["Button", "button"],
  "pending.recordAgain": ["Button", "button"],
  "pending.settingUp": ["Busy state", "busyButton"],
  "pending.cancelling": ["Busy state", "busyButton"],
  "time.ringingNow": ["Row subtitle, one line", "rowSubtitle"],
  "time.dueNow": ["Row subtitle, one line", "rowSubtitle"],
  "time.missedAt": ["Row subtitle, one line", "rowSubtitle"],
  "time.ringsAgain": ["Row subtitle, one line", "rowSubtitle"],
  "time.nextIn.minutes": ["Row subtitle, one line", "rowSubtitle"],
  "reminders.next.none": ["Row subtitle, one line", "rowSubtitle"],
  "reminders.next.overdue": ["Row subtitle, one line", "rowSubtitle"],
  "reminders.next.tomorrow": ["Row subtitle, one line", "rowSubtitle"],
  "schedule.daily": ["Row value", "rowValue"],
  "schedule.weekly": ["Row value", "rowValue"],
  "schedule.everyDay": ["Row value", "rowValue"],
  "paywall.table.cell.unlimited": ["Table cell, narrow column", "tableCell"],
  "paywall.table.heading": ["Section title", "sheetTitle"],
  "paywall.billed.monthly": ["Plan card line", "planLine"],
  "paywall.billed.yearly": ["Plan card line", "planLine"],
  "paywall.billed.weekly": ["Plan card line", "planLine"],
  "paywall.restore": ["Footer link", "footerLink"],
  "paywall.restoring": ["Footer link", "footerLink"],
  "times.every": ["Inline label", "inlineLabel"],
  "times.between": ["Inline label", "inlineLabel"],
  "times.picker.title": ["Sheet title", "sheetTitle"],
  "edit.row.alarm": ["Row label", "rowLabel"],
  "edit.spokenLine.label": ["Row label", "rowLabel"],
  "edit.emoji.title": ["Sheet title", "sheetTitle"],
  "aiConsent.title": ["Sheet title", "sheetTitle"],
  "diagnostics.title": ["Screen header", "screenTitle"],
  "diagnostics.status.allowed": ["Status chip", "statusChip"],
  "alarmOverlay.playing": ["Status line", "statusLine"],
  "recording.gate.freeLimit": ["Status line", "statusLine"],
  "layout.toast.alarmsMayNotFire.title": ["Toast title", "toastTitle"],
  "voice.regenFailed.title": ["Toast title", "toastTitle"],
  "voice.rescheduleFailed.title": ["Toast title", "toastTitle"],
  "today.offline.banner": ["Banner, one line", "banner"],
  "feedback.sheet.kicker.failedTake": ["Sheet kicker", "sheetTitle"],
};

/** Roles that only EXTRA_KEYS use, with their limits. */
const EXTRA_ROLE_LIMITS = {
  rowSubtitle: 32,
  tableCell: 10,
  planLine: 18,
  inlineLabel: 12,
  banner: 40,
};

/** Realistic English fillers for placeholders (longest common case). */
const SAMPLES = {
  count: 12,
  limit: 3,
  created: 2,
  total: 3,
  hours: 2,
  minutes: 30,
  length: "7 days",
  price: "$9.99",
  term: "month",
  termShort: "mo",
  time: "10:30 PM",
  date: "Oct 26",
  when: "Oct 26, 10:30 PM",
  days: "Mon, Wed",
  times: "8:00 AM",
  first: "8:00 AM",
  start: "8:00 AM",
  end: "10:00 PM",
  next: "10:30 PM",
  duration: "30 min",
  product: "Remi Pro",
  language: "English",
  choice: "In 1 hour",
  title: "Call mom",
  titles: "Call mom",
  quote: "Call mom",
  subject: "Call mom",
  kicker: "Annual",
  billed: "Billed yearly",
  trial: "7 days",
  version: "1.0.3",
  build: "12",
};
const NUMBER_SAMPLES = [0, 1, 2, 3, 11, 12, 100];

let segmenter = null;
function graphemes(text) {
  if (!segmenter) segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  let n = 0;
  for (const _ of segmenter.segment(text)) n += 1;
  return n;
}

/** The longest rendering of a message: every branch tried, samples filled in. */
function longestRendering(message) {
  const render = (elements, hash) => {
    let out = "";
    for (const el of elements) {
      switch (el.type) {
        case TYPE.literal:
          out += el.value;
          break;
        case TYPE.argument:
        case TYPE.number:
        case TYPE.date:
        case TYPE.time:
          out += String(SAMPLES[el.value] ?? "xxxxxx");
          break;
        case TYPE.pound:
          out += String(hash ?? 12);
          break;
        case TYPE.plural:
        case TYPE.select: {
          let best = "";
          for (const [selector, option] of Object.entries(el.options)) {
            const n = /^=\d+$/.test(selector) ? Number(selector.slice(1)) : undefined;
            const candidates =
              el.type === TYPE.plural
                ? (n !== undefined ? [n] : NUMBER_SAMPLES).map((num) => render(option.value, num))
                : [render(option.value, hash)];
            for (const c of candidates) if (graphemes(c) > graphemes(best)) best = c;
          }
          out += best;
          break;
        }
        case TYPE.tag:
          out += render(el.children, hash);
          break;
        default:
          break;
      }
    }
    return out;
  };
  return render(parse(message), undefined);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** key → { context, role } from the inventory table. */
function inventoryRoles() {
  const out = {};
  const text = fs.readFileSync(path.join(DOCS, "strings-inventory.md"), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = /^\| `([^`]+)` \| (.*?) \| (.*?) \| (.*?) \| (.*?) \| (.*?) \|\s*$/.exec(line);
    if (m) out[m[1]] = m[5].trim();
  }
  return out;
}

/** Build { key: { limit, role, en } } for every constrained key. */
function buildLimits() {
  const en = readJson(path.join(LOCALES, "en.json"));
  const contexts = inventoryRoles();
  const limits = {};
  for (const key of Object.keys(en)) {
    let context = contexts[key];
    let role = null;
    let limit = null;
    if (EXTRA_KEYS[key]) {
      [context, role] = EXTRA_KEYS[key];
      limit = EXTRA_ROLE_LIMITS[role] ?? ROLES.find(([, r]) => r === role)[2];
    } else if (context) {
      const hit = ROLES.find(([re]) => re.test(context));
      if (hit) [, role, limit] = hit;
    }
    if (!role) continue;
    const explicit = /max ~?(\d+)|~(\d+) chars/i.exec(context || "");
    if (explicit) limit = Number(explicit[1] || explicit[2]);
    const enLength = graphemes(longestRendering(en[key]));
    limits[key] = { limit: Math.max(limit, enLength), role, en: en[key] };
  }
  return limits;
}

/** Every catalog's overflows against `limits`. */
function overflowReport(limits) {
  const report = {};
  const files = fs.readdirSync(LOCALES).filter((f) => f.endsWith(".json")).sort();
  for (const file of files) {
    const tag = file.replace(/\.json$/, "");
    const catalog = readJson(path.join(LOCALES, file));
    const rows = [];
    for (const [key, { limit, en }] of Object.entries(limits)) {
      const current = catalog[key];
      if (typeof current !== "string") continue;
      const count = graphemes(longestRendering(current));
      if (count > allowedFor(limit)) rows.push({ key, en, current, limit, graphemes: count });
    }
    report[tag] = rows;
  }
  return report;
}

module.exports = { allowedFor, buildLimits, graphemes, longestRendering, overflowReport, DOCS };

if (require.main === module) {
  const limits = buildLimits();
  const report = overflowReport(limits);
  const write = (name, value) =>
    fs.writeFileSync(path.join(DOCS, name), JSON.stringify(value, null, 2) + "\n", "utf8");
  write("limits.json", {
    _about:
      "Max length in graphemes per space-constrained key (scripts/i18n-limits.js). Overflow = more than limit + max(1, ceil(10%)). Placeholders filled with English samples, every plural branch measured.",
    ...limits,
  });
  write("overflow-report.json", { _newKeys: [], ...report });
  const total = Object.values(report).reduce((n, rows) => n + rows.length, 0);
  console.log(`limits: ${Object.keys(limits).length} keys; overflows: ${total}`);
  for (const [tag, rows] of Object.entries(report)) console.log(`  ${tag}: ${rows.length}`);
}
