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
//  OLD-96 replaces the old cadence ladder with the snooze-nag, and reuses its
//  mechanism: one ring is registered together with the comebacks it may owe
//  (+5/+10/+15 minutes, identical audio). It HAS to be pre-scheduled — no code of
//  ours runs when an AlarmKit ring times out unattended, so a comeback that is not
//  already on the daemon's books never happens on a locked phone
//  (docs/alarmkit-focus-breakthrough.md §7). Answering any ring must therefore
//  kill the rest of the chain from here: the app may never be opened, and JS
//  reconciliation would only notice after the user has been nagged anyway.
//

import Foundation
import AppIntents
import os

// MARK: - Diagnostics

/// Unified-log tape for the two alert intents. Everything is `.public` on purpose:
/// the lines must be readable off a plain `syslog` stream (pymobiledevice3 on
/// Windows, Console.app on a Mac) with no logging profile installed, and nothing
/// here is personal — alarm IDs, app keys and the wall clock. Notice level so the
/// default log config keeps them. Subsystem = bundle id so a single filter catches
/// both intents.
@available(iOS 26.0, *)
enum VRAlarmIntentLog {
    static let logger = Logger(subsystem: "com.wahabbasa.VoiceReminder", category: "VRAlarmIntents")
}

#if canImport(AlarmKit)
import AlarmKit
import SwiftUI
#endif

// MARK: - Storage keys

enum VRAlarmIntentKeys {
    static let events = "vr_alarm_events"
    static let uuids = "vr_alarm_uuids"
    static let meta = "vr_alarm_meta"
    static let fireDates = "vr_alarm_firedates"
    static let snoozeGuardPrefix = "snooze_until_"

    /// Nag-chain metadata keys (OLD-96). JS puts them in the same `metadata` dict
    /// the alarm already carries; AK-1's store persists that dict verbatim per app
    /// key, so nothing has to be whitelisted here. `siblings` is a comma-joined
    /// list of the OTHER rings of this chain — the occurrence and its comebacks.
    static let siblingsMetadataKey = "siblings"
    /// Which link of the chain this alarm is: "0" the occurrence, "1"…"3" a
    /// comeback. This is the counter that caps the snooze button.
    static let nagIndexMetadataKey = "nagIndex"
    /// How many comebacks the chain is allowed in total.
    static let nagMaxMetadataKey = "nagMax"
    /// Fire time of the occurrence the chain belongs to (diagnostics + JS attribution).
    static let nagForMetadataKey = "nagFor"

    /// Event type appended once per chain member killed by an acknowledgment, so
    /// the JS drain can see what the intent did without opening the app first.
    static let siblingCancelledEvent = "sibling_cancelled"

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

    /// An occurrence key follows the frozen scheme `reminder_<id>_<timestamp>`; a
    /// pre-scheduled comeback follows `snooze_<id>_<timestamp>`. Both are real
    /// alarms and both can appear in a sibling list.
    static let appKeyPrefix = "reminder_"
    static let nagKeyPrefix = "snooze_"

    /// The snooze GUARD shares the comeback prefix but is a plain UserDefaults
    /// key, not an alarm. It must never reach cancel, which is why the prefix
    /// test is a function rather than one `hasPrefix`.
    static func isCancellableAlarmKey(_ key: String) -> Bool {
        if key.hasPrefix(VRAlarmIntentKeys.snoozeGuardPrefix) { return false }
        return key.hasPrefix(appKeyPrefix) || key.hasPrefix(nagKeyPrefix)
    }

    /// Which chain members an acknowledgment on `selfKey` should cancel. Pure so
    /// the ugly cases (blank entries, whitespace, duplicates, a key listing
    /// itself) are decided here rather than inside the cancel loop.
    ///
    /// Excluding `selfKey` is what keeps a snooze chain from cancelling itself:
    /// `followUpAppKey` reuses the ring's own key, so the follow-up alarm IS
    /// `selfKey` and must never be reachable through the sibling list. The prefix
    /// check backs that up — nothing outside the alarm key space (a guard key, a
    /// stray token) is ever handed to cancel.
    static func siblingKeys(rawSiblings: String?, excluding selfKey: String) -> [String] {
        guard let rawSiblings = rawSiblings, !rawSiblings.isEmpty else { return [] }

        var seen = Set<String>()
        var keys: [String] = []
        for piece in rawSiblings.split(separator: ",") {
            let key = String(piece).trimmingCharacters(in: .whitespacesAndNewlines)
            guard !key.isEmpty else { continue }
            guard key != selfKey else { continue }
            guard key != followUpAppKey(originalAppKey: selfKey) else { continue }
            guard isCancellableAlarmKey(key) else { continue }
            guard seen.insert(key).inserted else { continue }
            keys.append(key)
        }
        return keys
    }

    // MARK: Nag cap (OLD-96)
    //
    // Mirrors MAX_NAG_COMEBACKS in lib/notificationDecisions.ts. Without this the
    // snooze button re-armed forever: every tap scheduled a fresh alarm on the
    // same app key and nothing counted them.

    static let defaultNagMax = 3

    private static func metadataInt(_ metadata: [String: String], _ key: String) -> Int? {
        guard let raw = metadata[key], let value = Int(raw) else { return nil }
        return value
    }

    /// Comebacks already delivered for this ring. Absent/garbage reads as 0, so a
    /// pre-OLD-96 alarm still gets the full allowance rather than none.
    static func nagIndex(metadata: [String: String]) -> Int {
        return max(0, metadataInt(metadata, VRAlarmIntentKeys.nagIndexMetadataKey) ?? 0)
    }

    /// The chain's allowance. Absent/absurd falls back to the shared default.
    static func nagMax(metadata: [String: String]) -> Int {
        guard let value = metadataInt(metadata, VRAlarmIntentKeys.nagMaxMetadataKey),
              value >= 0 else { return defaultNagMax }
        return min(value, defaultNagMax)
    }

    /// Whether comeback number `nagIndex + 1` is still allowed.
    static func shouldNagAgain(nagIndex: Int, nagMax: Int) -> Bool {
        return nagIndex < nagMax
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

    /// Tolerates both storage shapes: the JSON string the PRD specifies (what we
    /// and AK-1 write) and a native plist array left behind by an older build.
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
        // JSON string, not a plist array: AK-1's drain reads this key with
        // `string(forKey:)`, so an array here is invisible to JS (and wiped by the
        // next drain). Encoding failure falls back to the array — `readEvents`
        // tolerates both shapes, so a stranded event is still better than none.
        if let data = try? JSONSerialization.data(withJSONObject: events, options: []),
           let json = String(data: data, encoding: .utf8) {
            store.set(json, forKey: VRAlarmIntentKeys.events)
        } else {
            store.set(events, forKey: VRAlarmIntentKeys.events)
        }
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

    /// Fire time (epoch ms) the scheduler recorded alongside the UUID. Needed to
    /// tell an owed comeback from one that already rang: the registry keeps both.
    static func fireDateMillis(appKey: String) -> Int? {
        guard !appKey.isEmpty else { return nil }
        guard let map = VRAlarmIntentDefaults.store.dictionary(forKey: VRAlarmIntentKeys.fireDates) else {
            return nil
        }
        switch map[appKey] {
        case let value as Double: return Int(value)
        case let value as Int: return value
        case let value as NSNumber: return value.intValue
        default: return nil
        }
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

    /// Raw comma-joined sibling list JS wrote at schedule time. Absent for every
    /// pre-ladder alarm, which is exactly the "behave like before" case.
    static func storedSiblings(appKey: String) -> String? {
        return storedMetadata(appKey: appKey)[VRAlarmIntentKeys.siblingsMetadataKey]
    }

    /// Same eviction the scheduler's cancel performs. Called for cancelled rungs so
    /// `vr_alarm_meta` does not accumulate one dead record per rung per occurrence.
    static func clearMeta(appKey: String) {
        guard !appKey.isEmpty else { return }
        let store = VRAlarmIntentDefaults.store
        var all = store.dictionary(forKey: VRAlarmIntentKeys.meta) ?? [:]
        guard all.removeValue(forKey: appKey) != nil else { return }
        store.set(all, forKey: VRAlarmIntentKeys.meta)
        store.synchronize()
    }
}

// MARK: - Nag chain (pre-scheduled siblings)

/// The chain's whole native job: when one ring is answered, the comebacks stop
/// existing. Only Done goes through the cancel — "Later" deliberately leaves the
/// chain alone, because the next pre-scheduled sibling IS the comeback the user
/// just asked for.
@available(iOS 26.0, *)
enum VRAlarmNagChain {
    /// How many of `resolvedKey`'s siblings are still armed in the future — i.e.
    /// how many comebacks this ring already owes without anyone scheduling
    /// anything. Zero means the chain is spent or was never registered, which is
    /// the only case where "Later" has to arm one itself.
    static func owedComebackCount(of resolvedKey: String, afterMillis: Int) -> Int {
        guard !resolvedKey.isEmpty else { return 0 }

        let keys = VRAlarmIntentGuards.siblingKeys(
            rawSiblings: VRAlarmIntentStore.storedSiblings(appKey: resolvedKey),
            excluding: resolvedKey
        )
        guard !keys.isEmpty else { return 0 }

        let registry = VRAlarmIntentStore.uuidRegistry()
        return keys.reduce(0) { total, key in
            guard registry[key] != nil,
                  let fireDate = VRAlarmIntentStore.fireDateMillis(appKey: key),
                  fireDate > afterMillis else { return total }
            return total + 1
        }
    }

    /// Cancels every OTHER member of `resolvedKey`'s chain. Rotation awareness
    /// (app key -> current UUID) belongs to the scheduler's cancel and is not
    /// re-implemented here; we only decide which keys it gets.
    ///
    /// Returns the keys that were actually still scheduled, so a second
    /// acknowledgment on the same ring is silent rather than logging a second
    /// round of cancels.
    @discardableResult
    static func cancelSiblings(of resolvedKey: String, atMillis: Int) -> [String] {
        guard !resolvedKey.isEmpty else { return [] }

        let keys = VRAlarmIntentGuards.siblingKeys(
            rawSiblings: VRAlarmIntentStore.storedSiblings(appKey: resolvedKey),
            excluding: resolvedKey
        )
        guard !keys.isEmpty else { return [] }

        let registry = VRAlarmIntentStore.uuidRegistry()
        var cancelled: [String] = []

        for key in keys {
            let wasScheduled = registry[key] != nil
            // Guard 5 lives in here: resolve the key's current UUID, cancel it,
            // drop the registry and meta entries.
            VRFollowUpScheduler.cancel(appKey: key)
            // Belt and braces for a ring whose registry entry already rotated away:
            // the scheduler's cancel bails before its own eviction in that case.
            VRAlarmIntentStore.clearMeta(appKey: key)
            VRAlarmIntentStore.clearSnoozeGuard(appKey: key)

            guard wasScheduled else { continue }
            cancelled.append(key)
            VRAlarmIntentStore.appendEvent(
                type: VRAlarmIntentKeys.siblingCancelledEvent,
                id: key,
                atMillis: atMillis,
                snoozeUntilMillis: nil
            )
        }

        return cancelled
    }
}

// MARK: - Alarm button configuration (consumed by AK-1's presentation setup)

#if canImport(AlarmKit)
@available(iOS 26.0, *)
enum VRAlarmButtons {
    /// Only reachable on iOS 26.0. From 26.1 the alert takes a system-provided stop
    /// control and this appearance is ignored, so VRAlarmScheduler.makeAlert passes it
    /// on the deprecated init's branch alone. The stop *action* is unaffected — that
    /// is stopIntent, not this.
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
    /// iOS 26 deprecates openAppWhenRun in favour of supportedModes. Build 2's
    /// compiled Metadata.appintents already carried supportedModes=1 (background —
    /// proven against the 08-15 build where openAppWhenRun=true compiled to 2), so
    /// this declaration changes nothing in the metadata; it is here so the
    /// lock-screen diagnostic run exercises the explicit form the reviewer asked
    /// for. openAppWhenRun stays for the deprecated-API path.
    static var supportedModes: IntentModes = [.background]

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
        // First line of perform(): its timestamp against SpringBoard's unlock/biometric
        // lines in the same syslog answers whether the intent ran before any prompt.
        VRAlarmIntentLog.logger.notice("VRSnoozeIntent perform start alarmID=\(alarmID, privacy: .public) appKey=\(resolvedKey, privacy: .public) tsMillis=\(nowMillis, privacy: .public)")
        let minutes = VRAlarmIntentGuards.normalizedSnoozeMinutes(
            snoozeMinutes ?? VRAlarmIntentStore.storedSnoozeMinutes(appKey: resolvedKey)
        )
        let snoozeUntil = VRAlarmIntentGuards.snoozeUntilMillis(nowMillis: nowMillis, snoozeMinutes: minutes)

        // GUARD 1 — before anything else, and before any await. iOS fires
        // VRStopIntent spuriously on this same tap; the guard must already be on
        // disk when that happens or GUARD 2 has nothing to read.
        VRAlarmIntentStore.writeSnoozeGuard(appKey: resolvedKey, snoozeUntilMillis: snoozeUntil)

        // The ring itself. Nothing else silences it any more: rotation's cancel
        // used to cut the audio as a side effect of Later always rescheduling
        // its own key, and the pre-scheduled chain removed that reschedule for
        // the common path — `.custom` leaves silencing entirely to us. Stop,
        // never cancel: the registry entry must survive for the sibling
        // bookkeeping Done relies on, and "Later" is not an acknowledgment.
        if let ringing = UUID(uuidString: alarmID) {
            VRFollowUpScheduler.stopRinging(uuid: ringing)
            VRAlarmIntentLog.logger.notice("VRSnoozeIntent stopRinging uuid=\(ringing.uuidString, privacy: .public) source=param")
        } else if let stored = VRAlarmIntentStore.uuidRegistry()[resolvedKey],
                  let ringing = UUID(uuidString: stored) {
            VRFollowUpScheduler.stopRinging(uuid: ringing)
            VRAlarmIntentLog.logger.notice("VRSnoozeIntent stopRinging uuid=\(ringing.uuidString, privacy: .public) source=registry")
        } else {
            VRAlarmIntentLog.logger.error("VRSnoozeIntent stopRinging skipped: no uuid for appKey=\(resolvedKey, privacy: .public)")
        }

        VRAlarmIntentStore.appendEvent(
            type: "snoozed",
            id: VRAlarmIntentGuards.eventIdentifier(appKey: resolvedKey, alarmID: alarmID),
            atMillis: nowMillis,
            snoozeUntilMillis: snoozeUntil
        )

        // NAG (OLD-96): the comebacks for this ring were registered up front, so
        // "Later" usually has nothing to schedule — the next pre-scheduled sibling
        // IS the comeback, five minutes out with the identical audio. The chain is
        // deliberately NOT cancelled here: cancelling it would collapse three owed
        // comebacks into one and hand the counter back to zero, which is how the
        // snooze button became unbounded in the first place.
        //
        // Only when nothing is owed (pre-scheduling failed, a legacy alarm, or the
        // chain is spent) does Later arm a follow-up itself — and scheduleFollowUp
        // then enforces the same cap the JS side uses.
        if VRAlarmNagChain.owedComebackCount(of: resolvedKey, afterMillis: nowMillis) == 0 {
            scheduleFollowUp(appKey: resolvedKey, fireAtMillis: snoozeUntil, snoozeMinutes: minutes)
        }

        // GUARD 4 — hold the process alive so AlarmKit finishes registering the
        // follow-up. Returning immediately lets iOS suspend us mid-registration and
        // the follow-up silently never rings. `try?`: a cancelled sleep is not an
        // error worth failing the intent over.
        try? await Task.sleep(nanoseconds: 1_000_000_000)

        VRAlarmIntentLog.logger.notice("VRSnoozeIntent perform end appKey=\(resolvedKey, privacy: .public) snoozeUntilMillis=\(snoozeUntil, privacy: .public)")
        return .result()
    }

    /// GUARD 5 (rotation) is the scheduler's job: it cancels the app key's previous
    /// UUID before registering the new one. Reusing the original app key is what
    /// makes that rotation — and guard 3 on the JS side — line up.
    private func scheduleFollowUp(appKey resolvedKey: String, fireAtMillis: Int, snoozeMinutes: Int) {
        guard !resolvedKey.isEmpty else { return }

        var metadata = VRAlarmIntentStore.storedMetadata(appKey: resolvedKey)

        // THE CAP. The follow-up reuses the ring's own app key, so its metadata
        // is what the next tap reads back — incrementing nagIndex here is what
        // makes a chain of snoozes terminate at nagMax instead of running for
        // ever. A missing counter reads as 0, so a legacy alarm still gets its
        // full allowance rather than none.
        let delivered = VRAlarmIntentGuards.nagIndex(metadata: metadata)
        let allowance = VRAlarmIntentGuards.nagMax(metadata: metadata)
        guard VRAlarmIntentGuards.shouldNagAgain(nagIndex: delivered, nagMax: allowance) else { return }

        metadata["snoozed"] = "1"
        metadata[VRAlarmIntentKeys.nagIndexMetadataKey] = String(delivered + 1)
        metadata[VRAlarmIntentKeys.nagMaxMetadataKey] = String(allowance)
        // The follow-up is a single alarm, never a chain member: carrying the
        // sibling list forward would make Done on the follow-up re-cancel keys
        // this snooze already passed, and would let the follow-up's own key drift
        // into a sibling list.
        metadata.removeValue(forKey: VRAlarmIntentKeys.siblingsMetadataKey)

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
    /// Answering an alarm must not demand an unlock: on the lock screen,
    /// openAppWhenRun means a Face ID prompt and an app launch on every
    /// slide-to-stop. The event log sits in UserDefaults until the next natural
    /// foreground, whose reconciliation pass was built for exactly that (its
    /// completed branch is the documented backstop for intents that never ran).
    static var openAppWhenRun: Bool = false
    static var isDiscoverable: Bool = false
    /// See VRSnoozeIntent.supportedModes — same reasoning, same diagnostic.
    static var supportedModes: IntentModes = [.background]

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
        // First line of perform() — see VRSnoozeIntent for why the timestamp matters.
        VRAlarmIntentLog.logger.notice("VRStopIntent perform start alarmID=\(alarmID, privacy: .public) appKey=\(resolvedKey, privacy: .public) tsMillis=\(nowMillis, privacy: .public) snoozeGuardMillis=\(snoozeUntil ?? -1, privacy: .public)")

        // GUARD 2 — iOS runs the stop intent even when the user tapped Later. If a
        // snooze is in flight this invocation is spurious: log nothing, cancel
        // nothing, clear nothing. Recording a "stopped" here would tell JS the
        // reminder was completed and kill the snooze chain the user just asked for.
        if !VRAlarmIntentGuards.shouldRecordStop(snoozeUntilMillis: snoozeUntil, nowMillis: nowMillis) {
            VRAlarmIntentLog.logger.notice("VRStopIntent skipped: snooze guard active appKey=\(resolvedKey, privacy: .public)")
        }
        guard VRAlarmIntentGuards.shouldRecordStop(snoozeUntilMillis: snoozeUntil, nowMillis: nowMillis) else {
            return .result()
        }

        VRAlarmIntentStore.appendEvent(
            type: "stopped",
            id: VRAlarmIntentGuards.eventIdentifier(appKey: resolvedKey, alarmID: alarmID),
            atMillis: nowMillis,
            snoozeUntilMillis: nil
        )

        // Done ends the chain: every comeback still armed for this ring goes away.
        // Deliberately AFTER the GUARD 2 return above — a spurious stop fired
        // alongside a Later tap must cancel nothing at all, or the comebacks the
        // user just asked for die before the first one rings.
        VRAlarmNagChain.cancelSiblings(of: resolvedKey, atMillis: nowMillis)

        VRAlarmIntentStore.clearUUID(appKey: resolvedKey)
        // Spent guard from an earlier Later on this same occurrence — safe to drop
        // now that the chain has ended.
        VRAlarmIntentStore.clearSnoozeGuard(appKey: resolvedKey)

        // No completion recording here. The "stopped" event waits in UserDefaults
        // for the next foreground, where AK-4's reconciliation owns the
        // Convex/store writes — deliberately deferred, so answering an alarm
        // never costs the user an unlock.
        VRAlarmIntentLog.logger.notice("VRStopIntent perform end appKey=\(resolvedKey, privacy: .public) recorded=stopped")
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

    /// Ladder sibling-cancel. Must be rotation-aware — resolve the app key's
    /// CURRENT UUID from the registry, cancel that, then drop the registry and
    /// meta entries — and a silent no-op for a key that is not scheduled. Same
    /// off-main-actor requirement as above.
    static func cancel(appKey: String)

    /// Silences an actively alerting alarm and does nothing else — no registry
    /// or meta eviction. Must be a silent no-op for an alarm that is not
    /// alerting. Same off-main-actor requirement as above.
    static func stopRinging(uuid: UUID)
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

        // Nag chain sibling parsing. One ring is `reminder_a_<T>` plus the three
        // comebacks pre-scheduled with it: `snooze_a_<T+5m|+10m|+15m>`.
        let occurrence = "reminder_a_1000"
        let comeback1 = "snooze_a_301000"
        let comeback2 = "snooze_a_601000"
        let comeback3 = "snooze_a_901000"
        expect(siblingKeys(rawSiblings: nil, excluding: occurrence).isEmpty, "no siblings key => nothing to cancel")
        expect(siblingKeys(rawSiblings: "", excluding: occurrence).isEmpty, "empty siblings => nothing to cancel")
        expect(siblingKeys(rawSiblings: comeback1 + "," + comeback2 + "," + comeback3, excluding: occurrence)
                 == [comeback1, comeback2, comeback3],
               "Done on the occurrence cancels all three comebacks")
        expect(siblingKeys(rawSiblings: " " + comeback1 + " , " + comeback2 + " ", excluding: occurrence)
                 == [comeback1, comeback2],
               "whitespace tolerated")
        expect(siblingKeys(rawSiblings: comeback1 + ",," + comeback1, excluding: occurrence) == [comeback1],
               "blanks dropped and keys de-duplicated")
        expect(siblingKeys(rawSiblings: occurrence + "," + comeback1, excluding: occurrence) == [comeback1],
               "own key never cancelled")
        expect(siblingKeys(rawSiblings: followUpAppKey(originalAppKey: occurrence), excluding: occurrence).isEmpty,
               "follow-up key is never a sibling")
        expect(siblingKeys(rawSiblings: "snooze_until_" + occurrence + "," + comeback1, excluding: occurrence) == [comeback1],
               "the snooze guard key never reaches cancel")
        expect(isCancellableAlarmKey(occurrence) && isCancellableAlarmKey(comeback1),
               "both alarm key families are cancellable")
        expect(isCancellableAlarmKey("snooze_until_" + occurrence) == false,
               "the guard key is not an alarm")

        // Walkthrough: Done on comeback 2 ends the chain — the occurrence's own
        // key and every comeback still armed for that ring go away.
        expect(siblingKeys(rawSiblings: occurrence + "," + comeback1 + "," + comeback3, excluding: comeback2)
                 == [occurrence, comeback1, comeback3],
               "walkthrough: Done on a comeback ends the whole chain")

        // The cap that stops the snooze button re-arming for ever.
        expect(nagIndex(metadata: [:]) == 0, "absent counter => nothing delivered yet")
        expect(nagIndex(metadata: ["nagIndex": "junk"]) == 0, "garbage counter => nothing delivered yet")
        expect(nagIndex(metadata: ["nagIndex": "-4"]) == 0, "negative counter floored")
        expect(nagIndex(metadata: ["nagIndex": "2"]) == 2, "counter read back")
        expect(nagMax(metadata: [:]) == defaultNagMax, "absent allowance => default")
        expect(nagMax(metadata: ["nagMax": "99"]) == defaultNagMax, "allowance clamped to the default")
        expect(nagMax(metadata: ["nagMax": "1"]) == 1, "smaller allowance honoured")
        expect(shouldNagAgain(nagIndex: 0, nagMax: defaultNagMax), "first comeback allowed")
        expect(shouldNagAgain(nagIndex: 2, nagMax: defaultNagMax), "third comeback allowed")
        expect(shouldNagAgain(nagIndex: 3, nagMax: defaultNagMax) == false, "fourth comeback refused")
        expect(shouldNagAgain(nagIndex: 9, nagMax: defaultNagMax) == false, "counter past the cap refused")

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
