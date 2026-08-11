// Fraunces via @expo-google-fonts/fraunces (JS-bundled asset → OTA-safe; NO config plugin)
import { Fraunces_600SemiBold, useFonts } from "@expo-google-fonts/fraunces";

export const FONT_DISPLAY = "Fraunces_600SemiBold";

export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    Fraunces_600SemiBold,
  });
  // A failed font load must not blank the app — render with the system
  // fallback instead of gating forever.
  return loaded || !!error;
}
