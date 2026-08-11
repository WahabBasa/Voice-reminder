import fs from "fs";
import path from "path";

/**
 * CL-2 tripwire — cadence ladder, native side.
 *
 * The Swift in `plugins/` is never executed by Jest and never compiled without a
 * Mac, so the only feedback loop short of a 15-minute EAS build is reading the
 * source. These suites read it: they pin the ordering guarantees the ladder
 * depends on (docs/cadence-ladder-prd.md § "Acknowledgment semantics") so that a
 * well-meaning edit to either intent shows up as a red test instead of a phone
 * that keeps reminding a user who already tapped Done.
 *
 * Assertions here are deliberately about ORDER and PRESENCE, not formatting: they
 * name symbols, not whitespace.
 */

const INTENTS_PATH = path.resolve(__dirname, "../../plugins/ios-src/VRAlarmIntents.swift");
const PLUGIN_PATH = path.resolve(__dirname, "../../plugins/withAlarmKit.js");

const intents = fs.readFileSync(INTENTS_PATH, "utf8");
const plugin = fs.readFileSync(PLUGIN_PATH, "utf8");

/** Source slice from `start` up to `end` (exclusive). Throws if either is absent. */
function slice(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  expect(from).toBeGreaterThanOrEqual(0);
  const to = source.indexOf(end, from + start.length);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

/** Index of `needle` within `haystack`, asserted present. */
function at(haystack: string, needle: string): number {
  const index = haystack.indexOf(needle);
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}

const stopIntent = slice(intents, "struct VRStopIntent", "// MARK: - Resolution helpers");
const snoozeIntent = slice(intents, "struct VRSnoozeIntent", "// MARK: - Stop");
const snoozePerform = slice(snoozeIntent, "func perform()", "private func scheduleFollowUp");
const followUp = snoozeIntent.slice(snoozeIntent.indexOf("private func scheduleFollowUp"));
const ladder = slice(intents, "enum VRAlarmLadder", "// MARK: - Alarm button configuration");
const scheduler = slice(plugin, "const VR_ALARM_SCHEDULER_SWIFT", "// INTENTS HOOK");

// ─── Group 1: the plugin ships the real intents ─────────────────────────────

describe("withAlarmKit plugin wiring", () => {
  it("prefers plugins/ios-src/VRAlarmIntents.swift over the AK-1 placeholder", () => {
    expect(fs.existsSync(INTENTS_PATH)).toBe(true);
    expect(plugin).toContain('path.join(projectRoot, "plugins", "ios-src", "VRAlarmIntents.swift")');
    expect(plugin).toContain("intentsSource = fs.readFileSync(overridePath");
  });

  it("compiles VRAlarmIntents.swift into the app target", () => {
    expect(plugin).toContain('{ name: "VRAlarmIntents.swift", contents: intentsSource }');
  });
});

// ─── Group 2: ladder metadata survives the round trip ───────────────────────

describe("ladder metadata reaches the intents", () => {
  it("the scheduler persists the whole metadata dict per app key — no key whitelist", () => {
    expect(scheduler).toContain('"metadata": metadata');
    expect(scheduler).toContain("VRAlarmStore.setMeta(appKey: appKey");
  });

  it("both scheduling paths write meta, so a follow-up rung is readable too", () => {
    const writes = scheduler.match(/VRAlarmStore\.setMeta\(appKey:/g) ?? [];
    expect(writes.length).toBeGreaterThanOrEqual(2);
  });

  it("the intents read siblings back out of that same record", () => {
    expect(intents).toContain('static let siblingsMetadataKey = "siblings"');
    expect(intents).toContain('static let rungMetadataKey = "rung"');
    expect(intents).toContain('static let rungCountMetadataKey = "rungCount"');
    expect(intents).toContain("static func storedSiblings(appKey: String) -> String?");
    expect(intents).toContain("VRAlarmIntentKeys.siblingsMetadataKey");
  });
});

// ─── Group 3: Stop — sibling cancel strictly after guard 2 ──────────────────

describe("VRStopIntent sibling cancel", () => {
  it("cancels the occurrence's other rungs", () => {
    expect(stopIntent).toContain("VRAlarmLadder.cancelSiblings(of: resolvedKey");
  });

  it("runs the cancel strictly AFTER the spurious-stop guard (PRD guard 2)", () => {
    const guard = at(stopIntent, "shouldRecordStop(");
    const guardReturn = at(stopIntent, "return .result()");
    const cancel = at(stopIntent, "VRAlarmLadder.cancelSiblings");
    expect(guard).toBeLessThan(cancel);
    // The guard's early return is the only `return .result()` before the cancel:
    // a spurious stop leaves the method without touching a single rung.
    expect(guardReturn).toBeLessThan(cancel);
  });

  it("keeps the guard as an early return, not a wrapper around the cancel", () => {
    expect(stopIntent).toMatch(/guard VRAlarmIntentGuards\.shouldRecordStop\([^)]*\) else \{\s*return \.result\(\)\s*\}/);
  });

  it("still records the stop event before cancelling anything", () => {
    expect(at(stopIntent, '"stopped"')).toBeLessThan(at(stopIntent, "VRAlarmLadder.cancelSiblings"));
  });

  it("keeps the existing registry + guard cleanup for the acknowledged rung", () => {
    expect(stopIntent).toContain("VRAlarmIntentStore.clearUUID(appKey: resolvedKey)");
    expect(stopIntent).toContain("VRAlarmIntentStore.clearSnoozeGuard(appKey: resolvedKey)");
  });
});

// ─── Group 4: Later — cancel before the follow-up is registered ─────────────

describe("VRSnoozeIntent sibling cancel", () => {
  it("cancels the occurrence's other rungs", () => {
    expect(snoozePerform).toContain("VRAlarmLadder.cancelSiblings(of: resolvedKey");
  });

  it("writes the snooze guard first, then cancels, then schedules the follow-up", () => {
    const guardWrite = at(snoozePerform, "writeSnoozeGuard(");
    const cancel = at(snoozePerform, "VRAlarmLadder.cancelSiblings");
    const scheduleCall = at(snoozePerform, "scheduleFollowUp(appKey: resolvedKey");
    expect(guardWrite).toBeLessThan(cancel);
    expect(cancel).toBeLessThan(scheduleCall);
  });

  it("keeps guard 4's 1s sleep last", () => {
    const scheduleCall = at(snoozePerform, "scheduleFollowUp(appKey: resolvedKey");
    expect(scheduleCall).toBeLessThan(at(snoozePerform, "Task.sleep(nanoseconds: 1_000_000_000)"));
  });

  it("leaves follow-up scheduling on the original app key (single alarm, no ladder)", () => {
    expect(followUp).toContain("VRFollowUpScheduler.scheduleAlarm(");
    expect(followUp).toContain("appKey: VRAlarmIntentGuards.followUpAppKey(originalAppKey: resolvedKey)");
    expect(followUp).not.toContain("cancelSiblings");
  });
});

// ─── Group 5: follow-up keys are never siblings ─────────────────────────────

describe("follow-up keys never enter a sibling list", () => {
  it("the follow-up reuses the rung's own key, which sibling parsing excludes", () => {
    expect(intents).toContain("static func followUpAppKey(originalAppKey: String) -> String");
    expect(intents).toContain("guard key != selfKey else { continue }");
    expect(intents).toContain("guard key != followUpAppKey(originalAppKey: selfKey) else { continue }");
  });

  it("only reminder app keys are ever handed to cancel", () => {
    expect(intents).toContain('static let appKeyPrefix = "reminder_"');
    expect(intents).toContain("guard key.hasPrefix(appKeyPrefix) else { continue }");
  });

  it("the follow-up's stored metadata carries no ladder keys forward", () => {
    expect(followUp).toContain("metadata.removeValue(forKey: VRAlarmIntentKeys.siblingsMetadataKey)");
    expect(followUp).toContain("metadata.removeValue(forKey: VRAlarmIntentKeys.rungMetadataKey)");
    expect(followUp).toContain("metadata.removeValue(forKey: VRAlarmIntentKeys.rungCountMetadataKey)");
  });

  it("cancelSiblings always excludes the key it was invoked for", () => {
    expect(ladder).toContain("excluding: resolvedKey");
  });
});

// ─── Group 6: cancel reuses the scheduler, logs, and cleans up ──────────────

describe("sibling cancel mechanics", () => {
  it("delegates to the scheduler's rotation-aware cancel instead of re-implementing it", () => {
    expect(ladder).toContain("VRFollowUpScheduler.cancel(appKey: key)");
    expect(ladder).not.toContain("AlarmManager");
  });

  it("declares cancel on the AK-1 integration seam", () => {
    const seam = intents.slice(intents.indexOf("protocol VRAlarmFollowUpScheduling"));
    expect(seam).toContain("static func cancel(appKey: String)");
  });

  it("the scheduler's cancel resolves the CURRENT uuid and evicts both records", () => {
    expect(scheduler).toContain("static func cancel(appKey: String) {");
    expect(scheduler).toContain("guard let uuid = VRAlarmStore.uuid(forAppKey: appKey) else { return }");
    expect(scheduler).toContain("VRAlarmStore.setUUID(nil, fireDate: nil, forAppKey: appKey)");
    expect(scheduler).toContain("VRAlarmStore.clearMeta(appKey: appKey)");
  });

  it("logs one event per cancelled rung into the drained event log", () => {
    expect(intents).toContain('static let siblingCancelledEvent = "sibling_cancelled"');
    expect(ladder).toContain("VRAlarmIntentStore.appendEvent(");
    expect(ladder).toContain("type: VRAlarmIntentKeys.siblingCancelledEvent");
    expect(ladder).toContain("id: key");
  });

  it("only logs rungs that were actually still scheduled", () => {
    expect(ladder).toContain("let wasScheduled = registry[key] != nil");
    expect(at(ladder, "guard wasScheduled else { continue }")).toBeLessThan(
      at(ladder, "VRAlarmIntentStore.appendEvent(")
    );
  });

  it("evicts the cancelled rung's stored metadata and guard key", () => {
    expect(ladder).toContain("VRAlarmIntentStore.clearMeta(appKey: key)");
    expect(ladder).toContain("VRAlarmIntentStore.clearSnoozeGuard(appKey: key)");
    expect(intents).toContain("static func clearMeta(appKey: String)");
  });

  it("writes events in the shape the JS drain reads (JSON string, not a plist array)", () => {
    // AK-1 drains with string(forKey:) — an array under this key is invisible to JS.
    expect(scheduler).toContain("defaults.string(forKey: eventsKey)");
    const append = slice(intents, "static func appendEvent(", "// MARK: UUID registry");
    expect(at(append, "JSONSerialization.data(withJSONObject: events")).toBeLessThan(
      at(append, "store.set(json, forKey: VRAlarmIntentKeys.events)")
    );
  });
});

// ─── Group 7: executable spec for the pure sibling parsing ──────────────────

/**
 * TypeScript mirror of `VRAlarmIntentGuards.siblingKeys`. Nothing imports it — it
 * exists so the Swift's semantics are stated once in a language this suite can
 * actually run, and so a behavioral change to the Swift has to be reflected here
 * deliberately. The Swift carries the same table in its `selfTestFailures()`.
 */
function siblingKeys(rawSiblings: string | null, selfKey: string): string[] {
  if (!rawSiblings) return [];
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const piece of rawSiblings.split(",")) {
    const key = piece.trim();
    if (!key) continue;
    if (key === selfKey) continue;
    if (!key.startsWith("reminder_")) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

describe("sibling list parsing (mirror of the Swift guard)", () => {
  const rung0 = "reminder_a_1000";
  const rung1 = "reminder_a_1180000";
  const rung2 = "reminder_a_1420000";

  it("no metadata means nothing to cancel — pre-ladder alarms behave as before", () => {
    expect(siblingKeys(null, rung0)).toEqual([]);
    expect(siblingKeys("", rung0)).toEqual([]);
  });

  it("Done on rung 0 of an urgent ladder cancels both remaining rungs", () => {
    expect(siblingKeys(`${rung1},${rung2}`, rung0)).toEqual([rung1, rung2]);
  });

  it("Done on the middle rung cancels the outer two", () => {
    expect(siblingKeys(`${rung0},${rung2}`, rung1)).toEqual([rung0, rung2]);
  });

  it("tolerates whitespace, blanks and duplicates", () => {
    expect(siblingKeys(` ${rung1} , , ${rung1} `, rung0)).toEqual([rung1]);
  });

  it("never cancels the key it was invoked for (that is the follow-up's key)", () => {
    expect(siblingKeys(`${rung0},${rung1}`, rung0)).toEqual([rung1]);
  });

  it("never hands a non-reminder key to cancel", () => {
    expect(siblingKeys(`snooze_until_${rung1},${rung1}`, rung0)).toEqual([rung1]);
  });
});
