// Newsreader via @expo-google-fonts/newsreader.
// JS-bundled assets: OTA-safe; NO config plugin or native build.
import {
    Newsreader_400Regular,
    Newsreader_500Medium,
    useFonts,
} from "@expo-google-fonts/newsreader";

/** Medium display serif for screen and section headings. */
export const FONT_DISPLAY = "Newsreader_500Medium";
/** Regular display serif for plan names and editorial copy. */
export const FONT_DISPLAY_REGULAR = "Newsreader_400Regular";
/** Medium display serif for prices and other emphasized numerals. */
export const FONT_DISPLAY_MEDIUM = "Newsreader_500Medium";

export function useAppFonts(): boolean {
    const [loaded, error] = useFonts({
        Newsreader_400Regular,
        Newsreader_500Medium,
    });

    // Preserve the existing behavior: a load error must not gate forever.
    return loaded || !!error;
}
