/**
 * Expo config plugin to add the iOS `VRSpeech` native module (on-device STT).
 * See lib/vrSpeech.ts for the frozen JS contract this native side implements.
 *
 * Mirrors plugins/withAlarmKit.js: iOS only, nothing here touches Android.
 * It adds:
 * 1. VRSpeech.swift - RN module over SpeechAnalyzer (iOS 26 gated)
 * 2. VRSpeech.m     - RCT_EXTERN_MODULE export for the Swift class
 * 3. Links both into the app target and ensures the bridging header imports
 *    <React/RCTBridgeModule.h> so RCTPromiseResolveBlock is visible to Swift.
 *
 * Unlike withAlarmKit, both sources live on disk under plugins/ios-src/ and are
 * copied verbatim — there is no embedded template and no Info.plist change
 * (SpeechAnalyzer needs no speech-recognition usage-description key; that key
 * applies to the legacy SFSpeechRecognizer only, and mic permission is handled
 * elsewhere).
 *
 * Idempotent: the source copy overwrites in place and the Xcode link is guarded
 * by project.hasFile, so repeated prebuilds converge.
 */

const { withXcodeProject, withDangerousMod, IOSConfig } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

// The native sources, read verbatim from plugins/ios-src/ at prebuild time.
const SOURCE_FILE_NAMES = ["VRSpeech.swift", "VRSpeech.m"];

function getSourceFiles(projectRoot) {
  const iosSrcDir = path.join(projectRoot, "plugins", "ios-src");
  return SOURCE_FILE_NAMES.map((name) => ({
    name,
    contents: fs.readFileSync(path.join(iosSrcDir, name), "utf8"),
  }));
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
 * target's bridging header. Reuse whatever SWIFT_OBJC_BRIDGING_HEADER already
 * points at (withAlarmKit may have created it) and only create+wire a header
 * when the setting is absent. Adding the import twice is a no-op.
 */
function ensureBridgingHeader(project, platformProjectRoot, projectName) {
  const target = project.getTarget("com.apple.product-type.application");
  if (!target) {
    console.log("[withVRSpeech] No application target found; skipping bridging header");
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
    console.log(`[withVRSpeech] Set SWIFT_OBJC_BRIDGING_HEADER to ${headerRelativePath}`);
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
    console.log(`[withVRSpeech] Added ${importLine} to ${headerRelativePath}`);
  }
}

function withVRSpeech(config) {
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
        console.log(`[withVRSpeech] Created ${file.name}`);
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
      console.log(`[withVRSpeech] Linked ${filepath} into the app target`);
    }

    ensureBridgingHeader(project, config.modRequest.platformProjectRoot, projectName);

    return config;
  });

  return config;
}

module.exports = withVRSpeech;
