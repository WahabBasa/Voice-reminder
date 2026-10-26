/**
 * "Update available" prompt — the screen (logic in lib/appUpdatePrompt.ts).
 *
 * Mounted once at the root, inside the Convex provider. It asks the server
 * once startup has settled (and again on every return to the foreground)
 * whether this install is behind the App Store, and shows a small card on Home:
 * title, one line, "Update" (opens Remi's App Store page) and "Later" (24 h
 * snooze). When the server says the update is required, "Later" is gone and
 * the card stays until the app is updated.
 *
 * Never shown over: anything but Home, a ringing alarm, the first-launch
 * language wheel, the AI-consent card, a permission prompt, a recording, the
 * splash (all register holds), or while iOS has a system dialog up.
 *
 * Self-contained: the function is referenced by name rather than through the
 * generated api, so this file builds in app versions whose convex/_generated
 * predates it, and a server without the function (or offline) means no prompt.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  I18nManager,
  InteractionManager,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useConvex } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { usePathname } from "expo-router";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { getDeviceId } from "../lib/deviceId";
import { getUpdatePromptLanguages } from "../lib/appUpdateLocale";
import {
  STORE_URL,
  STORE_WEB_URL,
  isPromptVisible,
  isRtlPromptLanguage,
  isUpdatePromptHeld,
  loadSnoozedAt,
  pickInstalledVersion,
  pickPromptLanguage,
  promptStringsFor,
  readDecision,
  saveSnoozedAt,
  shouldOffer,
  showsLater,
  subscribeUpdatePromptHolds,
  textEdgeStyle,
  updatePromptHoldReasons,
  type UpdateDecision,
} from "../lib/appUpdatePrompt";

export const CHECK = makeFunctionReference<"query">("appUpdate:check");

/** Startup has settled: interactions done, then this long on top. */
const SETTLE_MS = 2500;

/**
 * The installed app version. The runtime version is the native app version
 * (runtime policy appVersion) and is right even under an OTA; the config
 * version is the fallback.
 */
export function installedAppVersion(): string | null {
  return pickInstalledVersion((Updates as any).runtimeVersion, Constants.expoConfig?.version);
}

function log(message: string, extra?: unknown): void {
  if (extra === undefined) console.log(`[VR] updatePrompt: ${message}`);
  else console.log(`[VR] updatePrompt: ${message}`, extra);
}

export default function UpdatePrompt() {
  const convex = useConvex();
  const pathname = usePathname();
  const [decision, setDecision] = useState<UpdateDecision>({ show: false, required: false });
  const [snoozedAt, setSnoozedAt] = useState<number | null>(null);
  const [snoozeLoaded, setSnoozeLoaded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [settled, setSettled] = useState(false);
  const [held, setHeld] = useState(isUpdatePromptHeld());
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const version = installedAppVersion();
      if (!version) {
        log("no installed version; skipping");
        return;
      }
      const deviceId = await getDeviceId();
      const [answer, snooze] = await Promise.all([
        convex.query(CHECK, { deviceId, version }),
        loadSnoozedAt(),
      ]);
      const next = readDecision(answer);
      log("checked", { version, ...next });
      setSnoozedAt(snooze);
      setSnoozeLoaded(true);
      setDecision(next);
    } catch (e) {
      // Offline, or a server without the function yet: no prompt.
      log("check failed (ignored)", String(e));
    } finally {
      inFlight.current = false;
    }
  }, [convex]);

  // Settle, then ask. Every later return to the foreground asks again.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const task = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => {
        setSettled(true);
        void refresh();
      }, SETTLE_MS);
    });
    return () => {
      task.cancel();
      if (timer) clearTimeout(timer);
    };
  }, [refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      setAppActive(state === "active");
      if (state === "active" && settled) void refresh();
    });
    return () => sub.remove();
  }, [refresh, settled]);

  useEffect(() => {
    setHeld(isUpdatePromptHeld());
    return subscribeUpdatePromptHolds(() => setHeld(isUpdatePromptHeld()));
  }, []);

  const offered = snoozeLoaded && shouldOffer(decision, snoozedAt, Date.now());
  const visible = isPromptVisible({
    offered,
    // "Update" or "Later" closes a skippable prompt for this launch; a required
    // one never closes.
    dismissed: dismissed && !decision.required,
    onHome: pathname === "/",
    held,
    appActive,
    settled,
  });

  const lastVisible = useRef(false);
  useEffect(() => {
    if (visible !== lastVisible.current) {
      lastVisible.current = visible;
      log(visible ? "shown" : "hidden", { required: decision.required, holds: updatePromptHoldReasons() });
    }
  }, [visible, decision.required]);

  const lang = useMemo(() => pickPromptLanguage(getUpdatePromptLanguages()), [visible]);
  const strings = promptStringsFor(lang);
  const edge = textEdgeStyle(isRtlPromptLanguage(lang), I18nManager.isRTL === true);

  const onUpdate = useCallback(() => {
    log("update tapped");
    setDismissed(true);
    Linking.openURL(STORE_URL).catch(() => {
      Linking.openURL(STORE_WEB_URL).catch((e) => log("could not open the store", String(e)));
    });
  }, []);

  const onLater = useCallback(() => {
    const now = Date.now();
    log("later tapped");
    setDismissed(true);
    setSnoozedAt(now);
    void saveSnoozedAt(now);
  }, []);

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={showsLater(decision) ? onLater : () => {}}
    >
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <Text style={[styles.title, edge]} maxFontSizeMultiplier={1.4} accessibilityRole="header">
            {strings.title}
          </Text>
          <Text style={[styles.body, edge]} maxFontSizeMultiplier={1.4}>
            {decision.required ? strings.required : strings.body}
          </Text>
          <Pressable
            onPress={onUpdate}
            accessibilityRole="button"
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          >
            <Text style={styles.primaryText} maxFontSizeMultiplier={1.3} numberOfLines={1}>
              {strings.update}
            </Text>
          </Pressable>
          {showsLater(decision) ? (
            <Pressable
              onPress={onLater}
              accessibilityRole="button"
              style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryText} maxFontSizeMultiplier={1.3} numberOfLines={1}>
                {strings.later}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 6,
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
    color: "#596069",
    marginBottom: 18,
  },
  primary: {
    backgroundColor: "#3D8BFF",
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },
  primaryText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  secondary: {
    marginTop: 4,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryText: {
    color: "#596069",
    fontSize: 16,
    fontWeight: "500",
  },
  pressed: {
    opacity: 0.7,
  },
});
