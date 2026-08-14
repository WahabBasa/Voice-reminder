import {
  claimSpeechCatches,
  create,
  get,
  list,
  remove,
  setAudio,
  update,
} from "../../convex/reminders";

// Convex registered functions keep the raw handler on `_handler`; calling that
// with a fake ctx exercises the real query/mutation bodies without a backend.
type Handler = (ctx: any, args: any) => Promise<any>;
const handlerOf = (fn: unknown): Handler => (fn as { _handler: Handler })._handler;

type FakeReminder = Record<string, any>;

const DEVICE = "device_a";
const OTHER_DEVICE = "device_b";

/**
 * Minimal ctx: storage urls are derived from the id, and an id starting with
 * "gone_" resolves to null the way a deleted storage object would.
 *
 * `withIndex` stands in for the by_device index: it applies the same equality
 * the real index would, so a query that forgot to scope shows up as a test
 * failure rather than a passing full-table scan.
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
        withIndex: (_index: string, build: (q: any) => { field: string; value: any }) => {
          const { field, value } = build({
            eq: (f: string, val: any) => ({ field: f, value: val }),
          });
          const matched = reminders.filter((r) => r[field] === value);
          return {
            order: (_direction: string) => ({ collect: async () => matched }),
            first: async () => matched[0] ?? null,
          };
        },
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
  deviceId: DEVICE,
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
    const result = await handlerOf(get)(ctx, { id: "reminder_1", deviceId: DEVICE });

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
    const result = await handlerOf(get)(ctx, { id: "reminder_1", deviceId: DEVICE });

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
    const result = await handlerOf(get)(ctx, { id: "reminder_1", deviceId: DEVICE });
    expect(result.variantWavUrls).toEqual([]);
  });

  it("returns null for a missing reminder", async () => {
    const { ctx } = fakeCtx([]);
    expect(await handlerOf(get)(ctx, { id: "reminder_1", deviceId: DEVICE })).toBeNull();
  });
});

describe("list", () => {
  it("exposes variant wav urls on every row", async () => {
    const { ctx } = fakeCtx([reminderWithVariants()]);
    const [row] = await handlerOf(list)(ctx, { deviceId: DEVICE });

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
      deviceId: DEVICE,
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

  it("stamps the owning device onto the row", async () => {
    const { ctx, inserted } = fakeCtx();
    await handlerOf(create)(ctx, {
      deviceId: DEVICE,
      title: "Medicine",
      description: "Time to take your evening medicine.",
      time: "20:00",
      frequency: "daily",
    });

    expect(inserted[0].doc.deviceId).toBe(DEVICE);
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
    await handlerOf(remove)(ctx, { id: "reminder_1", deviceId: DEVICE });

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
    const { ctx, deletedStorageIds, deletedDocs } = fakeCtx([
      { _id: "reminder_1", deviceId: DEVICE },
    ]);
    await handlerOf(remove)(ctx, { id: "reminder_1", deviceId: DEVICE });

    expect(deletedStorageIds).toEqual([]);
    expect(deletedDocs).toEqual(["reminder_1"]);
  });

  it("does nothing for a reminder that is already gone", async () => {
    const { ctx, deletedDocs } = fakeCtx([]);
    await handlerOf(remove)(ctx, { id: "reminder_1", deviceId: DEVICE });
    expect(deletedDocs).toEqual([]);
  });
});

// ─── device scoping (OLD-74) ────────────────────────────────────────────────

describe("device scoping", () => {
  const otherDeviceRow = reminderWithVariants({
    _id: "reminder_other",
    deviceId: OTHER_DEVICE,
  });
  // Written before scoping existed: unowned, so nobody enumerates it.
  const legacyRow = reminderWithVariants({
    _id: "reminder_legacy",
    deviceId: undefined,
  });

  it("list returns only the calling device's reminders", async () => {
    const { ctx } = fakeCtx([reminderWithVariants(), otherDeviceRow]);
    const rows = await handlerOf(list)(ctx, { deviceId: DEVICE });

    expect(rows.map((r: any) => r._id)).toEqual(["reminder_1"]);
  });

  it("list hands a device with no reminders an empty list, not everyone's", async () => {
    const { ctx } = fakeCtx([reminderWithVariants(), otherDeviceRow]);
    expect(await handlerOf(list)(ctx, { deviceId: "device_c" })).toEqual([]);
  });

  it("list never surfaces legacy rows that belong to nobody", async () => {
    const { ctx } = fakeCtx([legacyRow]);
    expect(await handlerOf(list)(ctx, { deviceId: DEVICE })).toEqual([]);
  });

  it("get treats another device's reminder as missing", async () => {
    const { ctx } = fakeCtx([otherDeviceRow]);
    expect(
      await handlerOf(get)(ctx, { id: "reminder_other", deviceId: DEVICE })
    ).toBeNull();
  });

  it("get still serves a legacy row to a caller holding its id", async () => {
    const { ctx } = fakeCtx([legacyRow]);
    const result = await handlerOf(get)(ctx, {
      id: "reminder_legacy",
      deviceId: DEVICE,
    });

    expect(result.wavUrl).toBe("https://cdn.test/wav_base");
  });

  it("remove leaves another device's reminder and its audio alone", async () => {
    const { ctx, deletedStorageIds, deletedDocs } = fakeCtx([otherDeviceRow]);
    await handlerOf(remove)(ctx, { id: "reminder_other", deviceId: DEVICE });

    expect(deletedDocs).toEqual([]);
    expect(deletedStorageIds).toEqual([]);
  });

  it("remove still cleans up a legacy row so its audio is not orphaned", async () => {
    const { ctx, deletedDocs } = fakeCtx([legacyRow]);
    await handlerOf(remove)(ctx, { id: "reminder_legacy", deviceId: DEVICE });

    expect(deletedDocs).toEqual(["reminder_legacy"]);
  });

  it("update refuses to touch another device's reminder", async () => {
    const { ctx, patched } = fakeCtx([otherDeviceRow]);
    await handlerOf(update)(ctx, {
      id: "reminder_other",
      deviceId: DEVICE,
      title: "Hijacked",
      description: "Hijacked",
      time: "09:00",
      frequency: "daily",
    });

    expect(patched).toEqual([]);
  });

  it("update claims a legacy row for the editing device", async () => {
    const { ctx, patched } = fakeCtx([legacyRow]);
    await handlerOf(update)(ctx, {
      id: "reminder_legacy",
      deviceId: DEVICE,
      title: "Medicine",
      description: "Time to take your evening medicine.",
      time: "09:00",
      frequency: "daily",
    });

    expect(patched[0].id).toBe("reminder_legacy");
    expect(patched[0].updates.deviceId).toBe(DEVICE);
    expect(patched[0].updates.title).toBe("Medicine");
  });

  it("update patches the owning device's own reminder", async () => {
    const { ctx, patched } = fakeCtx([reminderWithVariants()]);
    await handlerOf(update)(ctx, {
      id: "reminder_1",
      deviceId: DEVICE,
      title: "Evening medicine",
      description: "Time to take your evening medicine.",
      time: "21:00",
      frequency: "daily",
    });

    expect(patched[0].updates.title).toBe("Evening medicine");
    expect(patched[0].updates.time).toBe("21:00");
  });

  it("update does nothing for a reminder that is already gone", async () => {
    const { ctx, patched } = fakeCtx([]);
    await handlerOf(update)(ctx, {
      id: "reminder_1",
      deviceId: DEVICE,
      title: "Medicine",
      description: "Time to take your evening medicine.",
      time: "09:00",
      frequency: "daily",
    });

    expect(patched).toEqual([]);
  });
});

// ─── spoken-catch rotation (convex/speechCatch.ts) ──────────────────────────

describe("claimSpeechCatches", () => {
  // Rotation rows are keyed by device the same way reminders are; the fake ctx
  // is table-agnostic, so a row here stands in for a speechCatchState document.
  const catchState = (lastCatchId: string) => ({
    _id: "catch_state_1",
    deviceId: DEVICE,
    lastCatchId,
    updatedAt: 1,
  });

  it("skips the catch this device heard last", async () => {
    const { ctx } = fakeCtx([catchState("en.heads-up")]);
    const chosen = await handlerOf(claimSpeechCatches)(ctx, {
      deviceId: DEVICE,
      candidateIds: ["en.heads-up", "en.remember", "en.one-thing"],
      count: 1,
    });

    expect(chosen).toEqual(["en.remember"]);
  });

  it("records the last catch it handed out", async () => {
    const { ctx, patched } = fakeCtx([catchState("en.heads-up")]);
    await handlerOf(claimSpeechCatches)(ctx, {
      deviceId: DEVICE,
      candidateIds: ["en.heads-up", "en.remember", "en.one-thing"],
      count: 2,
    });

    expect(patched[0].id).toBe("catch_state_1");
    expect(patched[0].updates.lastCatchId).toBe("en.one-thing");
  });

  it("gives the heads-up and the main line different catches", async () => {
    const { ctx } = fakeCtx([catchState("ar.lahza")]);
    const chosen = await handlerOf(claimSpeechCatches)(ctx, {
      deviceId: DEVICE,
      candidateIds: ["ar.lahza", "ar.intabih", "ar.tathakkar"],
      count: 2,
    });

    expect(chosen).toEqual(["ar.intabih", "ar.tathakkar"]);
    expect(new Set(chosen).size).toBe(2);
  });

  it("starts a rotation row for a device that has none", async () => {
    const { ctx, inserted, patched } = fakeCtx([]);
    const chosen = await handlerOf(claimSpeechCatches)(ctx, {
      deviceId: DEVICE,
      candidateIds: ["en.heads-up", "en.remember"],
      count: 1,
    });

    expect(chosen).toEqual(["en.heads-up"]);
    expect(patched).toEqual([]);
    expect(inserted[0].table).toBe("speechCatchState");
    expect(inserted[0].doc).toMatchObject({ deviceId: DEVICE, lastCatchId: "en.heads-up" });
  });

  it("reads only its own device's rotation state", async () => {
    const { ctx } = fakeCtx([
      { _id: "catch_state_2", deviceId: OTHER_DEVICE, lastCatchId: "en.heads-up", updatedAt: 1 },
    ]);
    const chosen = await handlerOf(claimSpeechCatches)(ctx, {
      deviceId: DEVICE,
      candidateIds: ["en.heads-up", "en.remember"],
      count: 1,
    });

    expect(chosen).toEqual(["en.heads-up"]);
  });

  it("writes nothing when there is no catch to hand out", async () => {
    const { ctx, inserted, patched } = fakeCtx([catchState("en.heads-up")]);
    const chosen = await handlerOf(claimSpeechCatches)(ctx, {
      deviceId: DEVICE,
      candidateIds: [],
      count: 2,
    });

    expect(chosen).toEqual([]);
    expect(inserted).toEqual([]);
    expect(patched).toEqual([]);
  });
});
