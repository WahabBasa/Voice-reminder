/**
 * Naming a language (OLD-133): the overlay's "Listening in …" label and the
 * unsupported-language card. Pinned with Intl.DisplayNames present, and with it
 * missing, because Hermes may not ship it.
 */
import { languageName, listeningLabel } from "../../lib/languageNames";

describe("languageName", () => {
  it("names a language from its code or from a full locale", () => {
    expect(languageName("sv")).toBe("Swedish");
    expect(languageName("en-US")).toBe("English");
    expect(languageName("ar_SA")).toBe("Arabic");
    expect(languageName("FR")).toBe("French");
  });

  it("returns null for nothing, junk, or a code no one can name", () => {
    expect(languageName(undefined)).toBeNull();
    expect(languageName(null)).toBeNull();
    expect(languageName("")).toBeNull();
    expect(languageName("12")).toBeNull();
    expect(languageName("zz")).toBeNull();
  });

  describe("without Intl.DisplayNames", () => {
    const original = (Intl as any).DisplayNames;
    beforeEach(() => {
      (Intl as any).DisplayNames = undefined;
    });
    afterEach(() => {
      (Intl as any).DisplayNames = original;
    });

    it("still names the common languages from its own table", () => {
      expect(languageName("sv")).toBe("Swedish");
      expect(languageName("ar-SA")).toBe("Arabic");
      expect(languageName("zz")).toBeNull();
    });
  });

  it("falls back to the table when Intl.DisplayNames throws", () => {
    const original = (Intl as any).DisplayNames;
    (Intl as any).DisplayNames = function () {
      throw new Error("unsupported");
    };
    try {
      expect(languageName("de")).toBe("German");
    } finally {
      (Intl as any).DisplayNames = original;
    }
  });
});

describe("listeningLabel", () => {
  it("names the on-device engine's language", () => {
    expect(listeningLabel("en-US")).toBe("Listening in English");
    expect(listeningLabel("ar-SA")).toBe("Listening in Arabic");
  });

  it("says nothing rather than guess", () => {
    expect(listeningLabel("")).toBeNull();
  });
});
