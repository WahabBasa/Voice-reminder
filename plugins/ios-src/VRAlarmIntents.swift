//
//  VRAlarmIntents.swift
//  VoiceReminder — AK-2
//
//  Stop ("Done") and Snooze ("Later") App Intents for AlarmKit alarms, plus the
//  race-condition guards from docs/alarmkit-port-prd.md. Nothing here is reachable
//  on Android or on iOS < 26: every type is `@available(iOS 26.0, *)` and the file
//  is only compiled into the iOS target by plugins/withAlarmKit.js (AK-1).
//
//  Guard numbering in comments below refers to the five mandatory guards in the PRD:
//    1. Snooze guard written FIRST
//    2. StopIntent skips everything while a snooze guard is active (iOS fires
//       StopIntent even when the user tapped Later)
//    3. JS reconciliation honours the same guard (AK-4, not this file)
//    4. SnoozeIntent sleeps 1s before returning so AlarmKit registers the follow-up
//    5. UUID rotation on reschedule (delegated to VRAlarmScheduler, AK-1)
//

import Foundation
import AppIntents

#if canImport(AlarmKit)
import AlarmKit
import SwiftUI
#endif

// MARK: - Storage keys

enum VRAlarmIntentKeys {
    static let events = "vr_alarm_events"
    static let uuids = "vr_alarm_uuids"
    static let meta = "vr_alarm_meta"
    static let snoozeGuardPrefix = "snooze_until_"

    /// Info.plist key holding an App Group id. Only needed if the intents end up
    /// running in the widget-extension process, where `.standard` defaults are a
    /// different container than the app's. Absent = plain `.standard`.
    static let appGroupInfoPlistKey = "VRAlarmAppGroup"

    static func snoozeGuard(for appKey: String) -> String {
        return snoozeGuardPrefix + appKey
    }
}

/// Resolves the defaults container shared by the app and (if present) the alarm
/// widget extension. Single seam so AK-1 can flip the whole file to an App Group
/// by adding one Info.plist entry.
enum VRAlarmIntentDefaults {
    static var store: UserDefaults {
        if let group = Bundle.main.object(forInfoDictionaryKey: VRAlarmIntentKeys.appGroupInfoPlistKey) as? String,
           !group.isEmpty,
           let shared = UserDefaults(suiteName: group) {
            return shared
        }
        return UserDefaults.standard
    }
}

// MARK: - Guard decisions (pure — the reviewable/testable core)

/// Pure functions only: no UserDefaults, no AlarmKit, no clock reads. Every guard
/// decision the intents make is one of these, so the logic can be reasoned about
/// (and self-tested) without a Mac.
enum VRAlarmIntentGuards {
    static let defaultSnoozeMinutes = 5
    static let maxSnoozeMinutes = 720

    static func epochMillis(_ date: Date) -> Int {
        return Int((date.timeIntervalSince1970 * 1000).rounded())
    }

    /// GUARD 2 input. Strict `>`: a guard whose deadline has arrived is spent, which
    /// is exactly the follow-up alarm's own fire moment — Done on the follow-up must
    /// be recorded, not swallowed.
    static func isSnoozeActive(snoozeUntilMillis: Int?, nowMillis: Int) -> Bool {
        guard let snoozeUntilMillis = snoozeUntilMillis else { return false }
        return snoozeUntilMillis > nowMillis
    }

    /// GUARD 2: StopIntent records a stop only when no snooze is in flight.
    static func shouldRecordStop(snoozeUntilMillis: Int?, nowMillis: Int) -> Bool {
        return !isSnoozeActive(snoozeUntilMillis: snoozeUntilMillis, nowMillis: nowMillis)
    }

    /// Missing/absurd metadata must never throw — fall back to the PRD default.
    static func normalizedSnoozeMinutes(_ minutes: Int?) -> Int {
        guard let minutes = minutes, minutes > 0 else { return defaultSnoozeMinutes }
        return min(minutes, maxSnoozeMinutes)
    }

    static func snoozeUntilMillis(nowMillis: Int, snoozeMinutes: Int) -> Int {
        return nowMillis + normalizedSnoozeMinutes(snoozeMinutes) * 60_000
    }

    /// The identifier written into the event log. An intent with no app key still
    /// logs something JS can correlate rather than dropping the event on the floor.
    static func eventIdentifier(appKey: String?, alarmID: String?) -> String {
        if let appKey = appKey, !appKey.isEmpty { return appKey }
        if let alarmID = alarmID, !alarmID.isEmpty { return "uuid:" + alarmID }
        return "unknown"
    }

    /// The follow-up keeps the ORIGINAL app key: guard 3 (JS) keys off
    /// `snooze_until_{appKey}`, and guard 5 (UUID rotation) keys off the registry
    /// entry for that same key. A fresh key would orphan both.
    static func followUpAppKey(originalAppKey: String) -> String {
        return originalAppKey
    }
}

// MARK: - Storage (I/O around the pure guards)

enum VRAlarmIntentStore {
    /// Drop-oldest cap. JS drains on every foreground; an unbounded array would only
    /// ever grow if the app is never opened again.
    private static let maxEvents = 200

    // MARK: Snooze guard

    static func readSnoozeGuard(appKey: String) -> Int? {
        guard !appKey.isEmpty else { return nil }
        let raw = VRAlarmIntentDefaults.store.object(forKey: VRAlarmIntentKeys.snoozeGuard(for: appKey))
        if let millis = raw as? Int { return millis }
        if let millis = raw as? Double { return Int(millis) }
        if let millis = raw as? NSNumber { return millis.intValue }
        return nil
    }

    static func writeSnoozeGuard(appKey: String, snoozeUntilMillis: Int) {
        guard !appKey.isEmpty else { return }
        let store = VRAlarmIntentDefaults.store
        store.set(snoozeUntilMillis, forKey: VRAlarmIntentKeys.snoozeGuard(for: appKey))
        // GUARD 2 depends on StopIntent observing this write, possibly from another
        // process and milliseconds later. Force the flush rather than trust the
        // periodic one.
        store.synchronize()
    }

    static func clearSnoozeGuard(appKey: String) {
        guard !appKey.isEmpty else { return }
        VRAlarmIntentDefaults.store.removeObject(forKey: VRAlarmIntentKeys.snoozeGuard(for: appKey))
    }

    // MARK: Event log

    /// Tolerates both storage shapes: a native plist array (what we write) and a
    /// JSON string, in case AK-1's appender encodes the PRD's "JSON array" literally.
    static func readEvents() -> [[String: Any]] {
        let raw = VRAlarmIntentDefaults.store.object(forKey: VRAlarmIntentKeys.events)
        if let array = raw as? [[String: Any]] { return array }
        if let json = raw as? String,
           let data = json.data(using: .utf8),
           let decoded = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            return decoded
        }
        return []
    }

    static func appendEvent(type: String, id: String, atMillis: Int, snoozeUntilMillis: Int?) {
        var event: [String: Any] = ["type": type, "id": id, "at": atMillis]
        if let snoozeUntilMillis = snoozeUntilMillis {
            event["snoozeUntil"] = snoozeUntilMillis
        }
        var events = readEvents()
        events.append(event)
        if events.count > maxEvents {
            events.removeFirst(events.count - maxEvents)
        }
        let store = VRAlarmIntentDefaults.store
        store.set(events, forKey: VRAlarmIntentKeys.events)
        store.synchronize()
    }

    // MARK: UUID registry (guard 5 bookkeeping)

    static func uuidRegistry() -> [String: String] {
        return VRAlarmIntentDefaults.store.dictionary(forKey: VRAlarmIntentKeys.uuids) as? [String: String] ?? [:]
    }

    static func clearUUID(appKey: String) {
        guard !appKey.isEmpty else { return }
        var registry = uuidRegistry()
        guard registry.removeValue(forKey: appKey) != nil else { return }
        let store = VRAlarmIntentDefaults.store
        store.set(registry, forKey: VRAlarmIntentKeys.uuids)
        store.synchronize()
    }

    /// Reverse lookup for the degraded case where an intent arrives without its app key.
    static func appKey(forUUID uuid: String) -> String? {
        guard !uuid.isEmpty else { return nil }
        let needle = uuid.lowercased()
        return uuidRegistry().first { $0.value.lowercased() == needle }?.key
    }

    // MARK: Alarm metadata (fallback for the follow-up's title/sound/window)

    static func metaRecord(appKey: String) -> [String: Any]? {
        guard !appKey.isEmpty else { return nil }
        let all = VRAlarmIntentDefaults.store.dictionary(forKey: VRAlarmIntentKeys.meta)
        return all?[appKey] as? [String: Any]
    }

    static func storedTitle(appKey: String) -> String? {
        return metaRecord(appKey: appKey)?["title"] as? String
    }

    static func storedSoundName(appKey: String) -> String? {
        return metaRecord(appKey: appKey)?["soundName"] as? String
    }

    static func storedSnoozeMinutes(appKey: String) -> Int? {
        guard let raw = metaRecord(appKey: appKey)?["snoozeMinutes"] else { return nil }
        if let value = raw as? Int { return value }
        if let value = raw as? NSNumber { return value.intValue }
        return nil
    }

    static func storedMetadata(appKey: String) -> [String: String] {
        return metaRecord(appKey: appKey)?["metadata"] as? [String: String] ?? [:]
    }
}

// MARK: - Alarm button configuration (consumed by AK-1's presentation setup)

#if canImport(AlarmKit)
@available(iOS 26.0, *)
enum VRAlarmButtons {
    static var done: AlarmButton {
        AlarmButton(text: "Done", textColor: .white, systemImageName: "checkmark.circle.fill")
    }

    static var later: AlarmButton {
        AlarmButton(text: "Later", textColor: .white, systemImageName: "clock.badge")
    }

    /// Must be `.custom`, never `.snooze`/`.countdown`: only `.custom` runs
    /// VRSnoozeIntent, and the whole snooze chain lives in that intent.
    static let secondaryButtonBehavior: AlarmPresentation.Alert.SecondaryButtonBehavior = .custom
}
#endif

// MARK: - Snooze ("Later")

@available(iOS 26.0, *)
struct VRSnoozeIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Later"
    /// Snoozing must not yank the user into the app.
    static var openAppWhenRun: Bool = false
    static var isDiscoverable: Bool = false

    @Parameter(title: "Alarm ID")
    var alarmID: String

    @Parameter(title: "App Key")
    var appKey: String

    @Parameter(title: "Alarm Title")
    var alarmTitle: String?

    @Parameter(title: "Sound Name")
    var soundName: String?

    @Parameter(title: "Snooze Minutes")
    var snoozeMinutes: Int?

    init() {}

    init(alarmID: UUID, appKey: String, alarmTitle: String?, soundName: String?, snoozeMinutes: Int) {
        self.alarmID = alarmID.uuidString
        self.appKey = appKey
        self.alarmTitle = alarmTitle
        self.soundName = soundName
        self.snoozeMinutes = snoozeMinutes
    }

    func perform() async throws -> some IntentResult {
        let now = Date()
        let nowMillis = VRAlarmIntentGuards.epochMillis(now)
        let resolvedKey = VRAlarmIntentResolution.appKey(appKey: appKey, alarmID: alarmID)
        let minutes = VRAlarmIntentGuards.normalizedSnoozeMinutes(
            snoozeMinutes ?? VRAlarmIntentStore.storedSnoozeMinutes(appKey: resolvedKey)
        )
        let snoozeUntil = VRAlarmIntentGuards.snoozeUntilMillis(nowMillis: nowMillis, snoozeMinutes: minutes)

        // GUARD 1 — before anything else, and before any await. iOS fires
        // VRStopIntent spuriously on this same tap; the guard must already be on
        // disk when that happens or GUARD 2 has nothing to read.
        VRAlarmIntentStore.writeSnoozeGuard(appKey: resolvedKey, snoozeUntilMillis: snoozeUntil)

        VRAlarmIntentStore.appendEvent(
            type: "snoozed",
            id: VRAlarmIntentGuards.eventIdentifier(appKey: resolvedKey, alarmID: alarmID),
            atMillis: nowMillis,
            snoozeUntilMillis: snoozeUntil
        )

        scheduleFollowUp(appKey: resolvedKey, fireAtMillis: snoozeUntil, snoozeMinutes: minutes)

        // GUARD 4 — hold the process alive so AlarmKit finishes registering the
        // follow-up. Returning immediately lets iOS suspend us mid-registration and
        // the follow-up silently never rings. `try?`: a cancelled sleep is not an
        // error worth failing the intent over.
        try? await Task.sleep(nanoseconds: 1_000_000_000)

        return .result()
    }

    /// GUARD 5 (rotation) is the scheduler's job: it cancels the app key's previous
    /// UUID before registering the new one. Reusing the original app key is what
    /// makes that rotation — and guard 3 on the JS side — line up.
    private func scheduleFollowUp(appKey resolvedKey: String, fireAtMillis: Int, snoozeMinutes: Int) {
        guard !resolvedKey.isEmpty else { return }

        var metadata = VRAlarmIntentStore.storedMetadata(appKey: resolvedKey)
        metadata["snoozed"] = "1"

        do {
            _ = try VRFollowUpScheduler.scheduleAlarm(
                appKey: VRAlarmIntentGuards.followUpAppKey(originalAppKey: resolvedKey),
                fireDate: Date(timeIntervalSince1970: Double(fireAtMillis) / 1000.0),
                title: alarmTitle ?? VRAlarmIntentStore.storedTitle(appKey: resolvedKey) ?? "Reminder",
                soundName: soundName ?? VRAlarmIntentStore.storedSoundName(appKey: resolvedKey),
                snoozeMinutes: snoozeMinutes,
                metadata: metadata
            )
        } catch {
            // Never throw out of an intent: the snooze event is already logged, so JS
            // reconciliation can still surface the miss on next foreground.
            VRAlarmIntentStore.appendEvent(
                type: "snooze_failed",
                id: VRAlarmIntentGuards.eventIdentifier(appKey: resolvedKey, alarmID: alarmID),
                atMillis: VRAlarmIntentGuards.epochMillis(Date()),
                snoozeUntilMillis: nil
            )
        }
    }
}

// MARK: - Stop ("Done")

@available(iOS 26.0, *)
struct VRStopIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Done"
    /// Foregrounding the app is what lets JS reconciliation drain the event log.
    static var openAppWhenRun: Bool = true
    static var isDiscoverable: Bool = false

    @Parameter(title: "Alarm ID")
    var alarmID: String

    @Parameter(title: "App Key")
    var appKey: String

    init() {}

    init(alarmID: UUID, appKey: String) {
        self.alarmID = alarmID.uuidString
        self.appKey = appKey
    }

    func perform() async throws -> some IntentResult {
        let nowMillis = VRAlarmIntentGuards.epochMillis(Date())
        let resolvedKey = VRAlarmIntentResolution.appKey(appKey: appKey, alarmID: alarmID)
        let snoozeUntil = VRAlarmIntentStore.readSnoozeGuard(appKey: resolvedKey)

        // GUARD 2 — iOS runs the stop intent even when the user tapped Later. If a
        // snooze is in flight this invocation is spurious: log nothing, cancel
        // nothing, clear nothing. Recording a "stopped" here would tell JS the
        // reminder was completed and kill the snooze chain the user just asked for.
        guard VRAlarmIntentGuards.shouldRecordStop(snoozeUntilMillis: snoozeUntil, nowMillis: nowMillis) else {
            return .result()
        }

        VRAlarmIntentStore.appendEvent(
            type: "stopped",
            id: VRAlarmIntentGuards.eventIdentifier(appKey: resolvedKey, alarmID: alarmID),
            atMillis: nowMillis,
            snoozeUntilMillis: nil
        )
        VRAlarmIntentStore.clearUUID(appKey: resolvedKey)
        // Spent guard from an earlier Later on this same occurrence — safe to drop
        // now that the chain has ended.
        VRAlarmIntentStore.clearSnoozeGuard(appKey: resolvedKey)

        // No completion recording here. openAppWhenRun brings the app up and AK-4's
        // reconciliation owns the Convex/store writes.
        return .result()
    }
}

// MARK: - Resolution helpers

enum VRAlarmIntentResolution {
    /// Intents must survive metadata loss. If the app key parameter is missing we
    /// fall back to the UUID registry rather than giving up on the event.
    static func appKey(appKey: String?, alarmID: String?) -> String {
        if let appKey = appKey, !appKey.isEmpty { return appKey }
        if let alarmID = alarmID, let recovered = VRAlarmIntentStore.appKey(forUUID: alarmID) { return recovered }
        return ""
    }
}

// MARK: - INTEGRATION SEAM (AK-1)
//
// The only place this file touches AK-1's code. If VRAlarmScheduler's shape differs,
// fix it here — nothing else in the file names an AK-1 symbol.

@available(iOS 26.0, *)
protocol VRAlarmFollowUpScheduling {
    /// Must perform guard 5: cancel the app key's existing UUID, schedule a new
    /// alarm, persist appKey -> new UUID in `vr_alarm_uuids`. Must be callable off
    /// the main actor (an intent's `perform()` has no MainActor guarantee).
    static func scheduleAlarm(
        appKey: String,
        fireDate: Date,
        title: String,
        soundName: String?,
        snoozeMinutes: Int,
        metadata: [String: String]
    ) throws -> UUID
}

@available(iOS 26.0, *)
typealias VRFollowUpScheduler = VRAlarmScheduler

@available(iOS 26.0, *)
extension VRAlarmScheduler: VRAlarmFollowUpScheduling {}

// MARK: - Self-test for the pure guard logic
//
// Stands in for XCTest: no Mac here, and the intents themselves need a device. Call
// from the diagnostics screen path AK-1 already exposes; empty result == pass.

#if DEBUG
extension VRAlarmIntentGuards {
    static func selfTestFailures() -> [String] {
        var failures: [String] = []

        func expect(_ condition: Bool, _ label: String) {
            if !condition { failures.append(label) }
        }

        let now = 1_000_000_000_000

        // Guard 2 decision table
        expect(isSnoozeActive(snoozeUntilMillis: nil, nowMillis: now) == false, "no guard => not active")
        expect(isSnoozeActive(snoozeUntilMillis: now - 1, nowMillis: now) == false, "past guard => not active")
        expect(isSnoozeActive(snoozeUntilMillis: now, nowMillis: now) == false, "guard at fire moment => spent")
        expect(isSnoozeActive(snoozeUntilMillis: now + 1, nowMillis: now) == true, "future guard => active")
        expect(shouldRecordStop(snoozeUntilMillis: now + 60_000, nowMillis: now) == false, "spurious stop suppressed")
        expect(shouldRecordStop(snoozeUntilMillis: now - 60_000, nowMillis: now) == true, "real stop recorded")
        expect(shouldRecordStop(snoozeUntilMillis: nil, nowMillis: now) == true, "unsnoozed stop recorded")

        // Snooze window normalisation
        expect(normalizedSnoozeMinutes(nil) == defaultSnoozeMinutes, "nil minutes => default")
        expect(normalizedSnoozeMinutes(0) == defaultSnoozeMinutes, "zero minutes => default")
        expect(normalizedSnoozeMinutes(-3) == defaultSnoozeMinutes, "negative minutes => default")
        expect(normalizedSnoozeMinutes(9) == 9, "valid minutes preserved")
        expect(normalizedSnoozeMinutes(10_000) == maxSnoozeMinutes, "absurd minutes clamped")
        expect(snoozeUntilMillis(nowMillis: now, snoozeMinutes: 5) == now + 300_000, "5m window")
        expect(snoozeUntilMillis(nowMillis: now, snoozeMinutes: 0) == now + 300_000, "0m falls back to 5m")

        // A follow-up scheduled now must not read as active once it fires.
        let until = snoozeUntilMillis(nowMillis: now, snoozeMinutes: 5)
        expect(isSnoozeActive(snoozeUntilMillis: until, nowMillis: now) == true, "guard live during window")
        expect(isSnoozeActive(snoozeUntilMillis: until, nowMillis: until) == false, "guard spent at follow-up ring")

        // Degraded metadata
        expect(eventIdentifier(appKey: "reminder_a_1", alarmID: "U") == "reminder_a_1", "app key preferred")
        expect(eventIdentifier(appKey: "", alarmID: "U") == "uuid:U", "uuid fallback")
        expect(eventIdentifier(appKey: nil, alarmID: nil) == "unknown", "unknown fallback")
        expect(followUpAppKey(originalAppKey: "reminder_a_1") == "reminder_a_1", "follow-up reuses app key")

        // End-to-end guard 2 walkthrough: Later tap at T, spurious Stop at T+40ms,
        // follow-up rings at T+5m, real Done two seconds later.
        let guardValue = snoozeUntilMillis(nowMillis: now, snoozeMinutes: 5)
        expect(shouldRecordStop(snoozeUntilMillis: guardValue, nowMillis: now + 40) == false,
               "walkthrough: spurious stop on Later suppressed")
        expect(shouldRecordStop(snoozeUntilMillis: guardValue, nowMillis: now + 302_000) == true,
               "walkthrough: Done on follow-up recorded")

        return failures
    }
}
#endif
