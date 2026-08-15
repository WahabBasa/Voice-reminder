import fs from "fs";
import path from "path";

/**
 * OLD-96 tripwire — the snooze-nag, native side.
 *
 * The Swift in `plugins/` is never executed by Jest and never compiled without a
 * Mac, so the only feedback loop short of a 15-minute EAS build is reading the
 * source. These suites read it: they pin the guarantees the nag depends on
 * (docs/alarmkit-focus-breakthrough.md §7) so that a well-meaning edit to either
 * intent shows up as a red test instead of a phone that keeps reminding a user
 * who already tapped Done — or one that never stops snoozing.
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
const chain = slice(intents, "enum VRAlarmNagChain", "// MARK: - Alarm button configuration");
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

// ─── Group 2: the nag is NOT built on the system countdown ──────────────────
//
// docs/alarmkit-focus-breakthrough.md §7: the system snooze is wired to the
// SECONDARY button, so `.countdown` + `postAlert` cannot express "dismiss, then
// come back". Adopting it would also cost a widget extension and displace
// VRSnoozeIntent. Every one of these names appearing in the scheduler is a
// regression, not a feature.

describe("the nag never rides the system countdown", () => {
  it("sets no countdownDuration, preAlert or postAlert anywhere", () => {
    for (const token of ["countdownDuration", "postAlert", "preAlert"]) {
      expect(scheduler).not.toContain(token);
      expect(intents).not.toContain(token);
    }
  });

  it("keeps the secondary button on .custom so VRSnoozeIntent actually runs", () => {
    expect(scheduler).toContain("secondaryButtonBehavior: .custom");
    expect(scheduler).not.toContain("secondaryButtonBehavior: .countdown");
    expect(intents).toContain(
      "static let secondaryButtonBehavior: AlarmPresentation.Alert.SecondaryButtonBehavior = .custom"
    );
  });

  it("schedules plain fixed-date alarms, which is what a pre-scheduled chain needs", () => {
    expect(scheduler).toContain("schedule: .fixed(fireDate)");
  });
});

// ─── Group 3: chain metadata survives the round trip ────────────────────────

describe("chain metadata reaches the intents", () => {
  it("the scheduler persists the whole metadata dict per app key — no key whitelist", () => {
    expect(scheduler).toContain('"metadata": metadata');
    expect(scheduler).toContain("VRAlarmStore.setMeta(appKey: appKey");
  });

  it("both scheduling paths write meta, so a follow-up is readable too", () => {
    const writes = scheduler.match(/VRAlarmStore\.setMeta\(appKey:/g) ?? [];
    expect(writes.length).toBeGreaterThanOrEqual(2);
  });

  it("both scheduling paths record the fire time the chain check reads", () => {
    const writes = scheduler.match(/VRAlarmStore\.setUUID\(alarmID, fireDate:/g) ?? [];
    expect(writes.length).toBeGreaterThanOrEqual(2);
    expect(scheduler).toContain('static let fireDatesKey = "vr_alarm_firedates"');
    expect(intents).toContain('static let fireDates = "vr_alarm_firedates"');
    expect(intents).toContain("static func fireDateMillis(appKey: String) -> Int?");
  });

  it("the intents read the chain keys back out of that same record", () => {
    expect(intents).toContain('static let siblingsMetadataKey = "siblings"');
    expect(intents).toContain('static let nagIndexMetadataKey = "nagIndex"');
    expect(intents).toContain('static let nagMaxMetadataKey = "nagMax"');
    expect(intents).toContain('static let nagForMetadataKey = "nagFor"');
    expect(intents).toContain("static func storedSiblings(appKey: String) -> String?");
    expect(intents).toContain("VRAlarmIntentKeys.siblingsMetadataKey");
  });
});

// ─── Group 4: Stop — chain cancel strictly after guard 2 ────────────────────

describe("VRStopIntent ends the chain", () => {
  it("cancels the ring's remaining comebacks", () => {
    expect(stopIntent).toContain("VRAlarmNagChain.cancelSiblings(of: resolvedKey");
  });

  it("runs the cancel strictly AFTER the spurious-stop guard (PRD guard 2)", () => {
    const guard = at(stopIntent, "shouldRecordStop(");
    const guardReturn = at(stopIntent, "return .result()");
    const cancel = at(stopIntent, "VRAlarmNagChain.cancelSiblings");
    expect(guard).toBeLessThan(cancel);
    // The guard's early return is the only `return .result()` before the cancel:
    // a spurious stop leaves the method without touching a single alarm.
    expect(guardReturn).toBeLessThan(cancel);
  });

  it("keeps the guard as an early return, not a wrapper around the cancel", () => {
    expect(stopIntent).toMatch(/guard VRAlarmIntentGuards\.shouldRecordStop\([^)]*\) else \{\s*return \.result\(\)\s*\}/);
  });

  it("still records the stop event before cancelling anything", () => {
    expect(at(stopIntent, '"stopped"')).toBeLessThan(at(stopIntent, "VRAlarmNagChain.cancelSiblings"));
  });

  it("keeps the existing registry + guard cleanup for the acknowledged ring", () => {
    expect(stopIntent).toContain("VRAlarmIntentStore.clearUUID(appKey: resolvedKey)");
    expect(stopIntent).toContain("VRAlarmIntentStore.clearSnoozeGuard(appKey: resolvedKey)");
  });

  it("never schedules anything — Done is the end of the chain", () => {
    expect(stopIntent).not.toContain("scheduleAlarm(");
    expect(stopIntent).not.toContain("scheduleFollowUp");
  });
});

// ─── Group 5: Later — leaves the pre-scheduled chain standing ───────────────

describe("VRSnoozeIntent rides the pre-scheduled chain", () => {
  it("does NOT cancel the siblings — they ARE the comebacks the user asked for", () => {
    // Cancelling here would collapse three owed comebacks into one and hand the
    // counter back to zero, which is how the snooze button became unbounded.
    expect(snoozePerform).not.toContain("cancelSiblings");
  });

  it("only arms a follow-up when the chain owes nothing", () => {
    expect(snoozePerform).toContain("VRAlarmNagChain.owedComebackCount(of: resolvedKey");
    expect(snoozePerform).toMatch(
      /owedComebackCount\(of: resolvedKey, afterMillis: nowMillis\) == 0 \{\s*scheduleFollowUp\(/
    );
  });

  it("counts only siblings that are registered AND still in the future", () => {
    expect(chain).toContain("static func owedComebackCount(of resolvedKey: String, afterMillis: Int) -> Int");
    expect(chain).toContain("registry[key] != nil");
    expect(chain).toContain("fireDate > afterMillis");
  });

  it("writes the snooze guard before anything else (PRD guard 1)", () => {
    const guardWrite = at(snoozePerform, "writeSnoozeGuard(");
    expect(guardWrite).toBeLessThan(at(snoozePerform, 'appendEvent(\n            type: "snoozed"'));
    expect(guardWrite).toBeLessThan(at(snoozePerform, "owedComebackCount("));
  });

  it("keeps guard 4's 1s sleep last", () => {
    const scheduleCall = at(snoozePerform, "scheduleFollowUp(appKey: resolvedKey");
    expect(scheduleCall).toBeLessThan(at(snoozePerform, "Task.sleep(nanoseconds: 1_000_000_000)"));
  });
});

// ─── Group 6: the cap on the native snooze ──────────────────────────────────

describe("the follow-up is capped", () => {
  it("refuses to arm past the allowance before doing any other work", () => {
    const capGuard = at(followUp, "guard VRAlarmIntentGuards.shouldNagAgain(");
    expect(capGuard).toBeLessThan(at(followUp, "VRFollowUpScheduler.scheduleAlarm("));
    expect(followUp).toMatch(
      /guard VRAlarmIntentGuards\.shouldNagAgain\(nagIndex: delivered, nagMax: allowance\) else \{ return \}/
    );
  });

  it("carries the incremented counter forward on the reused app key", () => {
    // The follow-up reuses the ring's key, so its metadata is what the NEXT tap
    // reads back — without the increment the chain never terminates.
    expect(followUp).toContain("VRAlarmIntentGuards.nagIndex(metadata: metadata)");
    expect(followUp).toContain("metadata[VRAlarmIntentKeys.nagIndexMetadataKey] = String(delivered + 1)");
    expect(followUp).toContain("metadata[VRAlarmIntentKeys.nagMaxMetadataKey] = String(allowance)");
    expect(followUp).toContain("appKey: VRAlarmIntentGuards.followUpAppKey(originalAppKey: resolvedKey)");
  });

  it("mirrors the JS cap and treats a missing counter as zero", () => {
    expect(intents).toContain("static let defaultNagMax = 3");
    expect(intents).toContain("static func nagIndex(metadata: [String: String]) -> Int");
    expect(intents).toContain("static func nagMax(metadata: [String: String]) -> Int");
    expect(intents).toContain("static func shouldNagAgain(nagIndex: Int, nagMax: Int) -> Bool");
  });

  it("drops the sibling list so the follow-up is not itself a chain member", () => {
    expect(followUp).toContain("metadata.removeValue(forKey: VRAlarmIntentKeys.siblingsMetadataKey)");
    expect(followUp).not.toContain("cancelSiblings");
  });
});

// ─── Group 7: only real alarm keys ever reach cancel ────────────────────────

describe("key families", () => {
  it("accepts both the occurrence and the comeback prefix", () => {
    expect(intents).toContain('static let appKeyPrefix = "reminder_"');
    expect(intents).toContain('static let nagKeyPrefix = "snooze_"');
    expect(intents).toContain("guard isCancellableAlarmKey(key) else { continue }");
  });

  it("keeps the snooze GUARD key out of cancel even though it shares the prefix", () => {
    expect(intents).toContain(
      "if key.hasPrefix(VRAlarmIntentKeys.snoozeGuardPrefix) { return false }"
    );
  });

  it("the follow-up reuses the ring's own key, which sibling parsing excludes", () => {
    expect(intents).toContain("static func followUpAppKey(originalAppKey: String) -> String");
    expect(intents).toContain("guard key != selfKey else { continue }");
    expect(intents).toContain("guard key != followUpAppKey(originalAppKey: selfKey) else { continue }");
  });

  it("cancelSiblings always excludes the key it was invoked for", () => {
    expect(chain).toContain("excluding: resolvedKey");
  });
});

// ─── Group 8: cancel reuses the scheduler, logs, and cleans up ──────────────

describe("chain cancel mechanics", () => {
  it("delegates to the scheduler's rotation-aware cancel instead of re-implementing it", () => {
    expect(chain).toContain("VRFollowUpScheduler.cancel(appKey: key)");
    expect(chain).not.toContain("AlarmManager");
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

  it("logs one event per cancelled ring into the drained event log", () => {
    expect(intents).toContain('static let siblingCancelledEvent = "sibling_cancelled"');
    expect(chain).toContain("VRAlarmIntentStore.appendEvent(");
    expect(chain).toContain("type: VRAlarmIntentKeys.siblingCancelledEvent");
    expect(chain).toContain("id: key");
  });

  it("only logs rings that were actually still scheduled", () => {
    expect(chain).toContain("let wasScheduled = registry[key] != nil");
    expect(at(chain, "guard wasScheduled else { continue }")).toBeLessThan(
      at(chain, "VRAlarmIntentStore.appendEvent(")
    );
  });

  it("evicts the cancelled ring's stored metadata and guard key", () => {
    expect(chain).toContain("VRAlarmIntentStore.clearMeta(appKey: key)");
    expect(chain).toContain("VRAlarmIntentStore.clearSnoozeGuard(appKey: key)");
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

// ─── Group 9: executable spec for the pure Swift logic ──────────────────────

/**
 * TypeScript mirrors of `VRAlarmIntentGuards`. Nothing imports them — they exist
 * so the Swift's semantics are stated once in a language this suite can actually
 * run, and so a behavioral change to the Swift has to be reflected here
 * deliberately. The Swift carries the same tables in its `selfTestFailures()`.
 */
function isCancellableAlarmKey(key: string): boolean {
  if (key.startsWith("snooze_until_")) return false;
  return key.startsWith("reminder_") || key.startsWith("snooze_");
}

function siblingKeys(rawSiblings: string | null, selfKey: string): string[] {
  if (!rawSiblings) return [];
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const piece of rawSiblings.split(",")) {
    const key = piece.trim();
    if (!key) continue;
    if (key === selfKey) continue;
    if (!isCancellableAlarmKey(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

const DEFAULT_NAG_MAX = 3;

function nagIndex(metadata: Record<string, string>): number {
  const value = Number.parseInt(metadata.nagIndex ?? "", 10);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function nagMax(metadata: Record<string, string>): number {
  const value = Number.parseInt(metadata.nagMax ?? "", 10);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_NAG_MAX;
  return Math.min(value, DEFAULT_NAG_MAX);
}

describe("sibling list parsing (mirror of the Swift guard)", () => {
  const occurrence = "reminder_a_1000";
  const comeback1 = "snooze_a_301000";
  const comeback2 = "snooze_a_601000";
  const comeback3 = "snooze_a_901000";

  it("no metadata means nothing to cancel — a chainless alarm behaves as before", () => {
    expect(siblingKeys(null, occurrence)).toEqual([]);
    expect(siblingKeys("", occurrence)).toEqual([]);
  });

  it("Done on the occurrence cancels all three comebacks", () => {
    expect(siblingKeys(`${comeback1},${comeback2},${comeback3}`, occurrence)).toEqual([
      comeback1,
      comeback2,
      comeback3,
    ]);
  });

  it("Done on a comeback ends the whole chain, backwards and forwards", () => {
    expect(siblingKeys(`${occurrence},${comeback1},${comeback3}`, comeback2)).toEqual([
      occurrence,
      comeback1,
      comeback3,
    ]);
  });

  it("tolerates whitespace, blanks and duplicates", () => {
    expect(siblingKeys(` ${comeback1} , , ${comeback1} `, occurrence)).toEqual([comeback1]);
  });

  it("never cancels the key it was invoked for (that is the follow-up's key)", () => {
    expect(siblingKeys(`${occurrence},${comeback1}`, occurrence)).toEqual([comeback1]);
  });

  it("never hands the snooze guard key to cancel", () => {
    expect(siblingKeys(`snooze_until_${occurrence},${comeback1}`, occurrence)).toEqual([comeback1]);
    expect(isCancellableAlarmKey(`snooze_until_${occurrence}`)).toBe(false);
  });
});

describe("nag cap (mirror of the Swift guard)", () => {
  it("treats a missing or garbage counter as nothing delivered yet", () => {
    expect(nagIndex({})).toBe(0);
    expect(nagIndex({ nagIndex: "junk" })).toBe(0);
    expect(nagIndex({ nagIndex: "-4" })).toBe(0);
  });

  it("reads the counter back", () => {
    expect(nagIndex({ nagIndex: "2" })).toBe(2);
  });

  it("clamps the allowance to the shared default", () => {
    expect(nagMax({})).toBe(DEFAULT_NAG_MAX);
    expect(nagMax({ nagMax: "99" })).toBe(DEFAULT_NAG_MAX);
    expect(nagMax({ nagMax: "1" })).toBe(1);
  });

  it("stops the chain at the third comeback", () => {
    const allowed = (index: number) => index < nagMax({});
    expect(allowed(nagIndex({ nagIndex: "0" }))).toBe(true);
    expect(allowed(nagIndex({ nagIndex: "2" }))).toBe(true);
    expect(allowed(nagIndex({ nagIndex: "3" }))).toBe(false);
    expect(allowed(nagIndex({ nagIndex: "9" }))).toBe(false);
  });
});
