// Fraunces via @expo-google-fonts/fraunces (JS-bundled asset → OTA-safe; NO config plugin)
import {
    Fraunces_400Regular,
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    useFonts,
} from "@expo-google-fonts/fraunces";

/** Display serif, semibold — headlines and anything that has to carry weight. */
export const FONT_DISPLAY = "Fraunces_600SemiBold";
/** Same serif at book weight — plan names, quotes, the calmer display lines. */
export const FONT_DISPLAY_REGULAR = "Fraunces_400Regular";
/** In-between weight for large numerals (prices) that would shout at semibold. */
export const FONT_DISPLAY_MEDIUM = "Fraunces_500Medium";

export function useAppFonts(): boolean {
    const [loaded, error] = useFonts({
        Fraunces_400Regular,
        Fraunces_500Medium,
        Fraunces_600SemiBold,
    });
    // A failed font load must not blank the app — render with the system
    // fallback instead of gating forever.
    return loaded || !!error;
}
