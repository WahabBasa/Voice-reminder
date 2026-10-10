import { t } from "../lib/i18n";
import { endonymFor, useChosenLanguage } from "../lib/appLanguage";
import { currentLanguageChoice, pickLanguage } from "../lib/pickLanguage";
import LanguageSheet from "../components/LanguageSheet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import Constants from "expo-constants";
import { borderRadius, colors, scaleFontSize, shadows } from "../lib/theme";
import { FONT_DISPLAY } from "../lib/fonts";
import AppIcon from "../components/AppIcon";
import {
  PRO_PRODUCT_NAME,
  forceRefreshProStatus,
  getProStatusSnapshot,
  openManageSubscriptions,
  readProStatus,
  restorePurchases,
  subscribeToProStatus,
} from "../lib/purchases";
import {
  getProCardContent,
  getRestoreOutcomeContent,
  type ProStatus,
} from "../lib/proCardContent";
// One source of truth for the legal URLs — same constants the paywall and the
// consent card use.
import { PRIVACY_POLICY_URL, TERMS_OF_USE_URL, openInAppBrowser } from "../lib/legalLinks";
import { useSettingsStore } from "../lib/settingsStore";
import { useFeedbackUi } from "../lib/feedbackUi";
import type { VoiceLanguageSetting } from "../lib/deviceStt";
import type { SpeechEngine } from "../lib/vrSpeech";

const VOICE_LANGUAGE_LABELS: Record<VoiceLanguageSetting, () => string> = {
  auto: () => t("settings.voiceLanguage.auto"),
  en: () => t("settings.voiceLanguage.en"),
  // An endonym, never translated.
  ar: () => "العربية",
};

type SettingsRowProps = {
  icon: Parameters<typeof AppIcon>[0]["name"];
  label: string;
  subtitle?: string;
  onPress?: () => void;
};

function SettingsRow({ icon, label, subtitle, onPress }: SettingsRowProps) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.6}
      disabled={!onPress}
    >
      <View style={styles.rowIcon}>
        <AppIcon name={icon} size={20} color={colors.textSecondary} />
      </View>
      <View style={styles.rowTextWrap}>
        <Text style={styles.rowTitle}>{label}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {onPress ? (
        <AppIcon name="chevron-right" size={18} color={colors.textTertiary} />
      ) : null}
    </TouchableOpacity>
  );
}

type SettingsContentProps = {
  /** When true, renders for the pager page: no back button, extra bottom padding for the bar. */
  embedded?: boolean;
  /**
   * Whether this is the pager page the user is actually looking at. The pager
   * keeps every page mounted (components/SwipePager), so swiping here is not a
   * route focus and nothing else would tell us to re-check. Defaults to true
   * for the standalone route, where being rendered means being visible.
   */
  visible?: boolean;
};

export function SettingsContent({ embedded = false, visible = true }: SettingsContentProps) {
  const router = useRouter();

  const [isRestoring, setIsRestoring] = useState(false);

  // Seeded from the entitlement cache so a known subscriber never sees
  // "Upgrade to Pro" flash on the first paint.
  const [proStatus, setProStatus] = useState<ProStatus>(() => getProStatusSnapshot());
  const proCard = getProCardContent(proStatus, PRO_PRODUCT_NAME);

  // Track the entitlement rather than sample it. This component mounts once, at
  // cold start, inside the home pager — long before RevenueCat has configured
  // (app/_layout defers it past interactions). Every sampled read at that point
  // answers "unknown", and without this subscription nothing would ever correct
  // it: the SDK's own update listener only refreshes lib/purchases' cache.
  useEffect(() => subscribeToProStatus(setProStatus), []);

  // Voice-transcription preferences. Loaded on mount so a value the user set
  // last session is reflected even when they never opened the recorder yet.
  const voiceLanguage = useSettingsStore((s) => s.settings.voiceLanguage);
  const voiceEngine = useSettingsStore((s) => s.settings.voiceEngine);
  const setVoiceLanguage = useSettingsStore((s) => s.setVoiceLanguage);
  const setVoiceEngine = useSettingsStore((s) => s.setVoiceEngine);

  // In-app feedback: the composer and the "your feedback" list are mounted once
  // at the root (components/FeedbackHost); these rows just open them.
  const openFeedbackComposer = useFeedbackUi((s) => s.openComposer);
  const openFeedbackList = useFeedbackUi((s) => s.openList);
  useEffect(() => {
    void useSettingsStore.getState().loadSettings().catch(() => {});
  }, []);
  // The engine override is a debugging affordance, shown only when perf logs
  // are on — the same flag the on-device timing lines ride.
  const showVoiceEngineRow = process.env.EXPO_PUBLIC_VR_PERF_LOGS === "1";

  const handlePickVoiceLanguage = () => {
    Alert.alert(t("settings.row.voiceLanguage"), t("settings.voiceLanguage.alert.message"), [
      { text: VOICE_LANGUAGE_LABELS.auto(), onPress: () => void setVoiceLanguage("auto") },
      { text: VOICE_LANGUAGE_LABELS.en(), onPress: () => void setVoiceLanguage("en") },
      { text: VOICE_LANGUAGE_LABELS.ar(), onPress: () => void setVoiceLanguage("ar") },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  };

  // App language (UI + the voice hint): the wheel, shared with the first run.
  const chosenLanguage = useChosenLanguage();
  const [showLanguageSheet, setShowLanguageSheet] = useState(false);
  const languageChoice = chosenLanguage ?? currentLanguageChoice();

  const handlePickVoiceEngine = () => {
    Alert.alert("Voice engine (dev)", "On-device transcription model", [
      { text: "Dictation", onPress: () => void setVoiceEngine("dictation") },
      { text: "Transcriber", onPress: () => void setVoiceEngine("transcriber") },
      { text: "Default", onPress: () => void setVoiceEngine(undefined) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const voiceEngineLabel = (engine: SpeechEngine | undefined): string => {
    if (engine === "dictation") return "Dictation";
    if (engine === "transcriber") return "Transcriber";
    return "Default";
  };

  // One resolution pass: the cached answer lands first (instant, possibly
  // stale), the forced re-read follows and catches sandbox expiry, refunds and
  // purchases made on another device. Neither blocks the render, and both fall
  // back to what we already knew rather than inventing "free".
  const resolveProStatus = useCallback(() => {
    let cancelled = false;
    const apply = (status: ProStatus) => {
      if (!cancelled) setProStatus(status);
    };
    void readProStatus().then(apply);
    void forceRefreshProStatus().then(apply);
    return () => {
      cancelled = true;
    };
  }, []);

  // Mount and every route re-focus — how a purchase made on the paywall lands
  // here the moment the user comes back.
  useFocusEffect(resolveProStatus);

  // Arriving at the Settings page by swipe/tab tap changes no route, so it
  // needs its own trigger. Only the false → true edge: staying visible must not
  // re-fire on every unrelated re-render.
  const wasVisible = useRef(visible);
  useEffect(() => {
    const becameVisible = visible && !wasVisible.current;
    wasVisible.current = visible;
    if (!becameVisible) return;
    return resolveProStatus();
  }, [visible, resolveProStatus]);

  // The "can't check" card's tap: ask again, and say so if it still won't
  // answer. Deliberately not a route to the paywall — we don't know whether
  // this user already pays.
  const handleRetryProStatus = async () => {
    const status = await forceRefreshProStatus();
    setProStatus(status);
    if (status === "unknown") {
      Alert.alert(t("settings.alert.checkFailed.title"), t("settings.alert.checkFailed.message"));
    }
  };

  const versionLabel = useMemo(() => {
    const version = Constants.expoConfig?.version ?? "1.0.0";
    const build = (Constants as any).nativeBuildVersion ?? (Constants as any).expoConfig?.ios?.buildNumber;
    // Brand + version: the same in every language, so no catalog entry without a build.
    if (!build) return `Remi v${version}`;
    return t("settings.version", { version, build: String(build) });
  }, []);

  // App Review 3.1.1 wants restore reachable outside the paywall too.
  const handleRestore = async () => {
    if (isRestoring) return;
    setIsRestoring(true);
    const result = await restorePurchases();
    setIsRestoring(false);

    if (result.status === "error") {
      Alert.alert(
        t("settings.alert.restoreFailed.title"),
        result.category === "network"
          ? t("settings.alert.restoreFailed.offline")
          : t("settings.alert.restoreFailed.store")
      );
      return;
    }

    // Restore is the one moment the store gives a definitive answer, so the
    // card reconciles off it in BOTH directions — getRestoreOutcomeContent owns
    // that rule. Only flipping it upward was how a lapsed subscriber kept
    // reading "Active" straight after being told their subscription had ended.
    const outcome = getRestoreOutcomeContent(result.status, PRO_PRODUCT_NAME);
    setProStatus(outcome.proStatus);
    Alert.alert(outcome.title, outcome.message);
  };

  // The manage-subscription UI belongs to the store, so it can decline to
  // appear; openManageSubscriptions swallows that and reports it instead.
  const handleManageSubscription = async () => {
    const opened = await openManageSubscriptions();
    if (!opened) {
      Alert.alert(t("settings.alert.manageFailed.title"), t("settings.alert.manageFailed.message"));
    }
  };

  // Legal pages open in an in-app browser sheet — reading them doesn't bounce
  // the user out to Safari and lose their place.
  const handleOpenLegalLink = async (url: string) => {
    try {
      await openInAppBrowser(url);
    } catch (e) {
      Alert.alert(t("settings.alert.linkFailed.title"), t("settings.alert.linkFailed.message"));
    }
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.scrollContent, embedded && styles.scrollContentEmbedded]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        {!embedded ? (
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            activeOpacity={0.7}
          >
            <AppIcon name="chevron-left" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : null}
        <Text style={styles.headerTitle}>{t("settings.title")}</Text>
      </View>

      {/* Pro card: the upgrade pitch for a confirmed free user, the
          subscription's status (with a way into the store) for a subscriber,
          and a retry for the state where we don't know which they are */}
      <TouchableOpacity
        style={styles.proCard}
        onPress={
          proCard.action === "manage"
            ? () => void handleManageSubscription()
            : proCard.action === "retry"
              ? () => void handleRetryProStatus()
              : () => router.push("/paywall")
        }
        activeOpacity={0.7}
      >
        <View style={styles.proLeft}>
          <View style={styles.proIconWrap}>
            <AppIcon name="crown" size={20} color="#fff" />
          </View>
          <View>
            <Text style={styles.proTitle}>{proCard.title}</Text>
            <Text style={styles.proSubtitle}>{proCard.subtitle}</Text>
          </View>
        </View>
        <AppIcon name="chevron-right" size={18} color={colors.accent} />
      </TouchableOpacity>

      {/* General: the ONE notifications entry point */}
      <Text style={styles.sectionLabel}>{t("settings.section.general")}</Text>
      <View style={styles.card}>
        <SettingsRow
          icon="globe"
          label={t("settings.row.language")}
          subtitle={endonymFor(languageChoice)}
          onPress={() => setShowLanguageSheet(true)}
        />
        <View style={styles.separator} />
        <SettingsRow
          icon="bell"
          label={t("settings.row.notifications")}
          subtitle={t("settings.row.notifications.subtitle")}
          onPress={() => router.push("/diagnostics")}
        />
        <View style={styles.separator} />
        <SettingsRow
          icon="refresh-cw"
          label={t("settings.row.restore")}
          subtitle={isRestoring ? t("settings.row.restore.restoring") : t("settings.row.restore.subtitle")}
          onPress={isRestoring ? undefined : handleRestore}
        />
      </View>

      {/* Voice: how recordings get transcribed on this device */}
      <Text style={styles.sectionLabel}>{t("settings.section.voice")}</Text>
      <View style={styles.card}>
        <SettingsRow
          icon="mic"
          label={t("settings.row.voiceLanguage")}
          subtitle={t("settings.row.voiceLanguage.subtitle", {
            language: VOICE_LANGUAGE_LABELS[voiceLanguage](),
          })}
          onPress={handlePickVoiceLanguage}
        />
        {showVoiceEngineRow ? (
          <>
            <View style={styles.separator} />
            <SettingsRow
              icon="settings"
              label="Voice engine"
              subtitle={voiceEngineLabel(voiceEngine)}
              onPress={handlePickVoiceEngine}
            />
          </>
        ) : null}
      </View>

      {/* Feedback: a direct line to the developer, and where past notes stand */}
      <Text style={styles.sectionLabel}>{t("settings.section.feedback")}</Text>
      <View style={styles.card}>
        <SettingsRow
          icon="message-square"
          label={t("settings.row.sendFeedback")}
          subtitle={t("settings.row.sendFeedback.subtitle")}
          onPress={() => openFeedbackComposer({ kind: "settings" })}
        />
        <View style={styles.separator} />
        <SettingsRow
          icon="info"
          label={t("settings.row.yourFeedback")}
          subtitle={t("settings.row.yourFeedback.subtitle")}
          onPress={openFeedbackList}
        />
      </View>

      {/* About: the two legal documents, reachable without leaving the app
          (Guideline 5.1.1(i) wants the policy in-app and easy to find) */}
      <Text style={styles.sectionLabel}>{t("settings.section.about")}</Text>
      <View style={styles.card}>
        <SettingsRow
          icon="shield"
          label={t("settings.row.privacy")}
          subtitle={t("settings.row.privacy.subtitle")}
          onPress={() => void handleOpenLegalLink(PRIVACY_POLICY_URL)}
        />
        <View style={styles.separator} />
        <SettingsRow
          icon="file-text"
          label={t("settings.row.terms")}
          subtitle={t("settings.row.terms.subtitle")}
          onPress={() => void handleOpenLegalLink(TERMS_OF_USE_URL)}
        />
      </View>

      {/* Version footer */}
      <Text style={styles.versionFooter}>{versionLabel}</Text>

      <LanguageSheet
        visible={showLanguageSheet}
        initialCode={languageChoice}
        confirmLabel={t("common.done")}
        onConfirm={(code) => {
          setShowLanguageSheet(false);
          void pickLanguage(code);
        }}
        onDismiss={() => setShowLanguageSheet(false)}
      />
    </ScrollView>
  );
}

export default function SettingsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <SettingsContent />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  scrollContentEmbedded: {
    paddingBottom: 120,
  },
  header: {
    paddingTop: Platform.OS === "ios" ? 20 : 16,
    paddingBottom: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  headerTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: scaleFontSize(30),
    lineHeight: scaleFontSize(36),
    letterSpacing: -0.3,
    color: colors.textHeading,
  },

  // Pro card
  proCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.accent + "12",
    borderWidth: 1.5,
    borderColor: colors.accent + "30",
    borderRadius: borderRadius.card,
    padding: 16,
    marginBottom: 28,
  },
  proLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  proIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  proTitle: {
    fontSize: scaleFontSize(17),
    fontWeight: "600",
    lineHeight: scaleFontSize(22),
    color: colors.accent,
  },
  proSubtitle: {
    fontSize: scaleFontSize(14),
    lineHeight: scaleFontSize(20),
    color: colors.accent,
    opacity: 0.7,
    marginTop: 4,
  },

  // Card
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.card,
    overflow: "hidden",
    marginBottom: 28,
    ...shadows.card,
  },
  sectionLabel: {
    fontSize: scaleFontSize(12),
    fontWeight: "600",
    lineHeight: scaleFontSize(16),
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: colors.textTertiary,
    marginBottom: 12,
    marginLeft: 4,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 64,
  },

  // Row
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  rowTextWrap: {
    flex: 1,
  },
  rowTitle: {
    fontSize: scaleFontSize(16),
    fontWeight: "600",
    lineHeight: scaleFontSize(21),
    color: colors.textPrimary,
  },
  rowSubtitle: {
    fontSize: scaleFontSize(14),
    lineHeight: scaleFontSize(20),
    color: colors.textSecondary,
    marginTop: 4,
  },

  // Footer
  versionFooter: {
    marginTop: 24,
    textAlign: "center",
    fontSize: scaleFontSize(12),
    lineHeight: scaleFontSize(17),
    color: colors.textTertiary,
  },
});
