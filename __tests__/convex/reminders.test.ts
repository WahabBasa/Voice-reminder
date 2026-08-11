import { create, get, list, remove, setAudio } from "../../convex/reminders";

// Convex registered functions keep the raw handler on `_handler`; calling that
// with a fake ctx exercises the real query/mutation bodies without a backend.
type Handler = (ctx: any, args: any) => Promise<any>;
const handlerOf = (fn: unknown): Handler => (fn as { _handler: Handler })._handler;

type FakeReminder = Record<string, any>;

/**
 * Minimal ctx: storage urls are derived from the id, and an id starting with
 * "gone_" resolves to null the way a deleted storage object would.
 */
function fakeCtx(reminders: FakeReminder[] = []) {
  const deletedStorageIds: string[] = [];
  const inserted: Array<{ table: string; doc: any }> = [];
  const patched: Array<{ id: string; updates: any }> = [];
  const deletedDocs: string[] = [];

  const ctx = {
    db: {
      get: async (id: string) => reminders.find((r) => r._id === id) ?? null,
      query: (_table: string) => ({
        order: (_direction: string) => ({ collect: async () => reminders }),
      }),
      insert: async (table: string, doc: any) => {
        inserted.push({ table, doc });
        return "reminder_1";
      },
      patch: async (id: string, updates: any) => {
        patched.push({ id, updates });
      },
      delete: async (id: string) => {
        deletedDocs.push(id);
      },
    },
    storage: {
      getUrl: async (id: string) =>
        id.startsWith("gone_") ? null : `https://cdn.test/${id}`,
      delete: async (id: string) => {
        deletedStorageIds.push(id);
      },
    },
  };

  return { ctx, deletedStorageIds, inserted, patched, deletedDocs };
}

const reminderWithVariants = (overrides: FakeReminder = {}): FakeReminder => ({
  _id: "reminder_1",
  title: "Medicine",
  description: "Time to take your evening medicine.",
  audioStorageId: "audio_base",
  wavStorageId: "wav_base",
  variants: ["Your medicine is still waiting.", "Please take your medicine now."],
  variantAudioStorageIds: ["audio_v0", "audio_v1"],
  variantWavStorageIds: ["wav_v0", "wav_v1"],
  ...overrides,
});

// ─── variantWavUrls exposure ────────────────────────────────────────────────

describe("get", () => {
  it("exposes a variant wav url per stored variant wav", async () => {
    const { ctx } = fakeCtx([reminderWithVariants()]);
    const result = await handlerOf(get)(ctx, { id: "reminder_1" });

    expect(result.variantWavUrls).toEqual([
      "https://cdn.test/wav_v0",
      "https://cdn.test/wav_v1",
    ]);
    expect(result.wavUrl).toBe("https://cdn.test/wav_base");
  });

  it("keeps a hole in place so rung k still maps to variant k-1", async () => {
    const { ctx } = fakeCtx([
      reminderWithVariants({ variantWavStorageIds: ["gone_v0", "wav_v1"] }),
    ]);
    const result = await handlerOf(get)(ctx, { id: "reminder_1" });

    expect(result.variantWavUrls).toEqual([null, "https://cdn.test/wav_v1"]);
    // The mp3 list still drops nulls — replay picks lines, not rungs.
    expect(result.variantAudioUrls).toEqual([
      "https://cdn.test/audio_v0",
      "https://cdn.test/audio_v1",
    ]);
  });

  it("returns an empty list for a reminder with no variant wavs", async () => {
    const { ctx } = fakeCtx([
      reminderWithVariants({ variantWavStorageIds: undefined }),
    ]);
    const result = await handlerOf(get)(ctx, { id: "reminder_1" });
    expect(result.variantWavUrls).toEqual([]);
  });

  it("returns null for a missing reminder", async () => {
    const { ctx } = fakeCtx([]);
    expect(await handlerOf(get)(ctx, { id: "reminder_1" })).toBeNull();
  });
});

describe("list", () => {
  it("exposes variant wav urls on every row", async () => {
    const { ctx } = fakeCtx([reminderWithVariants()]);
    const [row] = await handlerOf(list)(ctx, {});

    expect(row.variantWavUrls).toEqual([
      "https://cdn.test/wav_v0",
      "https://cdn.test/wav_v1",
    ]);
  });
});

// ─── persistence ────────────────────────────────────────────────────────────

describe("create", () => {
  it("persists variant wav ids alongside the variant mp3s", async () => {
    const { ctx, inserted } = fakeCtx();
    await handlerOf(create)(ctx, {
      title: "Medicine",
      description: "Time to take your evening medicine.",
      time: "20:00",
      frequency: "daily",
      variants: ["Your medicine is still waiting."],
      variantAudioStorageIds: ["audio_v0"],
      variantWavStorageIds: ["wav_v0"],
    });

    expect(inserted[0].table).toBe("reminders");
    expect(inserted[0].doc.variantWavStorageIds).toEqual(["wav_v0"]);
    expect(inserted[0].doc.variantAudioStorageIds).toEqual(["audio_v0"]);
  });
});

describe("setAudio", () => {
  it("patches variant wav ids through to the reminder", async () => {
    const { ctx, patched } = fakeCtx();
    await handlerOf(setAudio)(ctx, {
      id: "reminder_1",
      audioStorageId: "audio_base",
      wavStorageId: "wav_base",
      variants: ["Your medicine is still waiting."],
      variantAudioStorageIds: ["audio_v0"],
      variantWavStorageIds: ["wav_v0"],
      audioStatus: "ready",
    });

    expect(patched[0].id).toBe("reminder_1");
    expect(patched[0].updates.variantWavStorageIds).toEqual(["wav_v0"]);
  });
});

// ─── cleanup ────────────────────────────────────────────────────────────────

describe("remove", () => {
  it("deletes every stored audio the reminder owns, wavs included", async () => {
    const { ctx, deletedStorageIds, deletedDocs } = fakeCtx([
      reminderWithVariants({ preAudioStorageId: "audio_pre" }),
    ]);
    await handlerOf(remove)(ctx, { id: "reminder_1" });

    expect(deletedStorageIds.sort()).toEqual(
      [
        "audio_base",
        "audio_pre",
        "audio_v0",
        "audio_v1",
        "wav_base",
        "wav_v0",
        "wav_v1",
      ].sort()
    );
    expect(deletedDocs).toEqual(["reminder_1"]);
  });

  it("copes with a reminder that never got any audio", async () => {
    const { ctx, deletedStorageIds, deletedDocs } = fakeCtx([{ _id: "reminder_1" }]);
    await handlerOf(remove)(ctx, { id: "reminder_1" });

    expect(deletedStorageIds).toEqual([]);
    expect(deletedDocs).toEqual(["reminder_1"]);
  });

  it("does nothing for a reminder that is already gone", async () => {
    const { ctx, deletedDocs } = fakeCtx([]);
    await handlerOf(remove)(ctx, { id: "reminder_1" });
    expect(deletedDocs).toEqual([]);
  });
});
