/**
 * Expo config plugin to add the iOS AlarmKit native module (AK-1).
 * See docs/alarmkit-port-prd.md for the frozen `AlarmKitBridge` contract and the race guards.
 *
 * This adds (iOS only — nothing here touches Android):
 * 1. AlarmKitBridge.swift   - RN module implementing the frozen contract, iOS 26 gated
 * 2. AlarmKitBridge.m       - RCT_EXTERN_MODULE export for the Swift class
 * 3. VRAlarmScheduler.swift - AlarmManager wrapper, UUID registry, event log
 * 4. VRAlarmIntents.swift   - AK-2 hook slot (see INTENTS_HOOK below)
 * 5. Links all four into the app target and adds NSAlarmKitUsageDescription
 */

const { withXcodeProject, withDangerousMod, withInfoPlist, IOSConfig } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const ALARM_KIT_USAGE_DESCRIPTION =
  "VoiceReminder uses alarms so spoken reminders ring even when your phone is silenced.";

// AlarmKitBridge.swift content
const ALARM_KIT_BRIDGE_SWIFT = `import Foundation

/// React Native module implementing the frozen \`AlarmKitBridge\` contract from
/// docs/alarmkit-port-prd.md. Method selectors are declared in AlarmKitBridge.m.
///
/// Every AlarmKit reference sits behind \`@available(iOS 26.0, *)\` so the class still
/// loads (and \`isSupported()\` answers false) on older iOS instead of crashing.
@objc(AlarmKitBridge)
class AlarmKitBridge: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { return false }

  @objc(isSupported:rejecter:)
  func isSupported(_ resolve: @escaping RCTPromiseResolveBlock,
                   rejecter reject: @escaping RCTPromiseRejectBlock) {
    resolve(VRAlarmSupport.isSupported)
  }

  @objc(requestAuthorization:rejecter:)
  func requestAuthorization(_ resolve: @escaping RCTPromiseResolveBlock,
                            rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard VRAlarmSupport.isSupported, #available(iOS 26.0, *) else {
      resolve("denied")
      return
    }
    Task {
      resolve(await VRAlarmScheduler.requestAuthorization())
    }
  }

  @objc(scheduleAlarm:resolver:rejecter:)
  func scheduleAlarm(_ opts: NSDictionary,
                     resolver resolve: @escaping RCTPromiseResolveBlock,
                     rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard VRAlarmSupport.isSupported, #available(iOS 26.0, *) else {
      reject("unsupported", "AlarmKit requires iOS 26 or later", nil)
      return
    }
    guard let appKey = opts["id"] as? String, !appKey.isEmpty,
          let fireDate = (opts["fireDate"] as? NSNumber)?.doubleValue else {
      reject("bad_args", "scheduleAlarm requires a non-empty id and a numeric fireDate", nil)
      return
    }

    let title = (opts["title"] as? String) ?? "Reminder"
    let soundName = opts["soundName"] as? String
    let snoozeMinutes = (opts["snoozeMinutes"] as? NSNumber)?.intValue ?? 5
    let metadata = (opts["metadata"] as? [String: String]) ?? [:]

    Task {
      do {
        let uuid = try await VRAlarmScheduler.schedule(appKey: appKey,
                                                       fireDateMs: fireDate,
                                                       title: title,
                                                       soundName: soundName,
                                                       snoozeMinutes: snoozeMinutes,
                                                       metadata: metadata)
        resolve(uuid)
      } catch {
        reject("schedule_failed", error.localizedDescription, error)
      }
    }
  }

  @objc(cancelAlarm:resolver:rejecter:)
  func cancelAlarm(_ appKey: String,
                   resolver resolve: @escaping RCTPromiseResolveBlock,
                   rejecter reject: @escaping RCTPromiseRejectBlock) {
    // Contract: resolves silently when the app key is unknown.
    if VRAlarmSupport.isSupported, #available(iOS 26.0, *) {
      VRAlarmScheduler.cancel(appKey: appKey)
    }
    resolve(nil)
  }

  @objc(getScheduledAlarms:rejecter:)
  func getScheduledAlarms(_ resolve: @escaping RCTPromiseResolveBlock,
                          rejecter reject: @escaping RCTPromiseRejectBlock) {
    resolve(VRAlarmStore.registryEntries())
  }

  @objc(getAndClearEventLog:rejecter:)
  func getAndClearEventLog(_ resolve: @escaping RCTPromiseResolveBlock,
                           rejecter reject: @escaping RCTPromiseRejectBlock) {
    resolve(VRAlarmStore.drainEvents())
  }

  /// Dev-only proof of life (PRD rollout step 1). Not part of the frozen contract.
  @objc(scheduleTestAlarm:resolver:rejecter:)
  func scheduleTestAlarm(_ secondsFromNow: NSNumber,
                         resolver resolve: @escaping RCTPromiseResolveBlock,
                         rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard VRAlarmSupport.isSupported, #available(iOS 26.0, *) else {
      reject("unsupported", "AlarmKit requires iOS 26 or later", nil)
      return
    }
    let fireDate = Date().timeIntervalSince1970 * 1000 + secondsFromNow.doubleValue * 1000
    Task {
      do {
        let uuid = try await VRAlarmScheduler.schedule(appKey: "vr_test_alarm",
                                                       fireDateMs: fireDate,
                                                       title: "VoiceReminder test alarm",
                                                       soundName: nil,
                                                       snoozeMinutes: 5,
                                                       metadata: ["reminderId": "test",
                                                                  "scheduledFor": String(Int(fireDate)),
                                                                  "tier": "test",
                                                                  "variantIndex": "0"])
        resolve(uuid)
      } catch {
        reject("schedule_failed", error.localizedDescription, error)
      }
    }
  }

  /// Copies a staged wav into Library/Sounds, where AlarmKit resolves alarm
  /// sounds by bare filename. Pure FileManager, no AlarmKit: expo-file-system
  /// cannot write outside its scoped directories, so placement happens here.
  @objc(placeAlarmSound:fileName:resolver:rejecter:)
  func placeAlarmSound(_ sourcePath: NSString, fileName: NSString,
                       resolver resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {
    do {
      let fm = FileManager.default
      let libraryUrl = try fm.url(for: .libraryDirectory, in: .userDomainMask,
                                  appropriateFor: nil, create: true)
      let soundsDir = libraryUrl.appendingPathComponent("Sounds", isDirectory: true)
      if !fm.fileExists(atPath: soundsDir.path) {
        try fm.createDirectory(at: soundsDir, withIntermediateDirectories: true)
      }
      var src = sourcePath as String
      if src.hasPrefix("file://"), let srcUrl = URL(string: src) {
        src = srcUrl.path
      }
      let dest = soundsDir.appendingPathComponent(fileName as String)
      if fm.fileExists(atPath: dest.path) {
        try fm.removeItem(at: dest)
      }
      try fm.copyItem(atPath: src, toPath: dest.path)
      resolve(dest.path)
    } catch {
      reject("place_sound_failed",
             "Failed to place alarm sound: " + error.localizedDescription, error)
    }
  }

  /// Removes a placed alarm sound (deletion / re-record flows). Never rejects.
  @objc(removeAlarmSound:resolver:rejecter:)
  func removeAlarmSound(_ fileName: NSString,
                        resolver resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
    do {
      let fm = FileManager.default
      let libraryUrl = try fm.url(for: .libraryDirectory, in: .userDomainMask,
                                  appropriateFor: nil, create: false)
      let dest = libraryUrl.appendingPathComponent("Sounds", isDirectory: true)
        .appendingPathComponent(fileName as String)
      if fm.fileExists(atPath: dest.path) {
        try fm.removeItem(at: dest)
      }
      resolve(true)
    } catch {
      resolve(false)
    }
  }
}
`;

// AlarmKitBridge.m content
const ALARM_KIT_BRIDGE_OBJC = `#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(AlarmKitBridge, NSObject)

RCT_EXTERN_METHOD(isSupported:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(requestAuthorization:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(scheduleAlarm:(NSDictionary *)opts
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(cancelAlarm:(NSString *)appKey
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getScheduledAlarms:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getAndClearEventLog:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(scheduleTestAlarm:(nonnull NSNumber *)secondsFromNow
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(placeAlarmSound:(NSString *)sourcePath
                  fileName:(NSString *)fileName
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(removeAlarmSound:(NSString *)fileName
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

// requiresMainQueueSetup lives on the Swift class — declaring it here too would
// collide with the primary class implementation.

@end
`;

// VRAlarmScheduler.swift content
const VR_ALARM_SCHEDULER_SWIFT = `import Foundation
#if canImport(AlarmKit)
import AlarmKit
#endif
#if canImport(ActivityKit)
import ActivityKit
#endif
import SwiftUI

/// Runtime capability check. Kept separate from the AlarmKit-gated types so the
/// bridge can answer \`isSupported()\` without touching an unavailable framework.
enum VRAlarmSupport {
  static var isSupported: Bool {
    #if canImport(AlarmKit)
    if #available(iOS 26.0, *) { return true }
    #endif
    return false
  }
}

/// UserDefaults-backed state shared between the bridge and the App Intents.
/// Keys are frozen by the PRD — AK-2 and AK-4 read/write the same names.
enum VRAlarmStore {
  static let uuidsKey = "vr_alarm_uuids"          // appKey -> UUID string (PRD registry)
  static let eventsKey = "vr_alarm_events"        // JSON array, drained by JS on foreground
  static let snoozeGuardPrefix = "snooze_until_"  // + appKey -> epoch ms
  static let metaKey = "vr_alarm_meta"            // appKey -> title/soundName/snoozeMinutes/metadata

  // Not in the PRD contract: parallel appKey -> epoch ms map so getScheduledAlarms()
  // can report fireDate without querying AlarmKit. Always written via setUUID.
  static let fireDatesKey = "vr_alarm_firedates"

  /// Must resolve to the same container as VRAlarmIntentDefaults.store (AK-2), or the
  /// intents and the bridge read different registries. Absent App Group = .standard.
  static var defaults: UserDefaults {
    if let group = Bundle.main.object(forInfoDictionaryKey: "VRAlarmAppGroup") as? String,
       !group.isEmpty,
       let shared = UserDefaults(suiteName: group) {
      return shared
    }
    return UserDefaults.standard
  }

  static func nowMs() -> Double { Date().timeIntervalSince1970 * 1000 }

  // MARK: UUID registry (PRD guard 5: rotation, never cancelAll)

  static func uuid(forAppKey appKey: String) -> UUID? {
    guard let map = defaults.dictionary(forKey: uuidsKey) as? [String: String],
          let raw = map[appKey] else { return nil }
    return UUID(uuidString: raw)
  }

  static func setUUID(_ uuid: UUID?, fireDate: Double?, forAppKey appKey: String) {
    var uuids = (defaults.dictionary(forKey: uuidsKey) as? [String: String]) ?? [:]
    var fireDates = (defaults.dictionary(forKey: fireDatesKey) as? [String: Double]) ?? [:]
    if let uuid = uuid {
      uuids[appKey] = uuid.uuidString
      fireDates[appKey] = fireDate ?? 0
    } else {
      uuids.removeValue(forKey: appKey)
      fireDates.removeValue(forKey: appKey)
    }
    defaults.set(uuids, forKey: uuidsKey)
    defaults.set(fireDates, forKey: fireDatesKey)
  }

  static func registryEntries() -> [[String: Any]] {
    let uuids = (defaults.dictionary(forKey: uuidsKey) as? [String: String]) ?? [:]
    let fireDates = (defaults.dictionary(forKey: fireDatesKey) as? [String: Double]) ?? [:]
    return uuids.map { appKey, uuid in
      ["id": appKey, "uuid": uuid, "fireDate": fireDates[appKey] ?? 0]
    }
  }

  // MARK: Alarm meta (AK-2's SnoozeIntent recovers title/sound/window from here)

  static func setMeta(appKey: String, title: String, soundName: String?, snoozeMinutes: Int, metadata: [String: String]) {
    var all = (defaults.dictionary(forKey: metaKey) as? [String: [String: Any]]) ?? [:]
    var record: [String: Any] = ["title": title, "snoozeMinutes": snoozeMinutes, "metadata": metadata]
    if let soundName = soundName { record["soundName"] = soundName }
    all[appKey] = record
    defaults.set(all, forKey: metaKey)
  }

  static func clearMeta(appKey: String) {
    var all = (defaults.dictionary(forKey: metaKey) as? [String: [String: Any]]) ?? [:]
    all.removeValue(forKey: appKey)
    defaults.set(all, forKey: metaKey)
  }

  // MARK: Snooze guard (PRD guards 1-3)

  static func setSnoozeGuard(_ snoozeUntilMs: Double, appKey: String) {
    defaults.set(snoozeUntilMs, forKey: snoozeGuardPrefix + appKey)
  }

  static func isSnoozeGuardActive(appKey: String) -> Bool {
    return defaults.double(forKey: snoozeGuardPrefix + appKey) > nowMs()
  }

  static func clearSnoozeGuard(appKey: String) {
    defaults.removeObject(forKey: snoozeGuardPrefix + appKey)
  }

  // MARK: Event log

  static func appendEvent(type: String, appKey: String, snoozeUntil: Double? = nil) {
    var event: [String: Any] = ["type": type, "id": appKey, "at": nowMs()]
    if let snoozeUntil = snoozeUntil { event["snoozeUntil"] = snoozeUntil }
    var events = decodeEvents()
    events.append(event)
    // Bound the log: JS drains on every foreground, so anything older is dead weight.
    if events.count > 200 { events.removeFirst(events.count - 200) }
    guard let data = try? JSONSerialization.data(withJSONObject: events, options: []),
          let json = String(data: data, encoding: .utf8) else { return }
    defaults.set(json, forKey: eventsKey)
  }

  static func decodeEvents() -> [[String: Any]] {
    guard let json = defaults.string(forKey: eventsKey),
          let data = json.data(using: .utf8),
          let parsed = try? JSONSerialization.jsonObject(with: data, options: []) as? [[String: Any]] else {
      return []
    }
    return parsed
  }

  static func drainEvents() -> [[String: Any]] {
    let events = decodeEvents()
    defaults.removeObject(forKey: eventsKey)
    return events
  }
}

#if canImport(AlarmKit)

@available(iOS 26.0, *)
struct VRAlarmMetadata: AlarmMetadata {
  var appKey: String
  var values: [String: String]
}

/// Thin wrapper over AlarmManager. All alarm identity flows through the app key;
/// the native UUID is an implementation detail held in the registry.
@available(iOS 26.0, *)
enum VRAlarmScheduler {

  static func requestAuthorization() async -> String {
    do {
      let state = try await AlarmManager.shared.requestAuthorization()
      // Matched by description rather than by enum case: the nested authorization
      // type name is the piece of the iOS 26 API most likely to drift, and we have
      // no Mac to catch a rename before a 15-minute EAS cycle burns.
      return normalizeAuthorization(String(describing: state))
    } catch {
      return "denied"
    }
  }

  private static func normalizeAuthorization(_ raw: String) -> String {
    let lowered = raw.lowercased()
    if lowered.contains("authorized") { return "authorized" }
    if lowered.contains("denied") { return "denied" }
    return "notDetermined"
  }

  /// Brand accent, literal on purpose. \`Color.accentColor\` is semantic: the attributes
  /// are encoded and rendered out of process, so it resolves against the system's
  /// asset catalog rather than ours and lands on system blue. Hex #3D8BFF, kept in
  /// sync by hand with \`colors.accent\` in lib/theme.ts.
  private static let brandTint = Color(red: 61.0 / 255.0, green: 139.0 / 255.0, blue: 255.0 / 255.0)

  /// The alert half of the presentation. Forked on 26.1 because that is where the
  /// non-deprecated init lands — see the availability note on each branch.
  private static func makeAlert(title: String) -> AlarmPresentation.Alert {
    let later = AlarmButton(text: "Later", textColor: .white, systemImageName: "clock.badge")

    if #available(iOS 26.1, *) {
      // System-provided stop control (slide-to-stop). We no longer describe it —
      // the label was already ignored — but \`stopIntent\` still runs from it.
      return AlarmPresentation.Alert(
        title: LocalizedStringResource(stringLiteral: title),
        secondaryButton: later,
        // .custom (not .countdown) so VRSnoozeIntent actually runs on tap.
        secondaryButtonBehavior: .custom
      )
    }

    // iOS 26.0 only: the init above does not exist yet, so the deprecated one stays
    // as the floor. Emits a deprecation warning when compiled; that is expected.
    return AlarmPresentation.Alert(
      title: LocalizedStringResource(stringLiteral: title),
      stopButton: AlarmButton(text: "Done", textColor: .white, systemImageName: "checkmark.circle.fill"),
      secondaryButton: later,
      secondaryButtonBehavior: .custom
    )
  }

  private static func makeConfiguration(alarmID: UUID,
                                        appKey: String,
                                        fireDate: Date,
                                        title: String,
                                        soundName: String?,
                                        snoozeMinutes: Int,
                                        metadata: [String: String]) -> AlarmManager.AlarmConfiguration<VRAlarmMetadata> {
    let alert = makeAlert(title: title)

    let attributes = AlarmAttributes<VRAlarmMetadata>(
      presentation: AlarmPresentation(alert: alert),
      metadata: VRAlarmMetadata(appKey: appKey, values: metadata),
      tintColor: brandTint
    )

    // Bare filename incl. extension, resolved from Library/Sounds (AK-3 writes it there).
    var sound: AlertConfiguration.AlertSound = .default
    if let soundName = soundName, !soundName.isEmpty {
      sound = .named(soundName)
    }

    return AlarmManager.AlarmConfiguration(
      schedule: .fixed(fireDate),
      attributes: attributes,
      stopIntent: VRStopIntent(alarmID: alarmID, appKey: appKey),
      secondaryIntent: VRSnoozeIntent(alarmID: alarmID,
                                      appKey: appKey,
                                      alarmTitle: title,
                                      soundName: soundName,
                                      snoozeMinutes: snoozeMinutes),
      sound: sound
    )
  }

  /// Bridge entry point: awaits AlarmKit so scheduling failures reach the JS promise.
  static func schedule(appKey: String,
                       fireDateMs: Double,
                       title: String,
                       soundName: String?,
                       snoozeMinutes: Int,
                       metadata: [String: String]) async throws -> String {
    // PRD guard 5: AlarmKit has no cancelAll(); rotate the previous UUID first.
    cancel(appKey: appKey)

    let alarmID = UUID()
    let configuration = makeConfiguration(alarmID: alarmID,
                                          appKey: appKey,
                                          fireDate: Date(timeIntervalSince1970: fireDateMs / 1000),
                                          title: title,
                                          soundName: soundName,
                                          snoozeMinutes: snoozeMinutes,
                                          metadata: metadata)

    _ = try await AlarmManager.shared.schedule(id: alarmID, configuration: configuration)
    VRAlarmStore.setUUID(alarmID, fireDate: fireDateMs, forAppKey: appKey)
    VRAlarmStore.setMeta(appKey: appKey, title: title, soundName: soundName,
                         snoozeMinutes: snoozeMinutes, metadata: metadata)
    return alarmID.uuidString
  }

  /// AK-2 seam (VRAlarmFollowUpScheduling): synchronous and nonisolated, because an
  /// intent's perform() cannot await us and still write its guard first. Registry and
  /// meta are committed here; the AlarmKit call rides a detached Task that PRD guard 4's
  /// 1s sleep in VRSnoozeIntent gives time to land.
  @discardableResult
  static func scheduleAlarm(appKey: String,
                            fireDate: Date,
                            title: String,
                            soundName: String?,
                            snoozeMinutes: Int,
                            metadata: [String: String]) throws -> UUID {
    // PRD guard 5.
    cancel(appKey: appKey)

    let alarmID = UUID()
    let configuration = makeConfiguration(alarmID: alarmID,
                                          appKey: appKey,
                                          fireDate: fireDate,
                                          title: title,
                                          soundName: soundName,
                                          snoozeMinutes: snoozeMinutes,
                                          metadata: metadata)

    VRAlarmStore.setUUID(alarmID, fireDate: fireDate.timeIntervalSince1970 * 1000, forAppKey: appKey)
    VRAlarmStore.setMeta(appKey: appKey, title: title, soundName: soundName,
                         snoozeMinutes: snoozeMinutes, metadata: metadata)

    Task.detached {
      _ = try? await AlarmManager.shared.schedule(id: alarmID, configuration: configuration)
    }
    return alarmID
  }

  /// Also the CL-2 seam (VRAlarmFollowUpScheduling.cancel): the intents cancel a
  /// ladder's remaining rungs through here so rotation stays in exactly one place.
  /// Must stay a silent no-op for an unknown key — a rung that already rotated
  /// away is the normal case, not an error.
  static func cancel(appKey: String) {
    guard let uuid = VRAlarmStore.uuid(forAppKey: appKey) else { return }
    try? AlarmManager.shared.cancel(id: uuid)
    VRAlarmStore.setUUID(nil, fireDate: nil, forAppKey: appKey)
    VRAlarmStore.clearMeta(appKey: appKey)
  }
}

#endif
`;

// ---------------------------------------------------------------------------
// INTENTS HOOK (AK-2)
//
// AK-2 owns VRAlarmIntents.swift. Drop the real implementation at
// plugins/ios-src/VRAlarmIntents.swift and this plugin writes that file verbatim
// instead of the placeholder below — no change needed here.
//
// Initializer signatures VRAlarmScheduler.makeConfiguration depends on — AK-2's
// real file must keep these identical, and the placeholder below mirrors them:
//   VRStopIntent(alarmID: UUID, appKey: String)
//   VRSnoozeIntent(alarmID: UUID, appKey: String, alarmTitle: String?, soundName: String?, snoozeMinutes: Int)
//
// Static members the real file conforms VRAlarmScheduler to (CL-2's cadence
// ladder — renaming either breaks the intents, not this plugin):
//   VRAlarmScheduler.scheduleAlarm(appKey:fireDate:title:soundName:snoozeMinutes:metadata:)
//   VRAlarmScheduler.cancel(appKey:)
//
// The ladder's `siblings` / `rung` / `rungCount` keys need no handling here: the
// scheduler persists the whole metadata dict per app key (VRAlarmStore.setMeta),
// and the intents read it back through that same record.
// ---------------------------------------------------------------------------
const INTENTS_SOURCE_PLACEHOLDER = `import AppIntents
import Foundation

// AK-1 PLACEHOLDER — replaced verbatim by AK-2 via plugins/ios-src/VRAlarmIntents.swift.
// Enough to compile and ring standalone: guards 1, 2 and 4 are wired; the native
// follow-up reschedule on snooze is AK-2's.

@available(iOS 26.0, *)
struct VRStopIntent: LiveActivityIntent {
  static var title: LocalizedStringResource { "Done" }
  static var openAppWhenRun: Bool { true }
  static var isDiscoverable: Bool { false }

  @Parameter(title: "Alarm ID")
  var alarmID: String

  @Parameter(title: "App Key")
  var appKey: String

  init() { self.alarmID = ""; self.appKey = "" }
  init(alarmID: UUID, appKey: String) {
    self.alarmID = alarmID.uuidString
    self.appKey = appKey
  }

  func perform() async throws -> some IntentResult {
    // PRD guard 2: iOS fires the stop intent even when the user tapped Later.
    if VRAlarmStore.isSnoozeGuardActive(appKey: appKey) { return .result() }
    VRAlarmStore.appendEvent(type: "stopped", appKey: appKey)
    VRAlarmStore.setUUID(nil, fireDate: nil, forAppKey: appKey)
    VRAlarmStore.clearSnoozeGuard(appKey: appKey)
    return .result()
  }
}

@available(iOS 26.0, *)
struct VRSnoozeIntent: LiveActivityIntent {
  static var title: LocalizedStringResource { "Later" }
  static var openAppWhenRun: Bool { false }
  static var isDiscoverable: Bool { false }

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

  init() { self.alarmID = ""; self.appKey = "" }
  init(alarmID: UUID, appKey: String, alarmTitle: String?, soundName: String?, snoozeMinutes: Int) {
    self.alarmID = alarmID.uuidString
    self.appKey = appKey
    self.alarmTitle = alarmTitle
    self.soundName = soundName
    self.snoozeMinutes = snoozeMinutes
  }

  func perform() async throws -> some IntentResult {
    // PRD guard 1: the snooze guard is written before any other work.
    let minutes = snoozeMinutes ?? 5
    let snoozeUntil = VRAlarmStore.nowMs() + Double(minutes) * 60_000
    VRAlarmStore.setSnoozeGuard(snoozeUntil, appKey: appKey)
    VRAlarmStore.appendEvent(type: "snoozed", appKey: appKey, snoozeUntil: snoozeUntil)
    // AK-2 schedules the native follow-up here, before the sleep below.
    // PRD guard 4: give AlarmKit a beat to register it before iOS suspends us.
    try? await Task.sleep(nanoseconds: 1_000_000_000)
    return .result()
  }
}
`;

// Filename -> source resolver. Order matters only for readability; all four are
// added to the same app target as compiled sources.
function getSourceFiles(projectRoot) {
  const overridePath = path.join(projectRoot, "plugins", "ios-src", "VRAlarmIntents.swift");
  let intentsSource = INTENTS_SOURCE_PLACEHOLDER;
  if (fs.existsSync(overridePath)) {
    intentsSource = fs.readFileSync(overridePath, "utf8");
    console.log("[withAlarmKit] Using plugins/ios-src/VRAlarmIntents.swift (AK-2 override)");
  }

  return [
    { name: "AlarmKitBridge.swift", contents: ALARM_KIT_BRIDGE_SWIFT },
    { name: "AlarmKitBridge.m", contents: ALARM_KIT_BRIDGE_OBJC },
    { name: "VRAlarmScheduler.swift", contents: VR_ALARM_SCHEDULER_SWIFT },
    { name: "VRAlarmIntents.swift", contents: intentsSource },
  ];
}

function getProjectName(config) {
  try {
    return IOSConfig.XcodeUtils.getProjectName(config.modRequest.projectRoot);
  } catch (e) {
    return IOSConfig.XcodeUtils.sanitizedName(config.modRequest.projectName || config.name || "App");
  }
}

/**
 * Swift RN modules need RCTPromiseResolveBlock/RCTBridgeModule visible via the
 * target's bridging header. The Expo template may or may not ship one, so reuse
 * whatever SWIFT_OBJC_BRIDGING_HEADER already points at and only create+wire a
 * header when the setting is absent.
 */
function ensureBridgingHeader(project, platformProjectRoot, projectName) {
  const target = project.getTarget("com.apple.product-type.application");
  if (!target) {
    console.log("[withAlarmKit] No application target found; skipping bridging header");
    return;
  }

  const configurations = IOSConfig.XcodeUtils.getBuildConfigurationsForListId(
    project,
    target.target.buildConfigurationList
  );

  let headerRelativePath = null;
  for (const [, configuration] of configurations) {
    const existing = configuration.buildSettings && configuration.buildSettings.SWIFT_OBJC_BRIDGING_HEADER;
    if (existing) {
      headerRelativePath = IOSConfig.XcodeUtils.unquote(existing);
      break;
    }
  }

  if (!headerRelativePath) {
    headerRelativePath = `${projectName}/${projectName}-Bridging-Header.h`;
    for (const [, configuration] of configurations) {
      configuration.buildSettings = configuration.buildSettings || {};
      configuration.buildSettings.SWIFT_OBJC_BRIDGING_HEADER = `"${headerRelativePath}"`;
    }
    console.log(`[withAlarmKit] Set SWIFT_OBJC_BRIDGING_HEADER to ${headerRelativePath}`);
  }

  const headerPath = path.join(
    platformProjectRoot,
    headerRelativePath.replace(/\$\(SRCROOT\)[\/\\]?/g, "").replace(/^["']|["']$/g, "")
  );

  let contents = fs.existsSync(headerPath) ? fs.readFileSync(headerPath, "utf8") : "";
  const importLine = "#import <React/RCTBridgeModule.h>";
  if (!contents.includes(importLine)) {
    contents = `${contents.replace(/\s*$/, "")}\n${importLine}\n`.replace(/^\n/, "");
    fs.mkdirSync(path.dirname(headerPath), { recursive: true });
    fs.writeFileSync(headerPath, contents, "utf8");
    console.log(`[withAlarmKit] Added ${importLine} to ${headerRelativePath}`);
  }
}

function withAlarmKit(config) {
  // Step 1: write the native sources (dangerous mods run before every other ios mod).
  config = withDangerousMod(config, [
    "ios",
    async (config) => {
      const projectName = getProjectName(config);
      const sourceDir = path.join(config.modRequest.platformProjectRoot, projectName);

      if (!fs.existsSync(sourceDir)) {
        fs.mkdirSync(sourceDir, { recursive: true });
      }

      for (const file of getSourceFiles(config.modRequest.projectRoot)) {
        fs.writeFileSync(path.join(sourceDir, file.name), file.contents, "utf-8");
        console.log(`[withAlarmKit] Created ${file.name}`);
      }

      return config;
    },
  ]);

  // Step 2: link the sources into the app target and ensure the bridging header.
  config = withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectName = getProjectName(config);

    for (const file of getSourceFiles(config.modRequest.projectRoot)) {
      const filepath = `${projectName}/${file.name}`;
      if (project.hasFile(filepath)) continue;
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath,
        groupName: projectName,
        project,
      });
      console.log(`[withAlarmKit] Linked ${filepath} into the app target`);
    }

    ensureBridgingHeader(project, config.modRequest.platformProjectRoot, projectName);

    return config;
  });

  // Step 3: AlarmKit authorization prompt copy.
  config = withInfoPlist(config, (config) => {
    config.modResults.NSAlarmKitUsageDescription = ALARM_KIT_USAGE_DESCRIPTION;
    return config;
  });

  return config;
}

module.exports = withAlarmKit;
