import Foundation
import AVFoundation
import Speech
import os

/// React Native module implementing the frozen `VRSpeech` contract from
/// lib/vrSpeech.ts. Method selectors are declared in VRSpeech.m.
///
/// On-device speech-to-text on iOS 26+ via Apple's SpeechAnalyzer. Every
/// SpeechAnalyzer / SpeechTranscriber / DictationTranscriber / AssetInventory
/// reference sits behind `#available(iOS 26.0, *)` (mirroring AlarmKitBridge),
/// so the class still links on older SDK targets and every method rejects or
/// returns "unsupported" instead of failing to load.
///
/// Two engines share one code path, chosen per call:
///   "dictation"   -> DictationTranscriber (the system dictation model)
///   "transcriber" -> SpeechTranscriber   (the general model)
///
/// Error codes (matching the contract): "unsupported", "assets_missing",
/// "cancelled", "io", "analysis_failed".
@objc(VRSpeech)
class VRSpeech: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { return false }

  // MARK: - status

  @objc(status:engine:resolver:rejecter:)
  func status(_ localeId: String,
              engine: String,
              resolver resolve: @escaping RCTPromiseResolveBlock,
              rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard #available(iOS 26.0, *) else {
      resolve(["resolvedLocale": NSNull(),
               "supported": false,
               "installed": false,
               "reason": "iOS 26 required"])
      return
    }
    Task {
      guard let resolved = await vrSpeechResolveLocale(engine: engine, localeId: localeId) else {
        resolve(["resolvedLocale": NSNull(),
                 "supported": false,
                 "installed": false,
                 "reason": "locale not supported: \(localeId)"])
        return
      }
      let installed = await vrSpeechIsInstalled(engine: engine, locale: resolved)
      var out: [String: Any] = ["resolvedLocale": resolved.identifier(.bcp47),
                                "supported": true,
                                "installed": installed]
      if !installed { out["reason"] = "assets not installed" }
      resolve(out)
    }
  }

  // MARK: - prepare

  @objc(prepare:engine:resolver:rejecter:)
  func prepare(_ localeId: String,
               engine: String,
               resolver resolve: @escaping RCTPromiseResolveBlock,
               rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard #available(iOS 26.0, *) else {
      reject("unsupported", "iOS 26 required", nil)
      return
    }
    Task {
      guard let resolved = await vrSpeechResolveLocale(engine: engine, localeId: localeId) else {
        reject("unsupported", "locale not supported: \(localeId)", nil)
        return
      }
      do {
        // Installs assets if missing and preheats the analyzer; concurrent calls
        // for the same engine/locale share one in-flight install (de-dup below).
        try await vrSpeechInstaller.ensureInstalled(engine: engine, locale: resolved)
      } catch {
        reject("assets_missing",
               "failed to install speech assets: \(error.localizedDescription)", error)
        return
      }
      let installed = await vrSpeechIsInstalled(engine: engine, locale: resolved)
      vrSpeechLog("prepare done: \(engine)/\(resolved.identifier(.bcp47)) installed=\(installed)")
      resolve(["resolvedLocale": resolved.identifier(.bcp47), "installed": installed])
    }
  }

  // MARK: - transcribeFile

  @objc(transcribeFile:localeId:engine:requestId:resolver:rejecter:)
  func transcribeFile(_ fileUri: String,
                      localeId: String,
                      engine: String,
                      requestId: String,
                      resolver resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard #available(iOS 26.0, *) else {
      reject("unsupported", "iOS 26 required", nil)
      return
    }
    let start = Date()
    Task {
      guard let resolved = await vrSpeechResolveLocale(engine: engine, localeId: localeId) else {
        reject("unsupported", "locale not supported: \(localeId)", nil)
        return
      }
      guard await vrSpeechIsInstalled(engine: engine, locale: resolved) else {
        reject("assets_missing",
               "speech assets not installed for \(resolved.identifier(.bcp47)); call prepare first", nil)
        return
      }

      // Open the finished m4a. AVAudioFile decodes it; the file path of
      // analyzeSequence(from:) handles any PCM conversion the analyzer needs.
      let url = vrSpeechFileURL(fileUri)
      let audioFile: AVAudioFile
      do {
        audioFile = try AVAudioFile(forReading: url)
      } catch {
        reject("io", "could not open audio file: \(error.localizedDescription)", error)
        return
      }

      // Build the chosen transcriber and start draining its results concurrently.
      // File-read completion alone is insufficient (Apple docs): the FINAL
      // transcript accumulates on the results stream, so we collect it in a task
      // that outlives analyzeSequence and is awaited only after finalize.
      let module: any SpeechModule
      let collectTask: Task<String, Error>
      if engine == "dictation" {
        let transcriber = DictationTranscriber(locale: resolved,
                                               contentHints: [],
                                               transcriptionOptions: [],
                                               reportingOptions: [],
                                               attributeOptions: [])
        module = transcriber
        collectTask = Task<String, Error> {
          var acc = ""
          for try await result in transcriber.results where result.isFinal {
            acc += String(result.text.characters)
          }
          return acc
        }
      } else {
        let transcriber = SpeechTranscriber(locale: resolved,
                                            transcriptionOptions: [],
                                            reportingOptions: [],
                                            attributeOptions: [])
        module = transcriber
        collectTask = Task<String, Error> {
          var acc = ""
          for try await result in transcriber.results where result.isFinal {
            acc += String(result.text.characters)
          }
          return acc
        }
      }

      let analyzer = SpeechAnalyzer(modules: [module], options: nil)

      // Register for cancellation. If cancel() already arrived for this id, bail
      // now — the promise rejects "cancelled" and never resolves late.
      guard await vrSpeechSessions.register(requestId, analyzer: analyzer) else {
        collectTask.cancel()
        reject("cancelled", "transcription cancelled", nil)
        return
      }

      do {
        if let lastSample = try await analyzer.analyzeSequence(from: audioFile) {
          try await analyzer.finalizeAndFinish(through: lastSample)
        } else {
          try await analyzer.finalizeAndFinishThroughEndOfInput()
        }
        let text = (try await collectTask.value)
          .trimmingCharacters(in: .whitespacesAndNewlines)

        // If cancel() landed while we were finishing, honor it: reject, never
        // resolve. finish() removes the analyzer and reports the cancel flag.
        if await vrSpeechSessions.finish(requestId) {
          reject("cancelled", "transcription cancelled", nil)
          return
        }
        let ms = Int(Date().timeIntervalSince(start) * 1000)
        vrSpeechLog("transcribeFile done: \(text.count) chars in \(ms)ms [\(engine)/\(resolved.identifier(.bcp47))]")
        resolve(["text": text,
                 "resolvedLocale": resolved.identifier(.bcp47),
                 "engine": engine,
                 "ms": ms])
      } catch {
        collectTask.cancel()
        // A cancel() call triggers cancelAndFinishNow(), which surfaces here as a
        // throw. Treat it as "cancelled"; anything else is a genuine analysis fault.
        if await vrSpeechSessions.finish(requestId) {
          reject("cancelled", "transcription cancelled", nil)
        } else {
          reject("analysis_failed", error.localizedDescription, error)
        }
      }
    }
  }

  // MARK: - cancel

  @objc(cancel:resolver:rejecter:)
  func cancel(_ requestId: String,
              resolver resolve: @escaping RCTPromiseResolveBlock,
              rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard #available(iOS 26.0, *) else {
      resolve(nil)
      return
    }
    Task {
      await vrSpeechSessions.cancel(requestId)
      vrSpeechLog("cancel requested: \(requestId)")
      resolve(nil)
    }
  }
}

// MARK: - Logging

private let vrSpeechOSLog = OSLog(subsystem: "com.wahabbasa.VoiceReminder", category: "VRSpeech")

private func vrSpeechLog(_ message: String) {
  os_log("%{public}@", log: vrSpeechOSLog, type: .info, "[VRSpeech] " + message)
}

// MARK: - iOS 26 helpers (gated; only reached from an availability-narrowed scope)

/// Resolves a requested BCP-47 id to a locale the chosen engine supports on this
/// device, via `supportedLocale(equivalentTo:)`. nil => unsupported locale.
@available(iOS 26.0, *)
private func vrSpeechResolveLocale(engine: String, localeId: String) async -> Locale? {
  let requested = Locale(identifier: localeId)
  if engine == "dictation" {
    return await DictationTranscriber.supportedLocale(equivalentTo: requested)
  }
  return await SpeechTranscriber.supportedLocale(equivalentTo: requested)
}

/// True when the engine's assets for `locale` are installed and it can run now.
@available(iOS 26.0, *)
private func vrSpeechIsInstalled(engine: String, locale: Locale) async -> Bool {
  let target = locale.identifier(.bcp47)
  // `installedLocales` is `{ get async }` on both transcriber types.
  let installed: [Locale] = engine == "dictation"
    ? await DictationTranscriber.installedLocales
    : await SpeechTranscriber.installedLocales
  return installed.contains { $0.identifier(.bcp47) == target }
}

/// Builds the transcriber module for the engine, with default (final-only) options.
@available(iOS 26.0, *)
private func vrSpeechMakeModule(engine: String, locale: Locale) -> any SpeechModule {
  if engine == "dictation" {
    return DictationTranscriber(locale: locale,
                                contentHints: [],
                                transcriptionOptions: [],
                                reportingOptions: [],
                                attributeOptions: [])
  }
  return SpeechTranscriber(locale: locale,
                           transcriptionOptions: [],
                           reportingOptions: [],
                           attributeOptions: [])
}

@available(iOS 26.0, *)
private func vrSpeechFileURL(_ uri: String) -> URL {
  if uri.hasPrefix("file://"), let parsed = URL(string: uri) { return parsed }
  return URL(fileURLWithPath: uri)
}

// MARK: - Cancellation registry

/// Per-requestId map of in-flight analyzers. Guards the "cancel before register"
/// race and lets `finish()` report whether a request was cancelled so the
/// promise rejects "cancelled" and never resolves late.
@available(iOS 26.0, *)
private actor VRSpeechSessions {
  private var analyzers: [String: SpeechAnalyzer] = [:]
  private var cancelled: Set<String> = []

  /// Register a running analyzer. Returns false when cancel() already arrived for
  /// this id (the caller should bail and reject "cancelled").
  func register(_ id: String, analyzer: SpeechAnalyzer) -> Bool {
    if cancelled.contains(id) {
      cancelled.remove(id)
      return false
    }
    analyzers[id] = analyzer
    return true
  }

  /// Cancel an in-flight (or not-yet-registered) request. Idempotent.
  func cancel(_ id: String) async {
    cancelled.insert(id)
    if let analyzer = analyzers.removeValue(forKey: id) {
      await analyzer.cancelAndFinishNow()
    }
  }

  /// Clear the request; returns true if it had been cancelled meanwhile.
  func finish(_ id: String) -> Bool {
    analyzers[id] = nil
    return cancelled.remove(id) != nil
  }
}

@available(iOS 26.0, *)
private let vrSpeechSessions = VRSpeechSessions()

// MARK: - Asset install de-dup

/// Serializes and de-dups asset installation per engine/locale so repeated
/// prepare() calls (and concurrent ones) share a single download+preheat.
@available(iOS 26.0, *)
private actor VRSpeechInstaller {
  private var inFlight: [String: Task<Void, Error>] = [:]

  func ensureInstalled(engine: String, locale: Locale) async throws {
    let key = engine + "|" + locale.identifier(.bcp47)
    if let existing = inFlight[key] {
      try await existing.value
      return
    }
    let task = Task<Void, Error> {
      let module = vrSpeechMakeModule(engine: engine, locale: locale)
      // Installs assets only when something is missing (nil request => nothing to do).
      if let request = try await AssetInventory.assetInstallationRequest(supporting: [module]) {
        try await request.downloadAndInstall()
      }
      // Preheat: build a throwaway analyzer and let it warm up. Non-fatal.
      let analyzer = SpeechAnalyzer(modules: [module], options: nil)
      try? await analyzer.prepareToAnalyze(in: nil)
    }
    inFlight[key] = task
    do {
      try await task.value
    } catch {
      inFlight[key] = nil
      throw error
    }
    inFlight[key] = nil
  }
}

@available(iOS 26.0, *)
private let vrSpeechInstaller = VRSpeechInstaller()
