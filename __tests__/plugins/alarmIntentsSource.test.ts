import fs from "fs";
import path from "path";

/**
 * Ring-state tripwire — the AlarmKit native side.
 *
 * The Swift in `plugins/` is never executed by Jest and never compiled without a
 * Mac, so short of a 15-minute EAS build the only feedback loop is reading the
 * source. These suites pin the ring-state contract so a well-meaning edit shows
 * up red here instead of as a broken build later:
 *   - every alarm carries occurrence identity (reminderId / occurrenceAt /
 *     chainId / chainStep / kind) in its metadata dict,
 *   - "Later" starts a fresh chain: guard first, silence, cancel the current
 *     chain's siblings, AWAIT registration of a new comeback chain, then persist
 *     a durable snoozed event (or scheduleFailed),
 *   - the durable log is peek/ack with unique eventIds (no delete-first drain),
 *   - the bridge exposes the live AlarmManager snapshot, occurrence-scoped stop,
 *     and an RCTEventEmitter carrying the "please peek" hint,
 *   - native subscribes to alarmUpdates before the first snapshot.
 *
 * Assertions are about PRESENCE and ORDER of symbols, not formatting.
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
const snoozePerform = snoozeIntent.slice(snoozeIntent.indexOf("func perform()"));
const chain = slice(intents, "enum VRAlarmNagChain", "// MARK: - Alarm button configuration");
const seam = intents.slice(intents.indexOf("protocol VRAlarmFollowUpScheduling"));

const scheduler = slice(plugin, "const VR_ALARM_SCHEDULER_SWIFT", "// INTENTS HOOK");
const bridgeSwift = slice(plugin, "const ALARM_KIT_BRIDGE_SWIFT", "// AlarmKitBridge.m content");
const bridgeObjc = slice(plugin, "const ALARM_KIT_BRIDGE_OBJC", "// VRAlarmEventEmitter.m content");
const emitterObjc = slice(plugin, "const VR_ALARM_EVENT_EMITTER_OBJC", "// VRAlarmScheduler.swift content");

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

// ─── Group 2: the nag never rides the system countdown ──────────────────────

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

  it("schedules plain fixed-date alarms", () => {
    expect(scheduler).toContain("schedule: .fixed(fireDate)");
  });
});

// ─── Group 3: occurrence + chain metadata ───────────────────────────────────

describe("every alarm carries occurrence identity", () => {
  it("declares the five identity metadata keys in the intents", () => {
    expect(intents).toContain('static let reminderIdMetadataKey = "reminderId"');
    expect(intents).toContain('static let occurrenceAtMetadataKey = "occurrenceAt"');
    expect(intents).toContain('static let chainIdMetadataKey = "chainId"');
    expect(intents).toContain('static let chainStepMetadataKey = "chainStep"');
    expect(intents).toContain('static let kindMetadataKey = "kind"');
  });

  it("the scheduler persists the whole metadata dict per app key — no key whitelist", () => {
    expect(scheduler).toContain('"metadata": metadata');
    expect(scheduler).toContain("VRAlarmStore.setMeta(appKey: appKey");
  });

  it("both scheduling paths write meta and the fire time", () => {
    expect((scheduler.match(/VRAlarmStore\.setMeta\(appKey:/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((scheduler.match(/VRAlarmStore\.setUUID\(alarmID, fireDate:/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("the state snapshot reads the identity back out of that record", () => {
    expect(scheduler).toContain('md["reminderId"]');
    expect(scheduler).toContain('md["occurrenceAt"]');
    expect(scheduler).toContain('md["chainId"]');
    expect(scheduler).toContain('md["chainStep"]');
  });
});

// ─── Group 4: Stop — records, cancels siblings after guard, emits hint ───────

describe("VRStopIntent ends the chain", () => {
  it("records a stopped event carrying occurrence identity", () => {
    expect(stopIntent).toContain("kind: VRAlarmIntentKeys.stoppedEvent");
    expect(stopIntent).toContain("occurrenceAt: context.occurrenceAt");
    expect(stopIntent).toContain("chainId: context.chainId");
  });

  it("cancels the ring's remaining comebacks strictly AFTER the spurious-stop guard", () => {
    const guard = at(stopIntent, "shouldRecordStop(");
    const guardReturn = at(stopIntent, "return .result()");
    const cancel = at(stopIntent, "VRAlarmNagChain.cancelSiblings");
    expect(guard).toBeLessThan(cancel);
    expect(guardReturn).toBeLessThan(cancel);
  });

  it("keeps the guard as an early return, not a wrapper around the cancel", () => {
    expect(stopIntent).toMatch(/guard VRAlarmIntentGuards\.shouldRecordStop\([^)]*\) else \{\s*return \.result\(\)\s*\}/);
  });

  it("records the stop before cancelling anything", () => {
    expect(at(stopIntent, "kind: VRAlarmIntentKeys.stoppedEvent")).toBeLessThan(
      at(stopIntent, "VRAlarmNagChain.cancelSiblings")
    );
  });

  it("keeps the registry + guard cleanup and emits the peek hint", () => {
    expect(stopIntent).toContain("VRAlarmIntentStore.clearUUID(appKey: resolvedKey)");
    expect(stopIntent).toContain("VRAlarmIntentStore.clearSnoozeGuard(appKey: resolvedKey)");
    expect(stopIntent).toContain('VRAlarmHint.post(reason: "intent")');
  });

  it("never schedules anything — Done is the end of the chain", () => {
    expect(stopIntent).not.toContain("scheduleAlarm(");
  });

  it("never opens the app — slide-to-stop must not demand an unlock", () => {
    expect(stopIntent).toContain("static var openAppWhenRun: Bool = false");
    expect(snoozeIntent).toContain("static var openAppWhenRun: Bool = false");
  });
});

// ─── Group 5: Later — fresh chain, awaited scheduling ───────────────────────

describe("VRSnoozeIntent starts a fresh comeback chain", () => {
  it("writes the snooze guard first (guard 1), before any await", () => {
    const guardWrite = at(snoozePerform, "writeSnoozeGuard(");
    expect(guardWrite).toBeLessThan(at(snoozePerform, "stopRinging("));
    expect(guardWrite).toBeLessThan(at(snoozePerform, "cancelSiblings(of: resolvedKey"));
    expect(guardWrite).toBeLessThan(at(snoozePerform, "try await VRFollowUpScheduler.scheduleAlarm("));
  });

  it("silences the ringing alarm, with a registry fallback for a lost UUID", () => {
    expect(snoozePerform).toContain("stopRinging(");
    expect(snoozePerform).toContain("UUID(uuidString: alarmID)");
    expect(snoozePerform).toContain("VRAlarmIntentStore.uuidRegistry()[resolvedKey]");
  });

  it("cancels the CURRENT chain's siblings, then arms a NEW chain (reversed from OLD-96)", () => {
    // Each Later replaces the chain — the pre-armed comebacks of the current
    // chain are cancelled and a fresh chain is armed from the tap.
    const cancel = at(snoozePerform, "VRAlarmNagChain.cancelSiblings(of: resolvedKey");
    const arm = at(snoozePerform, "try await VRFollowUpScheduler.scheduleAlarm(");
    expect(cancel).toBeLessThan(arm);
    expect(snoozePerform).toContain("VRAlarmIntentGuards.laterChainId(");
    // The old owed-comeback / cap machinery is gone.
    expect(snoozePerform).not.toContain("owedComebackCount");
    expect(snoozePerform).not.toContain("Task.sleep");
  });

  it("arms a comeback plus two nags — three awaited registrations", () => {
    expect((snoozePerform.match(/try await VRFollowUpScheduler\.scheduleAlarm\(/g) ?? []).length).toBe(3);
  });

  it("on comeback-registration failure persists scheduleFailed and claims no snooze", () => {
    expect(snoozePerform).toContain("kind: VRAlarmIntentKeys.scheduleFailedEvent");
    // scheduleFailed appears before the snoozed event in source, inside the catch.
    expect(at(snoozePerform, "VRAlarmIntentKeys.scheduleFailedEvent")).toBeLessThan(
      at(snoozePerform, "kind: VRAlarmIntentKeys.snoozedEvent")
    );
  });

  it("on success records a snoozed event with the comeback's real fire date and the new chainId", () => {
    expect(snoozePerform).toContain("kind: VRAlarmIntentKeys.snoozedEvent");
    expect(snoozePerform).toContain("snoozeUntil: comebackAt");
    expect(snoozePerform).toContain("chainId: newChainId");
    expect(snoozePerform).toContain('VRAlarmHint.post(reason: "intent")');
  });
});

// ─── Group 6: the scheduler seam is async throws and awaited ─────────────────

describe("the scheduler seam awaits AlarmKit", () => {
  it("declares scheduleAlarm as async throws on the AK-1 seam", () => {
    expect(seam).toContain("static func scheduleAlarm(");
    expect(seam).toContain("async throws -> UUID");
    expect(seam).toContain("static func cancel(appKey: String)");
    expect(seam).toContain("static func stopRinging(uuid: UUID)");
  });

  it("the scheduler impl awaits AlarmManager.schedule (no detached try? in the seam)", () => {
    expect(scheduler).toContain("async throws -> UUID");
    expect((scheduler.match(/_ = try await AlarmManager\.shared\.schedule\(id: alarmID/g) ?? []).length)
      .toBeGreaterThanOrEqual(2);
    expect(scheduler).not.toContain("Task.detached {\n      _ = try? await AlarmManager.shared.schedule");
  });
});

// ─── Group 7: durable peek/ack event log ────────────────────────────────────

describe("the event log is durable peek/ack", () => {
  it("both stores expose peekEvents / ackEvents and mint an eventId per append", () => {
    for (const src of [intents, scheduler]) {
      expect(src).toContain("static func peekEvents()");
      expect(src).toContain("static func ackEvents(");
      expect(src).toContain('"eventId": UUID().uuidString');
      expect(src).toContain("writeEventsLocked");
    }
  });

  it("serializes append/ack through one shared lock", () => {
    expect(scheduler).toContain("let vrAlarmEventLock = NSLock()");
    expect(intents).toContain("vrAlarmEventLock.lock()");
    expect(scheduler).toContain("vrAlarmEventLock.lock()");
  });

  it("declares the durable event kinds in the intents", () => {
    expect(intents).toContain('static let stoppedEvent = "stopped"');
    expect(intents).toContain('static let snoozedEvent = "snoozed"');
    expect(intents).toContain('static let removedEvent = "removed"');
    expect(intents).toContain('static let scheduleFailedEvent = "scheduleFailed"');
  });

  it("sibling cancellation logs a `removed` event, only for rings still scheduled", () => {
    expect(chain).toContain("kind: VRAlarmIntentKeys.removedEvent");
    expect(chain).toContain("let wasScheduled = registry[key] != nil");
    expect(at(chain, "guard wasScheduled else { continue }")).toBeLessThan(
      at(chain, "VRAlarmIntentStore.appendEvent(")
    );
    expect(chain).toContain("VRFollowUpScheduler.cancel(appKey: key)");
    expect(chain).not.toContain("AlarmManager");
  });
});

// ─── Group 8: live state snapshot + occurrence-scoped stop ───────────────────

describe("live AlarmManager state + occurrence stop", () => {
  it("maps Alarm.State by description, with alerting the ringing case", () => {
    expect(scheduler).toContain("static func stateString(_ state: Alarm.State)");
    for (const token of ["alerting", "countdown", "paused"]) {
      expect(scheduler).toContain(`s.contains("${token}")`);
    }
  });

  it("snapshots AlarmManager.shared.alarms joined to metadata", () => {
    expect(scheduler).toContain("static func alarmStates()");
    expect(scheduler).toContain("AlarmManager.shared.alarms");
    expect(scheduler).toContain("VRAlarmStore.appKey(forUUID: alarm.id)");
  });

  it("stopOccurrence cancels every matching app key across all chains", () => {
    expect(scheduler).toContain("static func stopOccurrence(reminderId: String, occurrenceAt: Int)");
    expect(scheduler).toContain("appKeysForOccurrence(reminderId: reminderId, occurrenceAt: occurrenceAt)");
  });

  it("the bridge exports peek / ack / getAlarmStates / stopOccurrence", () => {
    for (const method of ["peekEvents", "ackEvents", "getAlarmStates", "stopOccurrence"]) {
      expect(bridgeSwift).toContain(`func ${method}(`);
      expect(bridgeObjc).toContain(`RCT_EXTERN_METHOD(${method}:`);
    }
  });
});

// ─── Group 9: alarmUpdates subscription + hint emitter ───────────────────────

describe("live hint over alarmUpdates + RCTEventEmitter", () => {
  it("subscribes to alarmUpdates before the first snapshot", () => {
    expect(scheduler).toContain("AlarmManager.shared.alarmUpdates");
    expect(scheduler).toContain("enum VRAlarmObservation");
    expect(scheduler).toContain("static func ensureStarted()");
    expect(at(scheduler, "VRAlarmObservation.ensureStarted()")).toBeLessThan(
      at(scheduler, "(try? AlarmManager.shared.alarms) ?? []")
    );
  });

  it("defines the hint as a NotificationCenter post named VRAlarmEventHint", () => {
    expect(scheduler).toContain("enum VRAlarmHint");
    expect(scheduler).toContain('Notification.Name("VRAlarmEventHint")');
    expect(scheduler).toContain("static func post(reason: String)");
  });

  it("the emitter is a pure ObjC RCTEventEmitter subclass in its own linked .m file", () => {
    // A Swift RCTEventEmitter subclass fails to see React's header under an
    // Expo-owned bridging header, so the emitter is Objective-C importing React
    // directly. No Swift file may reference RCTEventEmitter.
    expect(scheduler).not.toContain("RCTEventEmitter");
    expect(bridgeSwift).not.toContain("RCTEventEmitter");
    expect(plugin).toContain('{ name: "VRAlarmEventEmitter.m", contents: VR_ALARM_EVENT_EMITTER_OBJC }');
    expect(emitterObjc).toContain("#import <React/RCTEventEmitter.h>");
    expect(emitterObjc).toContain("@interface VRAlarmEventEmitter : RCTEventEmitter");
    expect(emitterObjc).toContain("RCT_EXPORT_MODULE(VRAlarmEventEmitter)");
    expect(emitterObjc).toContain('return @[@"VRAlarmEvent"];');
    expect(emitterObjc).toContain("- (void)startObserving");
    expect(emitterObjc).toContain("- (void)stopObserving");
    expect(emitterObjc).toContain('sendEventWithName:@"VRAlarmEvent"');
  });

  it("both sides agree on the plain notification name VRAlarmEventHint, carrying reason", () => {
    expect(scheduler).toContain('Notification.Name("VRAlarmEventHint")');
    expect(emitterObjc).toContain('@"VRAlarmEventHint"');
    expect(emitterObjc).toContain('note.userInfo[@"reason"]');
    // hasListeners guard so no event fires without a JS listener.
    expect(emitterObjc).toContain("_hasListeners");
  });

  it("does NOT add RCTEventEmitter to the Swift bridging header", () => {
    expect(plugin).toContain('const importLine = "#import <React/RCTBridgeModule.h>";');
  });
});

// ─── Group 10: only real alarm keys ever reach cancel ────────────────────────

describe("key families", () => {
  it("accepts both the occurrence and the comeback prefix, and builds comeback keys", () => {
    expect(intents).toContain('static let appKeyPrefix = "reminder_"');
    expect(intents).toContain('static let nagKeyPrefix = "snooze_"');
    expect(intents).toContain("static func comebackAppKey(reminderId: String, fireMillis: Int) -> String");
    expect(intents).toContain("guard isCancellableAlarmKey(key) else { continue }");
  });

  it("keeps the snooze GUARD key out of cancel even though it shares the prefix", () => {
    expect(intents).toContain(
      "if key.hasPrefix(VRAlarmIntentKeys.snoozeGuardPrefix) { return false }"
    );
  });

  it("cancelSiblings always excludes the key it was invoked for", () => {
    expect(chain).toContain("excluding: resolvedKey");
    expect(intents).toContain("guard key != selfKey else { continue }");
  });
});
