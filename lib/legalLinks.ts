/**
 * The two legal documents the app has to link to, in one place.
 *
 * Every surface that shows a legal link — the paywall footer (App Store
 * Schedule 2 §3.8(b)), the Settings About rows (Guideline 5.1.1(i)), and the
 * "Privacy Policy" link on the first-run AI consent card (5.1.2(i)) — imports
 * these constants. Nothing hardcodes a URL.
 *
 * Pages live in `legal-site/`, published with GitHub Pages. Moving to a custom
 * domain later is a one-line change to each constant below, nothing else.
 *
 * Note: `terms.html` carries the app's own Terms of Use and incorporates
 * Apple's standard EULA (https://www.apple.com/legal/internet-services/itunes/dev/stdeula/),
 * which is what Apple requires the paywall's "Terms of Use" link to reach.
 */

import { Linking } from 'react-native';

export const PRIVACY_POLICY_URL = 'https://wahabbasa.github.io/voicereminder-legal/privacy.html';

export const TERMS_OF_USE_URL = 'https://wahabbasa.github.io/voicereminder-legal/terms.html';

/**
 * Open a legal page in the in-app browser sheet, falling back to the system
 * browser. `expo-web-browser` is required lazily and NEVER imported at module
 * scope: its import calls `requireNativeModule` at load, which throws on
 * builds that predate the native module — and since every screen with a legal
 * link loads this code, a top-level import takes the whole route down
 * (SceneView's "Cannot read property 'ErrorBoundary' of undefined"). OTA
 * bundles have to keep running on the previous native build.
 */
export async function openInAppBrowser(url: string): Promise<void> {
  try {
    const WebBrowser: typeof import('expo-web-browser') = require('expo-web-browser');
    await WebBrowser.openBrowserAsync(url);
  } catch {
    await Linking.openURL(url);
  }
}
