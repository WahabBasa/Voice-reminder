/**
 * The catalogs and the code agree:
 *   - every key the code passes to t("…") exists in locales/en.json;
 *   - every catalog file in locales/ is registered, has exactly en.json's keys,
 *     parses as ICU, and keeps each message's {placeholders} and <tags>.
 * Adding a language = a JSON file + one registry line; this suite is the gate.
 */
import fs from "fs";
import path from "path";
import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import { UI_CATALOGS } from "../../locales";

const ROOT = path.resolve(__dirname, "../..");
const en: Record<string, string> = JSON.parse(
  fs.readFileSync(path.join(ROOT, "locales/en.json"), "utf8")
);
const enKeys = Object.keys(en).sort();

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(rel));
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(rel);
  }
  return out;
}

const SOURCES = ["app", "components", "lib"].flatMap(sourceFiles);

/** Literal keys: t("a.b") / t('a.b'). Template keys: t(`a.b.${x}`) → their fixed prefix. */
function keysUsed(): { literal: Map<string, string>; prefixes: Map<string, string> } {
  const literal = new Map<string, string>();
  const prefixes = new Map<string, string>();
  for (const file of SOURCES) {
    const text = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const m of text.matchAll(/\bt\(\s*["']([^"']+)["']/g)) literal.set(m[1], file);
    for (const m of text.matchAll(/\bt\(\s*`([^`$]*)\$\{/g)) prefixes.set(m[1], file);
  }
  return { literal, prefixes };
}

/** Argument names and tag names used anywhere in a message, nested plurals included. */
function shape(message: string): string[] {
  const found = new Set<string>();
  const walk = (elements: MessageFormatElement[]) => {
    for (const el of elements) {
      if (el.type === TYPE.argument || el.type === TYPE.number || el.type === TYPE.date || el.type === TYPE.time) {
        found.add(`{${el.value}}`);
      } else if (el.type === TYPE.plural || el.type === TYPE.select) {
        found.add(`{${el.value}}`);
        for (const option of Object.values(el.options)) walk(option.value);
      } else if (el.type === TYPE.tag) {
        found.add(`<${el.value}>`);
        walk(el.children);
      }
    }
  };
  walk(parse(message));
  return [...found].sort();
}

describe("the code uses only keys that exist", () => {
  const { literal, prefixes } = keysUsed();

  it("finds a healthy number of t() calls (the scanner works)", () => {
    expect(literal.size).toBeGreaterThan(350);
  });

  it.each([...literal.entries()])("%s (%s) is in en.json", (key) => {
    expect(en).toHaveProperty([key]);
  });

  it.each([...prefixes.entries()])("template key prefix %s (%s) matches catalog keys", (prefix) => {
    expect(enKeys.some((key) => key.startsWith(prefix))).toBe(true);
  });
});

describe("catalogs", () => {
  const files = fs
    .readdirSync(path.join(ROOT, "locales"))
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""));

  it("registers every catalog file, and only those", () => {
    expect(Object.keys(UI_CATALOGS).sort()).toEqual(files.sort());
    expect(UI_CATALOGS.en).toBeDefined();
  });

  describe.each(files)("%s", (tag) => {
    const catalog: Record<string, string> = JSON.parse(
      fs.readFileSync(path.join(ROOT, "locales", `${tag}.json`), "utf8")
    );

    it("has exactly en.json's keys", () => {
      expect(Object.keys(catalog).sort()).toEqual(enKeys);
    });

    it("has a non-empty string for every key", () => {
      for (const [key, value] of Object.entries(catalog)) {
        expect([key, typeof value === "string" && value.trim().length > 0]).toEqual([key, true]);
      }
    });

    it("parses as ICU and keeps every placeholder and tag of the English", () => {
      for (const key of enKeys) {
        expect([key, shape(catalog[key])]).toEqual([key, shape(en[key])]);
      }
    });
  });
});
