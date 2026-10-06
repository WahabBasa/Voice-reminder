import { memo, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { borderRadius, colors, shadows, spacing } from "../lib/theme";
import AppIcon from "./AppIcon";
import {
  getPendingTakesSnapshot,
  subscribePendingTakes,
  type PendingTake,
} from "../lib/pendingTakes";
import { pendingCardContent, type PendingCardContent } from "../lib/pendingCardContent";
import { PICK_A_TIME_LABEL, QUICK_CHOICES, type QuickChoiceId } from "../lib/needsTime";
import type { ResolveTakeOutcome } from "../lib/takeReconcile";

/** What the asking card says under its choices when an answer did not land. */
const RESOLVE_NOTES: Record<Exclude<ResolveTakeOutcome, "created">, string> = {
  invalid: "That time doesn't work. Pick another.",
  offline: "Couldn't reach the server. Try again.",
  unavailable: "Couldn't set that time. Try again, or record it again.",
};

/**
 * The take that is still being made (spec §2.3).
 *
 * It sits above the Today list and is deliberately NOT a reminder row: it never
 * enters the store, so it cannot be counted, completed, or scheduled. What it
 * can do is exactly three things — be cancelled while it is working, be
 * retried when it failed, and be swiped away when the user is done with it.
 *
 * Every word on it comes from lib/pendingCardContent, so the copy is pinned by
 * tests rather than by this file.
 */

/** The outbox, as React state. */
export function usePendingTakes(): PendingTake[] {
  return useSyncExternalStore(subscribePendingTakes, getPendingTakesSnapshot, getPendingTakesSnapshot);
}

const DISCARD_THRESHOLD = -80;

export type PendingTakeCardProps = {
  take: PendingTake;
  /** The free active-reminder limit, for the unverified-entitlement copy. */
  limit: number;
  onCancel: (creationId: string) => void;
  onRetry: (creationId: string) => void;
  onDiscard: (creationId: string) => void;
  /** Opens the feedback composer pre-loaded with this failed take's details. */
  onReport?: (take: PendingTake) => void;
  /** "When should I remind you?": a quick choice was tapped. */
  onChooseTime?: (creationId: string, choice: QuickChoiceId) => Promise<ResolveTakeOutcome>;
  /** "Pick a time…": open the edit sheet pre-filled with the kept reminder. */
  onPickTime?: (take: PendingTake) => void;
};

function PendingTakeCardView({
  take,
  limit,
  onCancel,
  onRetry,
  onDiscard,
  onReport,
  onChooseTime,
  onPickTime,
}: PendingTakeCardProps) {
  const content = pendingCardContent(take, limit);
  if (content.tone === "ask" && content.ask) {
    return (
      <AskingCard
        take={take}
        content={content}
        onDiscard={onDiscard}
        onRecordAgain={onRetry}
        onChooseTime={onChooseTime}
        onPickTime={onPickTime}
      />
    );
  }
  return (
    <WorkingOrFailedCard
      take={take}
      content={content}
      onCancel={onCancel}
      onRetry={onRetry}
      onDiscard={onDiscard}
      onReport={onReport}
    />
  );
}

/** Swipe left to reveal the discard button — shared by the failed and asking cards. */
function useSwipeToDiscard(enabled: boolean) {
  const translateX = useSharedValue(0);
  const panGesture = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX([-10, 10])
    .onUpdate((event) => {
      if (event.translationX < 0) {
        translateX.value = Math.max(event.translationX, -120);
      }
    })
    .onEnd((event) => {
      translateX.value = withSpring(event.translationX < DISCARD_THRESHOLD ? -120 : 0);
    });
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  const discardStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.abs(translateX.value) / 80),
  }));
  return { translateX, panGesture, cardStyle, discardStyle };
}

/**
 * "When should I remind you?" (founder decision, 2026-10-06).
 *
 * Not a failure, so nothing here is red: the reminder Remi heard is already
 * filled in — emoji, title, the line it will say — and the card asks for the
 * one thing missing. A quick choice creates it; "Pick a time…" opens the edit
 * sheet pre-filled; "Record again" is the quiet way out; a swipe discards.
 */
function AskingCard({
  take,
  content,
  onDiscard,
  onRecordAgain,
  onChooseTime,
  onPickTime,
}: {
  take: PendingTake;
  content: PendingCardContent;
  onDiscard: (creationId: string) => void;
  onRecordAgain: (creationId: string) => void;
  onChooseTime?: PendingTakeCardProps["onChooseTime"];
  onPickTime?: PendingTakeCardProps["onPickTime"];
}) {
  const ask = content.ask!;
  const { translateX, panGesture, cardStyle, discardStyle } = useSwipeToDiscard(true);
  const [busy, setBusy] = useState<QuickChoiceId | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const choose = useCallback(
    async (choice: QuickChoiceId) => {
      if (!onChooseTime || busy) return;
      setBusy(choice);
      setNote(null);
      const outcome = await onChooseTime(take.creationId, choice).catch(
        () => "offline" as const
      );
      // Created: the card stays busy until the import replaces it with the
      // reminder itself, so there is nothing to flash in between.
      if (outcome === "created") return;
      setBusy(null);
      setNote(RESOLVE_NOTES[outcome]);
    },
    [busy, onChooseTime, take.creationId]
  );

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.discardAction, discardStyle]}>
        <Pressable
          onPress={() => {
            translateX.value = withSpring(0);
            onDiscard(take.creationId);
          }}
          style={styles.discardButton}
          accessibilityRole="button"
          accessibilityLabel="Discard this reminder"
        >
          <AppIcon name="trash-2" size={24} color="#fff" />
        </Pressable>
      </Animated.View>

      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.card, cardStyle]}>
          <View style={styles.askHeader}>
            <View style={[styles.chip, styles.chipAsk]}>
              {ask.emoji ? (
                <Text style={styles.emoji}>{ask.emoji}</Text>
              ) : (
                <AppIcon name="bell" size={20} color={colors.accent} />
              )}
            </View>
            <View style={styles.textWrap}>
              <Text style={styles.askTitle} numberOfLines={2}>
                {ask.title}
              </Text>
              <Text style={styles.askLine} numberOfLines={3}>
                {`“${ask.spokenLine}”`}
              </Text>
            </View>
          </View>

          <Text style={styles.askPrompt} accessibilityRole="header">
            {content.text}
          </Text>

          <View style={styles.choiceRow}>
            {QUICK_CHOICES.map((choice) => (
              <Pressable
                key={choice.id}
                onPress={() => void choose(choice.id)}
                disabled={busy !== null}
                style={({ pressed }) => [
                  styles.choice,
                  busy === choice.id && styles.choiceBusy,
                  pressed && styles.choicePressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Remind me ${choice.label.toLowerCase()}`}
              >
                <Text style={styles.choiceText}>
                  {busy === choice.id ? "Setting…" : choice.label}
                </Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => onPickTime?.(take)}
              disabled={busy !== null || !onPickTime}
              style={({ pressed }) => [styles.choice, pressed && styles.choicePressed]}
              accessibilityRole="button"
              accessibilityLabel="Pick a time"
            >
              <AppIcon name="clock" size={14} color={colors.accentDark} />
              <Text style={styles.choiceText}>{PICK_A_TIME_LABEL}</Text>
            </Pressable>
          </View>

          {ask.more ? (
            <Text style={styles.moreText} numberOfLines={2}>
              {ask.more}
            </Text>
          ) : null}
          {note ? <Text style={styles.noteText}>{note}</Text> : null}

          <Pressable
            onPress={() => onRecordAgain(take.creationId)}
            disabled={busy !== null}
            hitSlop={8}
            style={[styles.reportTap, styles.recordAgainTap]}
            accessibilityRole="button"
            accessibilityLabel="Record again"
          >
            <AppIcon name="mic" size={14} color={colors.textTertiary} />
            <Text style={styles.reportText}>Record again</Text>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

function WorkingOrFailedCard({
  take,
  content,
  onCancel,
  onRetry,
  onDiscard,
  onReport,
}: {
  take: PendingTake;
  content: PendingCardContent;
  onCancel: (creationId: string) => void;
  onRetry: (creationId: string) => void;
  onDiscard: (creationId: string) => void;
  onReport?: (take: PendingTake) => void;
}) {
  const { translateX, panGesture, cardStyle, discardStyle } = useSwipeToDiscard(
    content.swipeToDiscard
  );
  const pulse = useSharedValue(1);

  // The shimmer is the whole signal that something is happening — there is no
  // spinner, no percentage, and nothing to tap.
  useEffect(() => {
    if (!content.shimmer) {
      pulse.value = withTiming(1, { duration: 150 });
      return;
    }
    pulse.value = withRepeat(
      withTiming(0.45, { duration: 750, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [content.shimmer, pulse]);

  const textStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const isError = content.tone === "error";

  return (
    <View style={styles.container}>
      {content.swipeToDiscard && (
        <Animated.View style={[styles.discardAction, discardStyle]}>
          <Pressable
            onPress={() => {
              translateX.value = withSpring(0);
              onDiscard(take.creationId);
            }}
            style={styles.discardButton}
            accessibilityRole="button"
            accessibilityLabel="Discard this recording"
          >
            <AppIcon name="trash-2" size={24} color="#fff" />
          </Pressable>
        </Animated.View>
      )}

      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.card, cardStyle]}>
          <Pressable
            onPress={content.tappable ? () => onRetry(take.creationId) : undefined}
            disabled={!content.tappable}
            style={({ pressed }) => [
              styles.cardContent,
              pressed && content.tappable && styles.cardPressed,
            ]}
            accessibilityRole={content.tappable ? "button" : undefined}
            accessibilityLabel={content.heard ? `${content.text}. ${content.heard}` : content.text}
          >
            <View style={[styles.chip, isError && styles.chipError]}>
              <AppIcon
                name={isError ? "refresh-cw" : "mic"}
                size={20}
                color={isError ? colors.statusOverdue : colors.textSecondary}
              />
            </View>

            <Animated.View style={[styles.textWrap, !isError && textStyle]}>
              <Text
                style={[styles.text, isError && styles.textError]}
                numberOfLines={2}
              >
                {content.text}
              </Text>
              {/* What Remi heard, when it heard anything (OLD-137): quiet, so the
                  failure stays the headline. */}
              {content.heard ? (
                <Text style={styles.heardText} numberOfLines={2}>
                  {content.heard}
                </Text>
              ) : null}
            </Animated.View>

            {content.cancellable && (
              <Pressable
                onPress={() => onCancel(take.creationId)}
                hitSlop={12}
                style={styles.cancelTap}
                accessibilityRole="button"
                accessibilityLabel="Cancel this recording"
              >
                <AppIcon name="x" size={18} color={colors.textTertiary} />
              </Pressable>
            )}
          </Pressable>

          {/* A failed take is the one moment worth offering a report: the
              details that make it debuggable are right here. */}
          {isError && onReport && (
            <Pressable
              onPress={() => onReport(take)}
              hitSlop={8}
              style={styles.reportTap}
              accessibilityRole="button"
              accessibilityLabel="Report a problem with this recording"
            >
              <AppIcon name="message-square" size={14} color={colors.textTertiary} />
              <Text style={styles.reportText}>Report a problem</Text>
            </Pressable>
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/**
 * Memoized on purpose.
 *
 * The screen re-renders every 30s off its `nowMs` tick, and the card's own
 * animation is a repeating shimmer — re-mounting that work for a clock the card
 * never reads is pure waste. Its props are the take, a number, and three
 * module-level callbacks, so a shallow compare is exactly right.
 */
const PendingTakeCard = memo(PendingTakeCardView);
export default PendingTakeCard;

/** Every pending take, newest last — the same order the outbox holds them in. */
export function PendingTakeList(props: {
  takes: PendingTake[];
  limit: number;
  onCancel: (creationId: string) => void;
  onRetry: (creationId: string) => void;
  onDiscard: (creationId: string) => void;
  onReport?: (take: PendingTake) => void;
  onChooseTime?: PendingTakeCardProps["onChooseTime"];
  onPickTime?: PendingTakeCardProps["onPickTime"];
}) {
  if (props.takes.length === 0) return null;
  return (
    <View>
      {props.takes.map((take) => (
        <PendingTakeCard
          key={take.creationId}
          take={take}
          limit={props.limit}
          onCancel={props.onCancel}
          onRetry={props.onRetry}
          onDiscard={props.onDiscard}
          onReport={props.onReport}
          onChooseTime={props.onChooseTime}
          onPickTime={props.onPickTime}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  discardAction: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 100,
    backgroundColor: colors.destructive,
    borderRadius: borderRadius.card,
    justifyContent: "center",
    alignItems: "flex-end",
    paddingRight: spacing.lg,
  },
  discardButton: {
    padding: spacing.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.card,
    ...shadows.card,
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: spacing.md,
  },
  cardPressed: {
    opacity: 0.95,
  },
  chip: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  chipError: {
    backgroundColor: colors.surface,
  },
  textWrap: {
    flex: 1,
  },
  text: {
    fontSize: 16,
    fontWeight: "500",
    lineHeight: 22,
    color: colors.textHeading,
  },
  textError: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.statusOverdue,
    fontWeight: "600",
  },
  heardText: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textTertiary,
    fontWeight: "400",
  },
  cancelTap: {
    marginLeft: spacing.sm,
    padding: 4,
  },
  reportTap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingBottom: 14,
    marginTop: -6,
  },
  reportText: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textTertiary,
    fontWeight: "500",
  },
  // ── The asking card: brand-tinted, never the error red ──────────────────
  askHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 16,
    paddingHorizontal: spacing.md,
  },
  chipAsk: {
    backgroundColor: colors.accentLight,
  },
  emoji: {
    fontSize: 22,
  },
  askTitle: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
    color: colors.textHeading,
  },
  askLine: {
    marginTop: 2,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  askPrompt: {
    marginTop: 14,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
    color: colors.accentDark,
  },
  choiceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: 10,
  },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.accentLight,
  },
  choiceBusy: {
    opacity: 0.6,
  },
  choicePressed: {
    opacity: 0.8,
  },
  choiceText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
    color: colors.accentDark,
  },
  moreText: {
    marginTop: 10,
    paddingHorizontal: spacing.md,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  recordAgainTap: {
    marginTop: 0,
    paddingTop: 12,
    alignSelf: "flex-start",
  },
  noteText: {
    marginTop: 8,
    paddingHorizontal: spacing.md,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
});
