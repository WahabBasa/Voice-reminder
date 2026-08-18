import {
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

/**
 * A row as it was written before OLD-108 stripped the replay variants: base
 * line plus two variant lines with their mp3s and wavs. This is the shape the
 * dev and prod stores are full of, so it is the shape the read and delete paths
 * are tested against.
 */
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

// ─── reading a pre-OLD-108 row ──────────────────────────────────────────────
//
// The variant columns are deprecated, not deleted: rows written before the
// strip still carry `variants`, `variantAudioStorageIds` and
// `variantWavStorageIds`. Nothing resolves them into urls any more, and the
// read paths must not choke on their presence.

describe("get", () => {
  it("returns the base line's urls and no variant urls at all", async () => {
    const { ctx } = fakeCtx([reminderWithVariants()]);
    const result = await handlerOf(get)(ctx, { id: "reminder_1", deviceId: DEVICE });

    expect(result.audioUrl).toBe("https://cdn.test/audio_base");
    expect(result.wavUrl).toBe("https://cdn.test/wav_base");
    expect(result.variantAudioUrls).toBeUndefined();
    expect(result.variantWavUrls).toBeUndefined();
  });

  it("reads a legacy row without crashing on its variant columns", async () => {
    const { ctx } = fakeCtx([
      reminderWithVariants({ variantWavStorageIds: ["gone_v0", "wav_v1"] }),
    ]);
    const result = await handlerOf(get)(ctx, { id: "reminder_1", deviceId: DEVICE });

    // The raw columns ride through the document spread untouched — no url
    // resolution, no storage round trip, nothing downstream that reads them.
    expect(result.variants).toEqual([
      "Your medicine is still waiting.",
      "Please take your medicine now.",
    ]);
    expect(result.variantWavStorageIds).toEqual(["gone_v0", "wav_v1"]);
  });

  it("returns null for a missing reminder", async () => {
    const { ctx } = fakeCtx([]);
    expect(await handlerOf(get)(ctx, { id: "reminder_1", deviceId: DEVICE })).toBeNull();
  });
});

describe("list", () => {
  it("resolves no variant urls on any row", async () => {
    const { ctx } = fakeCtx([reminderWithVariants()]);
    const [row] = await handlerOf(list)(ctx, { deviceId: DEVICE });

    expect(row.audioUrl).toBe("https://cdn.test/audio_base");
    expect(row.variantAudioUrls).toBeUndefined();
    expect(row.variantWavUrls).toBeUndefined();
  });
});

// ─── persistence ────────────────────────────────────────────────────────────

describe("create", () => {
  it("persists the base line's audio ids", async () => {
    const { ctx, inserted } = fakeCtx();
    await handlerOf(create)(ctx, {
      deviceId: DEVICE,
      title: "Medicine",
      description: "Time to take your evening medicine.",
      time: "20:00",
      frequency: "daily",
      audioStorageId: "audio_base",
      wavStorageId: "wav_base",
    });

    expect(inserted[0].table).toBe("reminders");
    expect(inserted[0].doc.audioStorageId).toBe("audio_base");
    expect(inserted[0].doc.wavStorageId).toBe("wav_base");
    expect(inserted[0].doc).not.toHaveProperty("variants");
    expect(inserted[0].doc).not.toHaveProperty("variantAudioStorageIds");
    expect(inserted[0].doc).not.toHaveProperty("variantWavStorageIds");
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
  it("patches the base line through to the reminder", async () => {
    const { ctx, patched } = fakeCtx();
    await handlerOf(setAudio)(ctx, {
      id: "reminder_1",
      audioStorageId: "audio_base",
      wavStorageId: "wav_base",
      audioStatus: "ready",
      audioExtrasStatus: "pending",
    });

    expect(patched[0].id).toBe("reminder_1");
    expect(patched[0].updates.wavStorageId).toBe("wav_base");
    expect(patched[0].updates.audioStatus).toBe("ready");
  });

  // The pre-alert lands in its own patch (OLD-107) and must move only its own
  // status — an extras phase that failed never un-readies a stored base line.
  it("settles the pre-alert phase without touching audioStatus", async () => {
    const { ctx, patched } = fakeCtx();
    await handlerOf(setAudio)(ctx, {
      id: "reminder_1",
      preAudioStorageId: "audio_pre",
      audioExtrasStatus: "ready",
    });

    expect(patched[0].updates.preAudioStorageId).toBe("audio_pre");
    expect(patched[0].updates.audioExtrasStatus).toBe("ready");
    expect(patched[0].updates).not.toHaveProperty("audioStatus");
  });
});

// ─── cleanup ────────────────────────────────────────────────────────────────

describe("remove", () => {
  // Nothing writes variant blobs any more, but a legacy row still owns them,
  // and remove is the only thing that would ever free them (OLD-108).
  it("deletes every stored audio the reminder owns, retired variant blobs included", async () => {
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
