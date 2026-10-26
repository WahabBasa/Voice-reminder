/**
 * Space-constrained strings fit their limit (docs/localization/app-ui/limits.json,
 * built by scripts/i18n-limits.js; graphemes, every plural branch, samples for
 * placeholders, 10% slack).
 *
 * Known overflows waiting for a rewrite are listed in overflow-report.json and
 * skipped here, so a NEW overflow fails at once while the rewrites land.
 * Strict mode checks everything:  I18N_LIMITS_STRICT=1 npx jest i18nLimits
 * One language:                    npx jest __tests__/lib/i18nLimits -t de
 * After rewriting, refresh both files with:  node scripts/i18n-limits.js
 */
import fs from "fs";
import path from "path";

/* eslint-disable @typescript-eslint/no-var-requires */
const { allowedFor, graphemes, longestRendering, DOCS } = require("../../scripts/i18n-limits.js");

const ROOT = path.resolve(__dirname, "../..");
type Limit = { limit: number; role: string; en: string };
const limitsFile: Record<string, Limit | string> = JSON.parse(
  fs.readFileSync(path.join(DOCS, "limits.json"), "utf8")
);
const limits = Object.entries(limitsFile).filter(([key]) => !key.startsWith("_")) as [string, Limit][];
const report: Record<string, { key: string }[]> = JSON.parse(
  fs.readFileSync(path.join(DOCS, "overflow-report.json"), "utf8")
);
const strict = process.env.I18N_LIMITS_STRICT === "1";

const tags = fs
  .readdirSync(path.join(ROOT, "locales"))
  .filter((name) => name.endsWith(".json"))
  .map((name) => name.replace(/\.json$/, ""))
  .sort();

it("limits cover the constrained roles and English fits every one", () => {
  expect(limits.length).toBeGreaterThan(150);
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, "locales/en.json"), "utf8"));
  for (const [key, { limit }] of limits) {
    expect([key, graphemes(longestRendering(en[key])) <= limit]).toEqual([key, true]);
  }
});

it("counts graphemes, not UTF-16 units", () => {
  expect(graphemes("👍🏽")).toBe(1);
  // The ZWNJ joins the grapheme before it: 7 visible characters.
  expect(graphemes("می‌خواهم")).toBe(7);
  expect(graphemes("{count, plural, one {# day} other {# days}}")).toBeGreaterThan(0);
  expect(longestRendering("{count, plural, one {# day} other {# days}}")).toBe("100 days");
});

describe.each(tags)("%s", (tag) => {
  const catalog: Record<string, string> = JSON.parse(
    fs.readFileSync(path.join(ROOT, "locales", `${tag}.json`), "utf8")
  );
  const known = new Set((report[tag] ?? []).map((row) => row.key));
  const cases = limits.filter(([key]) => typeof catalog[key] === "string");
  const run = (key: string) => (!strict && known.has(key) ? it.skip : it);

  for (const [key, { limit }] of cases) {
    run(key)(`${tag} ${key} ≤ ${limit}`, () => {
      const count = graphemes(longestRendering(catalog[key]));
      const allowed = allowedFor(limit);
      // On failure this prints the key, the text and how long it is.
      expect([key, catalog[key], count]).toEqual([key, catalog[key], Math.min(count, allowed)]);
    });
  }
});
