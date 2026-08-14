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

export const PRIVACY_POLICY_URL = 'https://wahabbasa.github.io/voicereminder-legal/privacy.html';

export const TERMS_OF_USE_URL = 'https://wahabbasa.github.io/voicereminder-legal/terms.html';
