import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = '@app_settings';

export interface AppSettings {
    addressTerm: string; // How the voice addresses the user ("" = unset, address-free)
    // When the user agreed to their recording being processed off-device by the
    // named AI providers (ms epoch). null = never agreed, or consent revoked.
    aiConsentAcceptedAt: number | null;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
    addressTerm: '',
    aiConsentAcceptedAt: null,
};

interface SettingsState {
    settings: AppSettings;
    hasLoadedSettings: boolean;

    loadSettings: () => Promise<void>;
    setAddressTerm: (addressTerm: string) => Promise<void>;
    setAiConsent: (accepted: boolean) => Promise<void>;
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
                        addressTerm: typeof parsed.addressTerm === 'string'
                            ? parsed.addressTerm
                            : DEFAULT_APP_SETTINGS.addressTerm,
                        aiConsentAcceptedAt:
                            typeof parsed.aiConsentAcceptedAt === 'number'
                                && Number.isFinite(parsed.aiConsentAcceptedAt)
                                ? parsed.aiConsentAcceptedAt
                                : DEFAULT_APP_SETTINGS.aiConsentAcceptedAt,
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

    // Set the address term ("" clears it)
    setAddressTerm: async (addressTerm) => {
        const currentSettings = get().settings;
        const updatedSettings: AppSettings = {
            ...currentSettings,
            addressTerm: addressTerm.trim(),
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
}));

// Selector hooks for common use cases
export const useAddressTerm = () => useSettingsStore((state) => state.settings.addressTerm);
export const useHasAiConsent = () =>
    useSettingsStore((state) => state.settings.aiConsentAcceptedAt !== null);
