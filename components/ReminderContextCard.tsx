import { t } from "../lib/i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { TouchableOpacity } from "@gorhom/bottom-sheet";
import * as FileSystem from "expo-file-system/legacy";
import AppIcon from "./AppIcon";
import { chipColorForId } from "./ReminderListItem";
import { previewAudioService } from "../lib/AudioService";
import { DEFAULT_ALARM_SETTINGS } from "../lib/storage";
import { useReminderStore } from "../lib/store";
import type { FeedbackContext } from "../lib/feedbackOutbox";
import { reminderCardContent } from "../lib/feedbackReminderCard";
import { borderRadius, colors, scaleFontSize, shadows } from "../lib/theme";

/** Where hydration leaves a reminder's voice — the same file the edit sheet previews. */
function localAudioPathFor(reminderId: string): string {
  return `${FileSystem.documentDirectory}reminder_${reminderId}.mp3`;
}

export type ReminderContextCardViewProps = {
  title: string;
  emoji?: string;
  chipColor: string;
  spoken: string;
  when: string;
  /** False hides ▶ — the voice isn't on this phone (yet). */
  canPlay: boolean;
  playing: boolean;
  onTogglePlay: () => void;
};

/**
 * The reminder being reported, at the top of the feedback composer: chip and
 * title as the Today card shows them, when it rings, and the line Remi says
 * with a ▶ to hear it. Presentational; ReminderContextCard feeds it.
 */
export function ReminderContextCardView({
  title,
  emoji,
  chipColor,
  spoken,
  when,
  canPlay,
  playing,
  onTogglePlay,
}: ReminderContextCardViewProps) {
  return (
    <View style={styles.card} testID="reminder-context-card">
      <View style={styles.header}>
        <View style={[styles.chip, { backgroundColor: chipColor }]}>
          {emoji ? (
            <Text style={styles.chipEmoji}>{emoji}</Text>
          ) : (
            <AppIcon name="bell" size={20} color={colors.textSecondary} />
          )}
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={2} testID="reminder-context-title">
            {title}
          </Text>
          {when ? (
            <Text style={styles.when} numberOfLines={1} testID="reminder-context-when">
              {when}
            </Text>
          ) : null}
        </View>
      </View>

      {spoken ? (
        <>
          <View style={styles.separator} />
          <View style={styles.spokenRow}>
            <View style={styles.spokenText}>
              <Text style={styles.spokenLabel}>{t("feedback.context.remiSays")}</Text>
              <Text style={styles.spoken} numberOfLines={3} testID="reminder-context-spoken">
                {spoken}
              </Text>
            </View>
            {canPlay ? (
              <TouchableOpacity
                style={styles.playCircle}
                onPress={onTogglePlay}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={playing ? t("feedback.context.stop.a11y") : t("feedback.context.play.a11y")}
                testID="reminder-context-play"
              >
                <AppIcon name={playing ? "square" : "play"} size={14} color="#ffffff" />
              </TouchableOpacity>
            ) : null}
          </View>
        </>
      ) : null}
    </View>
  );
}

/**
 * The composer's reminder card for a `kind: "reminder"` context. Reads the live
 * store row by `reminderId` (for the emoji, the schedule and the audio) and
 * offers ▶ only when the voice file is already on the phone — a report screen
 * is no place to start a download.
 */
export default function ReminderContextCard({ context }: { context: FeedbackContext }) {
  const reminderId = typeof context.reminderId === "string" ? context.reminderId : null;
  const reminder = useReminderStore((state) =>
    reminderId ? state.reminders.find((r) => r.id === reminderId) : undefined
  );
  const content = useMemo(() => reminderCardContent(context, reminder), [context, reminder]);

  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const startedRef = useRef(false);

  // Re-checked when hydration lands (audioUrl appears), so a report opened
  // seconds after creation gains its ▶ once the voice is saved.
  const audioUrl = reminder?.audioUrl;
  useEffect(() => {
    if (!reminderId) return;
    let cancelled = false;
    const path = localAudioPathFor(reminderId);
    FileSystem.getInfoAsync(path)
      .then((info) => {
        if (cancelled) return;
        const size = (info as { size?: number }).size ?? 0;
        setAudioPath(info.exists && size > 0 ? path : null);
      })
      .catch(() => {
        if (!cancelled) setAudioPath(null);
      });
    return () => {
      cancelled = true;
    };
  }, [reminderId, audioUrl]);

  // Only stop what this card started — never cut off another surface's preview.
  useEffect(
    () => () => {
      if (startedRef.current) void previewAudioService.stop();
    },
    []
  );

  const volume = reminder?.volume ?? DEFAULT_ALARM_SETTINGS.volume;
  const handleTogglePlay = useCallback(async () => {
    if (!audioPath) return;
    if (playing) {
      await previewAudioService.stop();
      startedRef.current = false;
      setPlaying(false);
      return;
    }
    startedRef.current = true;
    const ok = await previewAudioService.play(
      audioPath,
      { volume, streamType: "music", loop: false },
      () => {
        startedRef.current = false;
        setPlaying(false);
      }
    );
    if (!ok) startedRef.current = false;
    setPlaying(ok);
  }, [audioPath, playing, volume]);

  if (!content) return null;

  return (
    <ReminderContextCardView
      title={content.title}
      emoji={content.emoji}
      chipColor={chipColorForId(content.reminderId ?? content.title)}
      spoken={content.spoken}
      when={content.when}
      canPlay={!!audioPath}
      playing={playing}
      onTogglePlay={() => void handleTogglePlay()}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
    ...shadows.card,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
  },
  chip: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  chipEmoji: {
    fontSize: 20,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: scaleFontSize(16),
    fontWeight: "600",
    lineHeight: scaleFontSize(21),
    color: colors.textHeading,
  },
  when: {
    marginTop: 2,
    fontSize: scaleFontSize(13),
    lineHeight: scaleFontSize(18),
    color: colors.textSecondary,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 12,
  },
  spokenRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  spokenText: {
    flex: 1,
    gap: 2,
  },
  spokenLabel: {
    fontSize: scaleFontSize(13),
    fontWeight: "500",
    lineHeight: scaleFontSize(18),
    color: colors.textSecondary,
  },
  spoken: {
    fontSize: scaleFontSize(15),
    lineHeight: scaleFontSize(21),
    color: colors.textPrimary,
  },
  playCircle: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
});
