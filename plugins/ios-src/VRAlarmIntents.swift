//
//  VRAlarmIntents.swift
//  VoiceReminder — AK-2 / ring-state fix
//
//  Stop ("Done") and Snooze ("Later") App Intents for AlarmKit alarms, plus the
//  race-condition guards from docs/alarmkit-port-prd.md. Nothing here is reachable
//  on Android or on iOS < 26: every type is `@available(iOS 26.0, *)` and the file
//  is only compiled into the iOS target by plugins/withAlarmKit.js (AK-1).
//
//  Guard numbering in comments below refers to the mandatory guards in the PRD:
//    1. Snooze guard written FIRST (before any await)
//    2. StopIntent skips everything while a snooze guard is active (iOS fires
//       StopIntent even when the user tapped Later)
//    3. JS reconciliation honours the same guard (not this file)
//    5. UUID rotation on reschedule (delegated to VRAlarmScheduler, AK-1)
//
//  RING-STATE FIX (2026-09-10): "Later" no longer rides a fixed pre-scheduled
//  chain. Each Later tap is a fresh 5-minutes-FROM-THE-TAP snooze, unlimited
//  times. A tap:
//    - writes the snooze guard first (guard 1, suppresses the spurious stop),
//    - silences the ring,
//    - cancels the CURRENT chain's remaining comeback siblings,
//    - AWAITS registration of a NEW comeback chain (comeback at now+5, two nags
//      at now+10 / now+15) under a fresh chainId,
//    - persists a durable `snoozed` event with snoozeUntil = the comeback's real
//      fire date, or `scheduleFailed` if the comeback could not be armed.
//  Deliberate Later taps never consume the ignored-ring cap; the ignored-ring
//  cadence (+5/+10/+15 for the ORIGINAL chain) is still pre-scheduled by JS.
//
//  Every alarm carries occurrence identity in its metadata dict: reminderId,
//  occurrenceAt (ms epoch of the ORIGINAL occurrence, constant across a chain),
//  chainId, chainStep and kind. The durable event log is now peek/ack with
//  unique eventIds instead of a delete-first drain.
//

import Foundation
import AppIntents
import os

// MARK: - Diagnostics

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

    // Nag-chain metadata keys. JS puts them in the same `metadata` dict the alarm
    // already carries; AK-1's store persists that dict verbatim per app key.
    /// Comma-joined list of the OTHER rings of this chain.
    static let siblingsMetadataKey = "siblings"
    static let nagIndexMetadataKey = "nagIndex"
    static let nagMaxMetadataKey = "nagMax"
    static let nagForMetadataKey = "nagFor"

    // Occurrence-identity metadata keys (ring-state fix). Mirrored in
    // lib/alarmKit.ts ALARM_META_KEYS and the generated Swift in withAlarmKit.js.
    static let reminderIdMetadataKey = "reminderId"
    static let occurrenceAtMetadataKey = "occurrenceAt"
    static let chainIdMetadataKey = "chainId"
    static let chainStepMetadataKey = "chainStep"
    static let kindMetadataKey = "kind"
    static let scheduledForMetadataKey = "scheduledFor"

    // Durable event kinds (ring-state fix). Mirrored in lib/alarmKit.ts
    // NativeAlarmEventKind.
    static let stoppedEvent = "stopped"
    static let snoozedEvent = "snoozed"
    static let removedEvent = "removed"
    static let scheduleFailedEvent = "scheduleFailed"

    static let appGroupInfoPlistKey = "VRAlarmAppGroup"

    static func snoozeGuard(for appKey: String) -> String {
        return snoozeGuardPrefix + appKey
    }
}

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

/// Pure functions only: no UserDefaults, no AlarmKit, no clock reads.
enum VRAlarmIntentGuards {
    static let defaultSnoozeMinutes = 5
    static let maxSnoozeMinutes = 720

    static func epochMillis(_ date: Date) -> Int {
        return Int((date.timeIntervalSince1970 * 1000).rounded())
    }

    /// GUARD 2 input. Strict `>`: a guard whose deadline has arrived is spent.
    static func isSnoozeActive(snoozeUntilMillis: Int?, nowMillis: Int) -> Bool {
        guard let snoozeUntilMillis = snoozeUntilMillis else { return false }
        return snoozeUntilMillis > nowMillis
    }

    /// GUARD 2: StopIntent records a stop only when no snooze is in flight.
    static func shouldRecordStop(snoozeUntilMillis: Int?, nowMillis: Int) -> Bool {
        return !isSnoozeActive(snoozeUntilMillis: snoozeUntilMillis, nowMillis: nowMillis)
    }

    static func normalizedSnoozeMinutes(_ minutes: Int?) -> Int {
        guard let minutes = minutes, minutes > 0 else { return defaultSnoozeMinutes }
        return min(minutes, maxSnoozeMinutes)
    }

    static func snoozeUntilMillis(nowMillis: Int, snoozeMinutes: Int) -> Int {
        return nowMillis + normalizedSnoozeMinutes(snoozeMinutes) * 60_000
    }

    static func eventIdentifier(appKey: String?, alarmID: String?) -> String {
        if let appKey = appKey, !appKey.isEmpty { return appKey }
        if let alarmID = alarmID, !alarmID.isEmpty { return "uuid:" + alarmID }
        return "unknown"
    }

    static let appKeyPrefix = "reminder_"
    static let nagKeyPrefix = "snooze_"

    /// The snooze GUARD shares the comeback prefix but is a plain UserDefaults key.
    static func isCancellableAlarmKey(_ key: String) -> Bool {
        if key.hasPrefix(VRAlarmIntentKeys.snoozeGuardPrefix) { return false }
        return key.hasPrefix(appKeyPrefix) || key.hasPrefix(nagKeyPrefix)
    }

    /// The comeback key `snooze_<reminderId>_<fireMillis>`.
    static func comebackAppKey(reminderId: String, fireMillis: Int) -> String {
        return nagKeyPrefix + reminderId + "_" + String(fireMillis)
    }

    /// The chainId a fresh Later starts.
    static func laterChainId(resolvedKey: String, tapMillis: Int) -> String {
        return "later:" + resolvedKey + ":" + String(tapMillis)
    }

    /// Which chain members an acknowledgment on `selfKey` should cancel. Pure so
    /// the ugly cases (blank entries, whitespace, duplicates, a key listing
    /// itself) are decided here rather than inside the cancel loop.
    static func siblingKeys(rawSiblings: String?, excluding selfKey: String) -> [String] {
        guard let rawSiblings = rawSiblings, !rawSiblings.isEmpty else { return [] }

        var seen = Set<String>()
        var keys: [String] = []
        for piece in rawSiblings.split(separator: ",") {
            let key = String(piece).trimmingCharacters(in: .whitespacesAndNewlines)
            guard !key.isEmpty else { continue }
            guard key != selfKey else { continue }
            guard isCancellableAlarmKey(key) else { continue }
            guard seen.insert(key).inserted else { continue }
            keys.append(key)
        }
        return keys
    }

    /// The reminderId embedded in an alarm key, when metadata is missing.
    /// `reminder_<id>_<ts>` / `snooze_<id>_<ts>` → `<id>`.
    static func reminderId(fromAppKey appKey: String) -> String {
        var body = appKey
        for prefix in [appKeyPrefix, nagKeyPrefix] where body.hasPrefix(prefix) {
            body.removeFirst(prefix.count)
            break
        }
        if let range = body.range(of: "_", options: .backwards),
           Int(body[range.upperBound...]) != nil {
            return String(body[..<range.lowerBound])
        }
        return body
    }

    /// The trailing `_<digits>` of an alarm key as ms epoch, when present.
    static func trailingTimestamp(fromAppKey appKey: String) -> Int? {
        guard let range = appKey.range(of: "_", options: .backwards) else { return nil }
        return Int(appKey[range.upperBound...])
    }
}

// MARK: - Storage (I/O around the pure guards)

enum VRAlarmIntentStore {
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
        // GUARD 2 depends on StopIntent observing this write, possibly from
        // another process and milliseconds later. Force the flush.
        store.synchronize()
    }

    static func clearSnoozeGuard(appKey: String) {
        guard !appKey.isEmpty else { return }
        VRAlarmIntentDefaults.store.removeObject(forKey: VRAlarmIntentKeys.snoozeGuard(for: appKey))
    }

    // MARK: Event log (durable peek/ack — ring-state fix)
    //
    // Serialized through `vrAlarmEventLock` (defined in VRAlarmScheduler.swift,
    // same target) so an intent thread appending and the RN bridge acking never
    // clobber each other's read-modify-write. The bridge's VRAlarmStore reads the
    // exact same key + shape, so both must agree byte-for-byte on the JSON.

    /// Tolerates both storage shapes: a JSON string (what we write) and a native
    /// plist array left behind by an older build.
    private static func decodeEventsLocked() -> [[String: Any]] {
        let raw = VRAlarmIntentDefaults.store.object(forKey: VRAlarmIntentKeys.events)
        if let json = raw as? String,
           let data = json.data(using: .utf8),
           let decoded = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            return decoded
        }
        if let array = raw as? [[String: Any]] { return array }
        return []
    }

    private static func writeEventsLocked(_ events: [[String: Any]]) {
        let store = VRAlarmIntentDefaults.store
        // JSON string, not a plist array: the bridge drains with `string(forKey:)`.
        if let data = try? JSONSerialization.data(withJSONObject: events, options: []),
           let json = String(data: data, encoding: .utf8) {
            store.set(json, forKey: VRAlarmIntentKeys.events)
        } else {
            store.set(events, forKey: VRAlarmIntentKeys.events)
        }
        store.synchronize()
    }

    static func appendEvent(kind: String,
                            appKey: String?,
                            alarmId: String?,
                            reminderId: String,
                            occurrenceAt: Int,
                            chainId: String?,
                            chainStep: Int?,
                            snoozeUntil: Int?,
                            error: String?,
                            atMillis: Int) {
        var event: [String: Any] = [
            "eventId": UUID().uuidString,
            "kind": kind,
            "reminderId": reminderId,
            "occurrenceAt": occurrenceAt,
            "at": atMillis,
        ]
        if let appKey = appKey, !appKey.isEmpty { event["appKey"] = appKey }
        if let alarmId = alarmId, !alarmId.isEmpty { event["alarmId"] = alarmId }
        if let chainId = chainId, !chainId.isEmpty { event["chainId"] = chainId }
        if let chainStep = chainStep { event["chainStep"] = chainStep }
        if let snoozeUntil = snoozeUntil { event["snoozeUntil"] = snoozeUntil }
        if let error = error, !error.isEmpty { event["error"] = error }

        vrAlarmEventLock.lock()
        defer { vrAlarmEventLock.unlock() }
        var events = decodeEventsLocked()
        events.append(event)
        if events.count > maxEvents { events.removeFirst(events.count - maxEvents) }
        writeEventsLocked(events)
    }

    /// All events not yet acked, oldest first. Legacy entries (no eventId) are
    /// migrated to carry one so `ackEvents` can address them.
    static func peekEvents() -> [[String: Any]] {
        vrAlarmEventLock.lock()
        defer { vrAlarmEventLock.unlock() }
        var events = decodeEventsLocked()
        var migrated = false
        for index in events.indices {
            if (events[index]["eventId"] as? String)?.isEmpty ?? true {
                events[index]["eventId"] = UUID().uuidString
                migrated = true
            }
        }
        if migrated { writeEventsLocked(events) }
        return events
    }

    /// Remove exactly the events whose eventIds are given.
    static func ackEvents(_ ids: [String]) {
        guard !ids.isEmpty else { return }
        let drop = Set(ids)
        vrAlarmEventLock.lock()
        defer { vrAlarmEventLock.unlock() }
        let events = decodeEventsLocked()
        let kept = events.filter { event in
            guard let id = event["eventId"] as? String else { return true }
            return !drop.contains(id)
        }
        if kept.count != events.count { writeEventsLocked(kept) }
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

    static func storedSiblings(appKey: String) -> String? {
        return storedMetadata(appKey: appKey)[VRAlarmIntentKeys.siblingsMetadataKey]
    }

    /// The occurrence a key belongs to. `occurrenceAt` is the ORIGINAL occurrence
    /// (from metadata), never the comeback's own fire time. Falls back to the
    /// key's trailing timestamp for a legacy alarm carrying no metadata.
    static func occurrenceContext(appKey: String)
        -> (reminderId: String, occurrenceAt: Int, chainId: String?, chainStep: Int?) {
        let md = storedMetadata(appKey: appKey)
        var reminderId = md[VRAlarmIntentKeys.reminderIdMetadataKey] ?? ""
        if reminderId.isEmpty { reminderId = VRAlarmIntentGuards.reminderId(fromAppKey: appKey) }
        let occurrenceAt: Int = {
            if let raw = md[VRAlarmIntentKeys.occurrenceAtMetadataKey], let value = Int(raw) { return value }
            if let ts = VRAlarmIntentGuards.trailingTimestamp(fromAppKey: appKey) { return ts }
            return fireDateMillis(appKey: appKey) ?? 0
        }()
        let chainId = md[VRAlarmIntentKeys.chainIdMetadataKey]
        let chainStep = md[VRAlarmIntentKeys.chainStepMetadataKey].flatMap { Int($0) }
        return (reminderId, occurrenceAt, chainId, chainStep)
    }

    static func clearMeta(appKey: String) {
        guard !appKey.isEmpty else { return }
        let store = VRAlarmIntentDefaults.store
        var all = store.dictionary(forKey: VRAlarmIntentKeys.meta) ?? [:]
        guard all.removeValue(forKey: appKey) != nil else { return }
        store.set(all, forKey: VRAlarmIntentKeys.meta)
        store.synchronize()
    }
}

// MARK: - Nag chain (sibling cancellation)

/// When one ring is acknowledged (Done) or superseded (a fresh Later), the
/// remaining siblings of its chain stop existing.
@available(iOS 26.0, *)
enum VRAlarmNagChain {
    /// Cancels every OTHER member of `resolvedKey`'s chain and logs one `removed`
    /// event per ring that was still scheduled. Rotation awareness (app key ->
    /// current UUID) belongs to the scheduler's cancel.
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
            // Read the sibling's own occurrence context BEFORE its meta is evicted.
            let ctx = VRAlarmIntentStore.occurrenceContext(appKey: key)
            // Guard 5 lives in here: resolve the key's current UUID, cancel it,
            // drop the registry and meta entries.
            VRFollowUpScheduler.cancel(appKey: key)
            VRAlarmIntentStore.clearMeta(appKey: key)
            VRAlarmIntentStore.clearSnoozeGuard(appKey: key)

            guard wasScheduled else { continue }
            cancelled.append(key)
            VRAlarmIntentStore.appendEvent(
                kind: VRAlarmIntentKeys.removedEvent,
                appKey: key,
                alarmId: nil,
                reminderId: ctx.reminderId,
                occurrenceAt: ctx.occurrenceAt,
                chainId: ctx.chainId,
                chainStep: ctx.chainStep,
                snoozeUntil: nil,
                error: nil,
                atMillis: atMillis
            )
        }

        return cancelled
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

    /// Must be `.custom`: only `.custom` runs VRSnoozeIntent.
    static let secondaryButtonBehavior: AlarmPresentation.Alert.SecondaryButtonBehavior = .custom
}
#endif

// MARK: - Snooze ("Later")

@available(iOS 26.0, *)
struct VRSnoozeIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Later"
    static var openAppWhenRun: Bool = false
    static var isDiscoverable: Bool = false
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
        VRAlarmIntentLog.logger.notice("VRSnoozeIntent perform start alarmID=\(alarmID, privacy: .public) appKey=\(resolvedKey, privacy: .public) tsMillis=\(nowMillis, privacy: .public)")

        let minutes = VRAlarmIntentGuards.normalizedSnoozeMinutes(
            snoozeMinutes ?? VRAlarmIntentStore.storedSnoozeMinutes(appKey: resolvedKey)
        )
        let comebackAt = nowMillis + minutes * 60_000

        // GUARD 1 — before anything else, and before any await. iOS fires
        // VRStopIntent spuriously on this same tap; the guard must already be on
        // disk when that happens or GUARD 2 has nothing to read. The window is
        // the comeback's real fire moment, so a spurious stop stays suppressed.
        VRAlarmIntentStore.writeSnoozeGuard(appKey: resolvedKey, snoozeUntilMillis: comebackAt)

        // Silence the ring. `.custom` leaves silencing entirely to us — stop, not
        // cancel, so the registry entry survives for bookkeeping.
        if let ringing = UUID(uuidString: alarmID) {
            VRFollowUpScheduler.stopRinging(uuid: ringing)
        } else if let stored = VRAlarmIntentStore.uuidRegistry()[resolvedKey],
                  let ringing = UUID(uuidString: stored) {
            VRFollowUpScheduler.stopRinging(uuid: ringing)
        } else {
            VRAlarmIntentLog.logger.error("VRSnoozeIntent stopRinging skipped: no uuid for appKey=\(resolvedKey, privacy: .public)")
        }

        // The occurrence identity is CONSTANT across the chain: read it from the
        // ringing alarm's metadata, carry it into the new comeback chain.
        let context = VRAlarmIntentStore.occurrenceContext(appKey: resolvedKey)
        let reminderId = context.reminderId.isEmpty
            ? VRAlarmIntentGuards.reminderId(fromAppKey: resolvedKey)
            : context.reminderId
        let occurrenceAt = context.occurrenceAt
        let newChainId = VRAlarmIntentGuards.laterChainId(resolvedKey: resolvedKey, tapMillis: nowMillis)

        // 1) Each Later starts a NEW chain: cancel the CURRENT chain's remaining
        //    pre-armed comeback siblings. Deliberately BEFORE arming the new
        //    chain (whose keys are computed from `now`, so they do not collide).
        VRAlarmNagChain.cancelSiblings(of: resolvedKey, atMillis: nowMillis)

        // 2) Arm the new comeback chain: comeback at now+5 (step 0) plus two nags
        //    at now+10 / now+15 (steps 1, 2) so an ignored comeback still nags
        //    twice. Comeback first — it is the ring that matters.
        let title = alarmTitle ?? VRAlarmIntentStore.storedTitle(appKey: resolvedKey) ?? "Reminder"
        let sound = soundName ?? VRAlarmIntentStore.storedSoundName(appKey: resolvedKey)
        let nag1At = comebackAt + minutes * 60_000
        let nag2At = nag1At + minutes * 60_000
        let k0 = VRAlarmIntentGuards.comebackAppKey(reminderId: reminderId, fireMillis: comebackAt)
        let k1 = VRAlarmIntentGuards.comebackAppKey(reminderId: reminderId, fireMillis: nag1At)
        let k2 = VRAlarmIntentGuards.comebackAppKey(reminderId: reminderId, fireMillis: nag2At)

        func laterMetadata(step: Int, fireMillis: Int, siblings: [String]) -> [String: String] {
            return [
                VRAlarmIntentKeys.reminderIdMetadataKey: reminderId,
                VRAlarmIntentKeys.occurrenceAtMetadataKey: String(occurrenceAt),
                VRAlarmIntentKeys.chainIdMetadataKey: newChainId,
                VRAlarmIntentKeys.chainStepMetadataKey: String(step),
                VRAlarmIntentKeys.kindMetadataKey: "later",
                VRAlarmIntentKeys.scheduledForMetadataKey: String(fireMillis),
                VRAlarmIntentKeys.siblingsMetadataKey: siblings.joined(separator: ","),
                "snoozed": "1",
            ]
        }

        func date(_ millis: Int) -> Date { Date(timeIntervalSince1970: Double(millis) / 1000.0) }

        // AWAIT the comeback registration (no detached try? + sleep). On failure
        // persist scheduleFailed and do NOT claim a snooze.
        do {
            _ = try await VRFollowUpScheduler.scheduleAlarm(
                appKey: k0,
                fireDate: date(comebackAt),
                title: title,
                soundName: sound,
                snoozeMinutes: minutes,
                metadata: laterMetadata(step: 0, fireMillis: comebackAt, siblings: [k1, k2])
            )
        } catch {
            VRAlarmIntentStore.appendEvent(
                kind: VRAlarmIntentKeys.scheduleFailedEvent,
                appKey: resolvedKey,
                alarmId: alarmID,
                reminderId: reminderId,
                occurrenceAt: occurrenceAt,
                chainId: newChainId,
                chainStep: 0,
                snoozeUntil: nil,
                error: String(describing: error),
                atMillis: VRAlarmIntentGuards.epochMillis(Date())
            )
            VRAlarmHint.post(reason: "intent")
            VRAlarmIntentLog.logger.error("VRSnoozeIntent comeback registration failed appKey=\(resolvedKey, privacy: .public) error=\(String(describing: error), privacy: .public)")
            return .result()
        }

        // The two nags are best-effort: an ignored comeback still nags, but a nag
        // that fails to arm must not void the snooze the user already has.
        var partialError: String?
        do {
            _ = try await VRFollowUpScheduler.scheduleAlarm(
                appKey: k1,
                fireDate: date(nag1At),
                title: title,
                soundName: sound,
                snoozeMinutes: minutes,
                metadata: laterMetadata(step: 1, fireMillis: nag1At, siblings: [k0, k2])
            )
        } catch { partialError = String(describing: error) }
        do {
            _ = try await VRFollowUpScheduler.scheduleAlarm(
                appKey: k2,
                fireDate: date(nag2At),
                title: title,
                soundName: sound,
                snoozeMinutes: minutes,
                metadata: laterMetadata(step: 2, fireMillis: nag2At, siblings: [k0, k1])
            )
        } catch { partialError = String(describing: error) }

        VRAlarmIntentStore.appendEvent(
            kind: VRAlarmIntentKeys.snoozedEvent,
            appKey: resolvedKey,
            alarmId: alarmID,
            reminderId: reminderId,
            occurrenceAt: occurrenceAt,
            chainId: newChainId,
            chainStep: 0,
            snoozeUntil: comebackAt,
            error: partialError,
            atMillis: nowMillis
        )
        VRAlarmHint.post(reason: "intent")
        VRAlarmIntentLog.logger.notice("VRSnoozeIntent perform end appKey=\(resolvedKey, privacy: .public) chainId=\(newChainId, privacy: .public) snoozeUntilMillis=\(comebackAt, privacy: .public)")
        return .result()
    }
}

// MARK: - Stop ("Done")

@available(iOS 26.0, *)
struct VRStopIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Done"
    static var openAppWhenRun: Bool = false
    static var isDiscoverable: Bool = false
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
        VRAlarmIntentLog.logger.notice("VRStopIntent perform start alarmID=\(alarmID, privacy: .public) appKey=\(resolvedKey, privacy: .public) tsMillis=\(nowMillis, privacy: .public) snoozeGuardMillis=\(snoozeUntil ?? -1, privacy: .public)")

        // GUARD 2 — iOS runs the stop intent even when the user tapped Later. If a
        // snooze is in flight this invocation is spurious: log nothing, cancel
        // nothing, clear nothing.
        if !VRAlarmIntentGuards.shouldRecordStop(snoozeUntilMillis: snoozeUntil, nowMillis: nowMillis) {
            VRAlarmIntentLog.logger.notice("VRStopIntent skipped: snooze guard active appKey=\(resolvedKey, privacy: .public)")
        }
        guard VRAlarmIntentGuards.shouldRecordStop(snoozeUntilMillis: snoozeUntil, nowMillis: nowMillis) else {
            return .result()
        }

        let context = VRAlarmIntentStore.occurrenceContext(appKey: resolvedKey)
        VRAlarmIntentStore.appendEvent(
            kind: VRAlarmIntentKeys.stoppedEvent,
            appKey: resolvedKey,
            alarmId: alarmID,
            reminderId: context.reminderId,
            occurrenceAt: context.occurrenceAt,
            chainId: context.chainId,
            chainStep: context.chainStep,
            snoozeUntil: nil,
            error: nil,
            atMillis: nowMillis
        )

        // Done ends the chain: every comeback still armed for this ring goes away.
        // Deliberately AFTER the GUARD 2 return above.
        VRAlarmNagChain.cancelSiblings(of: resolvedKey, atMillis: nowMillis)

        VRAlarmIntentStore.clearUUID(appKey: resolvedKey)
        VRAlarmIntentStore.clearSnoozeGuard(appKey: resolvedKey)

        VRAlarmHint.post(reason: "intent")
        VRAlarmIntentLog.logger.notice("VRStopIntent perform end appKey=\(resolvedKey, privacy: .public) recorded=stopped")
        return .result()
    }
}

// MARK: - Resolution helpers

enum VRAlarmIntentResolution {
    static func appKey(appKey: String?, alarmID: String?) -> String {
        if let appKey = appKey, !appKey.isEmpty { return appKey }
        if let alarmID = alarmID, let recovered = VRAlarmIntentStore.appKey(forUUID: alarmID) { return recovered }
        return ""
    }
}

// MARK: - INTEGRATION SEAM (AK-1)
//
// The places this file names AK-1 symbols. If VRAlarmScheduler's shape differs,
// fix it here. All are defined in the generated Swift in plugins/withAlarmKit.js
// (same compiled target):
//   - VRAlarmFollowUpScheduling (the scheduler protocol below)
//   - VRAlarmHint.post(reason:)  — posts the "please peek" NotificationCenter hint
//   - vrAlarmEventLock           — the shared NSLock serializing the event log

@available(iOS 26.0, *)
protocol VRAlarmFollowUpScheduling {
    /// Must perform guard 5: cancel the app key's existing UUID, schedule a new
    /// alarm, persist appKey -> new UUID. AWAITED by the Snooze intent, so a
    /// registration failure surfaces as a throw (ring-state fix — no more
    /// detached `try?`). Callable off the main actor.
    static func scheduleAlarm(
        appKey: String,
        fireDate: Date,
        title: String,
        soundName: String?,
        snoozeMinutes: Int,
        metadata: [String: String]
    ) async throws -> UUID

    /// Ladder sibling-cancel. Rotation-aware, silent no-op for an unscheduled key.
    static func cancel(appKey: String)

    /// Silences an actively alerting alarm and does nothing else. Silent no-op
    /// for an alarm that is not alerting.
    static func stopRinging(uuid: UUID)
}

@available(iOS 26.0, *)
typealias VRFollowUpScheduler = VRAlarmScheduler

@available(iOS 26.0, *)
extension VRAlarmScheduler: VRAlarmFollowUpScheduling {}

// MARK: - Self-test for the pure guard logic
//
// Stands in for XCTest: no Mac here. Call from the diagnostics screen path AK-1
// already exposes; empty result == pass.

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

        // Degraded metadata
        expect(eventIdentifier(appKey: "reminder_a_1", alarmID: "U") == "reminder_a_1", "app key preferred")
        expect(eventIdentifier(appKey: "", alarmID: "U") == "uuid:U", "uuid fallback")
        expect(eventIdentifier(appKey: nil, alarmID: nil) == "unknown", "unknown fallback")

        // Comeback keys + chain identity
        expect(comebackAppKey(reminderId: "a", fireMillis: 301_000) == "snooze_a_301000", "comeback key shape")
        expect(laterChainId(resolvedKey: "reminder_a_1000", tapMillis: 5) == "later:reminder_a_1000:5", "later chain id")
        expect(reminderId(fromAppKey: "reminder_a_1000") == "a", "reminderId parsed from occurrence key")
        expect(reminderId(fromAppKey: "snooze_a_301000") == "a", "reminderId parsed from comeback key")
        expect(reminderId(fromAppKey: "reminder_a_b_1000") == "a_b", "reminderId keeps internal underscores")
        expect(trailingTimestamp(fromAppKey: "snooze_a_301000") == 301_000, "trailing timestamp parsed")

        // Sibling parsing
        let occurrence = "reminder_a_1000"
        let comeback1 = "snooze_a_301000"
        let comeback2 = "snooze_a_601000"
        let comeback3 = "snooze_a_901000"
        expect(siblingKeys(rawSiblings: nil, excluding: occurrence).isEmpty, "no siblings key => nothing to cancel")
        expect(siblingKeys(rawSiblings: "", excluding: occurrence).isEmpty, "empty siblings => nothing to cancel")
        expect(siblingKeys(rawSiblings: comeback1 + "," + comeback2 + "," + comeback3, excluding: occurrence)
                 == [comeback1, comeback2, comeback3],
               "cancel all siblings")
        expect(siblingKeys(rawSiblings: " " + comeback1 + " , " + comeback2 + " ", excluding: occurrence)
                 == [comeback1, comeback2],
               "whitespace tolerated")
        expect(siblingKeys(rawSiblings: comeback1 + ",," + comeback1, excluding: occurrence) == [comeback1],
               "blanks dropped and keys de-duplicated")
        expect(siblingKeys(rawSiblings: occurrence + "," + comeback1, excluding: occurrence) == [comeback1],
               "own key never cancelled")
        expect(siblingKeys(rawSiblings: "snooze_until_" + occurrence + "," + comeback1, excluding: occurrence) == [comeback1],
               "the snooze guard key never reaches cancel")
        expect(isCancellableAlarmKey(occurrence) && isCancellableAlarmKey(comeback1),
               "both alarm key families are cancellable")
        expect(isCancellableAlarmKey("snooze_until_" + occurrence) == false,
               "the guard key is not an alarm")

        return failures
    }
}
#endif
