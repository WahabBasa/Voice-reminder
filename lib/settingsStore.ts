import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { VoiceLanguageSetting } from './deviceStt';
import type { SpeechEngine } from './vrSpeech';

const SETTINGS_KEY = '@app_settings';

export interface AppSettings {
    // When the user agreed to their recording being processed off-device by the
    // named AI providers (ms epoch). null = never agreed, or consent revoked.
    aiConsentAcceptedAt: number | null;
    // Which language the on-device transcriber is asked for. "auto" follows the
    // device's preferred languages (spec §5).
    voiceLanguage: VoiceLanguageSetting;
    // Dev-only override for which on-device engine to use, surfaced only when
    // perf logs are on. Absent = the env default.
    voiceEngine?: SpeechEngine;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
    aiConsentAcceptedAt: null,
    voiceLanguage: 'auto',
};

const VOICE_LANGUAGES: readonly VoiceLanguageSetting[] = ['auto', 'en', 'ar'];
const VOICE_ENGINES: readonly SpeechEngine[] = ['dictation', 'transcriber'];

interface SettingsState {
    settings: AppSettings;
    hasLoadedSettings: boolean;

    loadSettings: () => Promise<void>;
    setAiConsent: (accepted: boolean) => Promise<void>;
    setVoiceLanguage: (language: VoiceLanguageSetting) => Promise<void>;
    setVoiceEngine: (engine: SpeechEngine | undefined) => Promise<void>;
}

let loadSettingsInFlight: Promise<void> | null = null;

export const useSettingsStore = create<SettingsState>((set, get) => ({
    settings: DEFAULT_APP_SETTINGS,
    hasLoadedSettings: false,

    // Load settings from AsyncStorage
    loadSettings: async () => {
        if (loadSettingsInFlight) {
            return loadSettingsInFlight;
        }

        loadSettingsInFlight = (async () => {
            try {
                const data = await AsyncStorage.getItem(SETTINGS_KEY);
                if (!data) {
                    set({ hasLoadedSettings: true });
                    return;
                }

                const parsed = JSON.parse(data) as Partial<AppSettings>;
                set({
                    settings: {
                        ...DEFAULT_APP_SETTINGS,
                        aiConsentAcceptedAt:
                            typeof parsed.aiConsentAcceptedAt === 'number'
                                && Number.isFinite(parsed.aiConsentAcceptedAt)
                                ? parsed.aiConsentAcceptedAt
                                : DEFAULT_APP_SETTINGS.aiConsentAcceptedAt,
                        voiceLanguage:
                            VOICE_LANGUAGES.includes(parsed.voiceLanguage as VoiceLanguageSetting)
                                ? (parsed.voiceLanguage as VoiceLanguageSetting)
                                : DEFAULT_APP_SETTINGS.voiceLanguage,
                        ...(VOICE_ENGINES.includes(parsed.voiceEngine as SpeechEngine)
                            ? { voiceEngine: parsed.voiceEngine as SpeechEngine }
                            : {}),
                    },
                    hasLoadedSettings: true,
                });
            } catch (error) {
                console.error('[VR Store] Error loading settings:', error);
                set({ settings: DEFAULT_APP_SETTINGS, hasLoadedSettings: true });
            }
        })();

        try {
            await loadSettingsInFlight;
        } finally {
            loadSettingsInFlight = null;
        }
    },

    // Record or revoke consent for off-device AI processing
    setAiConsent: async (accepted) => {
        const currentSettings = get().settings;
        const updatedSettings: AppSettings = {
            ...currentSettings,
            aiConsentAcceptedAt: accepted ? Date.now() : null,
        };

        // Update state immediately (optimistic)
        set({ settings: updatedSettings });

        // Persist to storage
        try {
            await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updatedSettings));
        } catch (error) {
            // Rollback on error
            set({ settings: currentSettings });
            console.error('[VR Store] Error saving settings:', error);
            throw error;
        }
    },

    // Which language the on-device transcriber is asked for.
    setVoiceLanguage: async (language) => {
        const currentSettings = get().settings;
        const updatedSettings: AppSettings = { ...currentSettings, voiceLanguage: language };
        set({ settings: updatedSettings });
        try {
            await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updatedSettings));
        } catch (error) {
            set({ settings: currentSettings });
            console.error('[VR Store] Error saving settings:', error);
            throw error;
        }
    },

    // Dev-only engine override. `undefined` drops it back to the env default.
    setVoiceEngine: async (engine) => {
        const currentSettings = get().settings;
        const updatedSettings: AppSettings = { ...currentSettings };
        if (engine === undefined) delete updatedSettings.voiceEngine;
        else updatedSettings.voiceEngine = engine;
        set({ settings: updatedSettings });
        try {
            await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updatedSettings));
        } catch (error) {
            set({ settings: currentSettings });
            console.error('[VR Store] Error saving settings:', error);
            throw error;
        }
    },
}));

// Selector hooks for common use cases
export const useHasAiConsent = () =>
    useSettingsStore((state) => state.settings.aiConsentAcceptedAt !== null);
