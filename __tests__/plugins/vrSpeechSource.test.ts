import fs from "fs";
import path from "path";

/**
 * VRSpeech source tripwire — the on-device STT native side (iOS 26+).
 *
 * The Swift/ObjC in `plugins/ios-src/` is never executed by Jest and never
 * compiled without a Mac, so short of a full EAS build the only feedback loop is
 * reading the source. These suites pin the frozen contract (lib/vrSpeech.ts) and
 * the AlarmKit-style wiring so a well-meaning edit shows up red here instead of
 * as a broken build 15 minutes later on EAS.
 *
 * Assertions are about PRESENCE of symbols and codes, not formatting.
 */

const SWIFT_PATH = path.resolve(__dirname, "../../plugins/ios-src/VRSpeech.swift");
const OBJC_PATH = path.resolve(__dirname, "../../plugins/ios-src/VRSpeech.m");
const PLUGIN_PATH = path.resolve(__dirname, "../../plugins/withVRSpeech.js");
const APP_JSON_PATH = path.resolve(__dirname, "../../app.json");

const swift = fs.readFileSync(SWIFT_PATH, "utf8");
const objc = fs.readFileSync(OBJC_PATH, "utf8");
const plugin = fs.readFileSync(PLUGIN_PATH, "utf8");

const METHODS = ["status", "prepare", "transcribeFile", "cancel"];
const ERROR_CODES = ["unsupported", "assets_missing", "cancelled", "io", "analysis_failed"];

describe("VRSpeech native sources exist and implement the four contract methods", () => {
  it("ships both source files", () => {
    expect(fs.existsSync(SWIFT_PATH)).toBe(true);
    expect(fs.existsSync(OBJC_PATH)).toBe(true);
  });

  it("declares the class as @objc(VRSpeech), main-queue-setup false", () => {
    expect(swift).toContain("@objc(VRSpeech)");
    expect(swift).toContain("class VRSpeech: NSObject");
    expect(swift).toContain("static func requiresMainQueueSetup() -> Bool { return false }");
  });

  it("implements each contract method in Swift with a promise resolver/rejecter", () => {
    for (const method of METHODS) {
      expect(swift).toContain(`func ${method}(`);
    }
    // Swift @objc selectors match the ObjC declarations below.
    expect(swift).toContain("@objc(status:engine:resolver:rejecter:)");
    expect(swift).toContain("@objc(prepare:engine:resolver:rejecter:)");
    expect(swift).toContain("@objc(transcribeFile:localeId:engine:requestId:resolver:rejecter:)");
    expect(swift).toContain("@objc(cancel:resolver:rejecter:)");
  });

  it("exports the same four methods from the ObjC shim", () => {
    expect(objc).toContain("RCT_EXTERN_MODULE(VRSpeech, NSObject)");
    for (const method of METHODS) {
      expect(objc).toContain(`RCT_EXTERN_METHOD(${method}:`);
    }
    expect(objc).toContain("#import <React/RCTBridgeModule.h>");
  });
});

describe("VRSpeech is gated to iOS 26 and speaks the contract's error codes", () => {
  it("gates SpeechAnalyzer behind #available(iOS 26.0, *) like AlarmKit", () => {
    expect(swift).toContain("#available(iOS 26.0, *)");
    // The pre-26 fallbacks are present so the module still links on older SDKs.
    expect(swift).toContain('"iOS 26 required"');
  });

  it("uses each of the contract's rejection codes", () => {
    for (const code of ERROR_CODES) {
      expect(swift).toContain(`"${code}"`);
    }
  });

  it("uses the SpeechAnalyzer file path (analyzeSequence + finalize), not just file read", () => {
    expect(swift).toContain("analyzeSequence(from:");
    expect(swift).toContain("finalizeAndFinish(through:");
    expect(swift).toContain("finalizeAndFinishThroughEndOfInput()");
  });

  it("wires both engines to their transcriber types through one path", () => {
    expect(swift).toContain("DictationTranscriber(locale:");
    expect(swift).toContain("SpeechTranscriber(locale:");
    expect(swift).toContain("supportedLocale(equivalentTo:");
  });

  it("installs assets via AssetInventory and preheats via prepareToAnalyze", () => {
    expect(swift).toContain("AssetInventory.assetInstallationRequest(supporting:");
    expect(swift).toContain("downloadAndInstall()");
    expect(swift).toContain("prepareToAnalyze(in:");
  });

  it("de-dups concurrent installs per engine/locale", () => {
    expect(swift).toContain("actor VRSpeechInstaller");
    expect(swift).toContain("inFlight");
  });

  it("cancellation rejects with cancelled and cannot resolve late", () => {
    expect(swift).toContain("actor VRSpeechSessions");
    expect(swift).toContain("cancelAndFinishNow()");
    // finish() reports whether the request was cancelled so success still rejects.
    expect(swift).toContain("if await vrSpeechSessions.finish(requestId) {");
  });
});

describe("withVRSpeech plugin wiring", () => {
  it("exports a config-plugin function", () => {
    expect(plugin).toContain("module.exports = withVRSpeech");
    expect(plugin).toContain("function withVRSpeech(config)");
  });

  it("copies both sources from plugins/ios-src and links them into the app target", () => {
    expect(plugin).toContain('SOURCE_FILE_NAMES = ["VRSpeech.swift", "VRSpeech.m"]');
    expect(plugin).toContain('path.join(projectRoot, "plugins", "ios-src")');
    expect(plugin).toContain("addBuildSourceFileToGroup");
    // Idempotent link.
    expect(plugin).toContain("if (project.hasFile(filepath)) continue;");
  });

  it("ensures the bridging header imports RCTBridgeModule for Swift promises", () => {
    expect(plugin).toContain("ensureBridgingHeader");
    expect(plugin).toContain("#import <React/RCTBridgeModule.h>");
  });

  it("does NOT touch Info.plist — SpeechAnalyzer needs no usage-description key", () => {
    expect(plugin).not.toContain("withInfoPlist");
    expect(plugin).not.toContain("NSSpeechRecognitionUsageDescription");
    expect(swift).not.toContain("NSSpeechRecognitionUsageDescription");
  });

  it("is registered in app.json next to withAlarmKit", () => {
    const app = JSON.parse(fs.readFileSync(APP_JSON_PATH, "utf8"));
    expect(app.expo.plugins).toContain("./plugins/withVRSpeech");
    expect(app.expo.plugins).toContain("./plugins/withAlarmKit");
  });
});
