import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LanguageWheel } from "./LanguageSheet";
import { colors } from "../lib/theme";
import { t } from "../lib/i18n";
import { currentLanguageChoice, pickLanguage } from "../lib/pickLanguage";

/**
 * The first screen of a genuinely fresh install with no saved language (an
 * install from before the wheel skips it and follows the iPhone's language,
 * lib/appLanguage.ts PRE_WHEEL_KEYS). It replaces the screens
 * until Continue: app/_layout renders it instead of the Stack, after the stored
 * pick has been read, so it never flashes for someone who already chose.
 * Continue saves and applies the pick (UI + voice hint + server); the layout
 * then shows Home. Settings › Language changes it afterwards.
 */
export default function FirstLaunchLanguage() {
    // Read once: the device language preselected.
    const [initialCode] = useState(currentLanguageChoice);

    return (
        <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
            <View style={styles.content}>
                <LanguageWheel
                    initialCode={initialCode}
                    confirmLabel={t("language.sheet.continue")}
                    onConfirm={(code) => void pickLanguage(code)}
                />
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    content: {
        flex: 1,
        justifyContent: "center",
        paddingHorizontal: 24,
    },
});
