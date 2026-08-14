import { requestMicrophonePermission, type PermissionStatus } from './audio';
import { PRIVACY_POLICY_URL } from './legalLinks';
import { useSettingsStore } from './settingsStore';

/**
 * First-run AI consent: the copy and the two button paths.
 *
 * App Review 5.1.2(i) needs explicit permission *before* a recording is shared
 * with third-party AI, so this is a pre-permission card shown on the first mic
 * tap — short enough to read, and Allow flows straight on into the system
 * microphone prompt so the user answers one question after another instead of
 * meeting two walls.
 *
 * Copy rule: never name a provider. The Privacy Policy is where processors get
 * listed; in-app strings stay generic.
 */
export const AI_CONSENT_COPY = {
    title: 'Before you record',
    /** Sentence one: what happens to the recording. */
    body: 'Your voice is processed by secure third-party AI services to create your reminder.',
    /** Sentence two, wrapped around the link below. */
    learnMorePrefix: 'Learn more in our ',
    learnMoreLabel: 'Privacy Policy',
    learnMoreSuffix: '.',
    allowLabel: 'Allow',
    declineLabel: 'Not now',
} as const;

/** "Learn more" goes to the same policy the paywall and Settings link to. */
export const AI_CONSENT_LEARN_MORE_URL = PRIVACY_POLICY_URL;

export type AiConsentChoice = 'allow' | 'not_now';

export type AiConsentOutcome = {
    /** True once the accepted-at timestamp is persisted. */
    consented: boolean;
    /** What the system microphone prompt answered, or null when it was never shown. */
    mic: PermissionStatus | null;
    /** True when the caller should carry on into the recording the user originally tapped for. */
    proceedToRecording: boolean;
    /** Set when the choice could not be saved — the caller shows a retry alert. */
    error?: 'persist_failed';
};

/**
 * Applies the user's choice from the consent card.
 *
 * `allow` persists consent and then chains straight into the system microphone
 * request (one continuous flow: card → OS alert → recorder). A denied mic still
 * proceeds — the recorder owns that message, and consent is unrelated to it.
 *
 * `not_now` writes nothing: consent stays unset, the recorder stays gated, and
 * the card can be shown again on the next mic tap.
 */
export async function resolveAiConsent(choice: AiConsentChoice): Promise<AiConsentOutcome> {
    if (choice === 'not_now') {
        return { consented: false, mic: null, proceedToRecording: false };
    }

    try {
        await useSettingsStore.getState().setAiConsent(true);
    } catch {
        return { consented: false, mic: null, proceedToRecording: false, error: 'persist_failed' };
    }

    let mic: PermissionStatus | null = null;
    try {
        mic = await requestMicrophonePermission();
    } catch {
        // The OS refused to answer; the recorder asks again when it opens.
        mic = null;
    }

    return { consented: true, mic, proceedToRecording: true };
}
