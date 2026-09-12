import { useCallback, useMemo, useSyncExternalStore } from "react";
import { StyleSheet, Text, View } from "react-native";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import {
  getFeedbackOutboxSnapshot,
  subscribeFeedbackOutbox,
  type FeedbackOutboxItem,
} from "../lib/feedbackOutbox";
import { borderRadius, colors, scaleFontSize, shadows } from "../lib/theme";

/** One row as the founder's dashboard returns it (backend contract). */
export type ServerFeedback = {
  id: string;
  clientId: string;
  text: string;
  createdAt: number;
  status: "received" | "looking" | "fixed";
  note?: string;
  respondedAt?: number;
  updatedAt: number;
};

type DisplayStatus = "queued" | "received" | "looking" | "fixed";

type FeedbackRow = {
  key: string;
  text: string;
  createdAt: number;
  status: DisplayStatus;
  note?: string;
};

const STATUS_LABEL: Record<DisplayStatus, string> = {
  queued: "Waiting to send",
  received: "Received",
  looking: "Looking into it",
  fixed: "Fixed",
};

/** The outbox as React state (same shape as usePendingTakes). */
function useFeedbackOutbox(): FeedbackOutboxItem[] {
  return useSyncExternalStore(
    subscribeFeedbackOutbox,
    getFeedbackOutboxSnapshot,
    getFeedbackOutboxSnapshot
  );
}

/**
 * Merge the local outbox with the server list into one newest-first list.
 *
 * The server row is authoritative once it exists (it carries the founder's
 * status and note). A note still in the outbox but not yet on the server shows
 * as "Waiting to send" while queued, or optimistically "Received" the moment it
 * has been sent but the query hasn't caught up.
 */
export function mergeFeedback(
  outbox: FeedbackOutboxItem[],
  server: ServerFeedback[] | undefined
): FeedbackRow[] {
  const byClientId = new Map<string, FeedbackRow>();

  for (const item of outbox) {
    byClientId.set(item.clientId, {
      key: item.clientId,
      text: item.text,
      createdAt: item.createdAt,
      status: item.state === "queued" ? "queued" : "received",
    });
  }

  for (const row of server ?? []) {
    byClientId.set(row.clientId, {
      key: row.clientId,
      text: row.text,
      createdAt: row.createdAt,
      status: row.status,
      note: row.note,
    });
  }

  return [...byClientId.values()].sort((a, b) => b.createdAt - a.createdAt);
}

function formatDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export type FeedbackListProps = {
  visible: boolean;
  /** Server rows for this device, or undefined while the query is loading. */
  items: ServerFeedback[] | undefined;
  onClose: () => void;
};

/**
 * "Your feedback": the notes this device has sent and where each one stands.
 */
export default function FeedbackList({ visible, items, onClose }: FeedbackListProps) {
  const outbox = useFeedbackOutbox();
  const rows = useMemo(() => mergeFeedback(outbox, items), [outbox, items]);
  const snapPoints = useMemo(() => ["85%"], []);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.35}
        pressBehavior="close"
      />
    ),
    []
  );

  if (!visible) return null;

  return (
    <BottomSheet
      snapPoints={snapPoints}
      index={0}
      enablePanDownToClose
      animateOnMount
      backdropComponent={renderBackdrop}
      onClose={onClose}
      handleIndicatorStyle={styles.handleIndicator}
      backgroundStyle={styles.sheetBackground}
    >
      <BottomSheetScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Your feedback</Text>

        {rows.length === 0 ? (
          <Text style={styles.empty}>Nothing sent yet.</Text>
        ) : (
          rows.map((row) => (
            <View key={row.key} style={styles.row}>
              <View style={styles.rowHeader}>
                <Text style={styles.date}>{formatDate(row.createdAt)}</Text>
                <View style={[styles.chip, chipStyleFor(row.status)]}>
                  <Text style={[styles.chipText, chipTextStyleFor(row.status)]}>
                    {STATUS_LABEL[row.status]}
                  </Text>
                </View>
              </View>
              <Text style={styles.text} numberOfLines={2}>
                {row.text}
              </Text>
              {row.note ? <Text style={styles.note}>{row.note}</Text> : null}
            </View>
          ))
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

function chipStyleFor(status: DisplayStatus) {
  if (status === "fixed") return styles.chipFixed;
  if (status === "looking") return styles.chipLooking;
  return styles.chipNeutral;
}

function chipTextStyleFor(status: DisplayStatus) {
  if (status === "fixed") return styles.chipTextFixed;
  if (status === "looking") return styles.chipTextLooking;
  return styles.chipTextNeutral;
}

const styles = StyleSheet.create({
  sheetBackground: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.sheet,
    borderTopRightRadius: borderRadius.sheet,
  },
  handleIndicator: {
    backgroundColor: "#e0e0e0",
    width: 36,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  title: {
    fontSize: scaleFontSize(20),
    fontWeight: "600",
    lineHeight: scaleFontSize(26),
    color: colors.textHeading,
    marginBottom: 16,
  },
  empty: {
    fontSize: scaleFontSize(15),
    lineHeight: scaleFontSize(21),
    color: colors.textSecondary,
    marginTop: 24,
    textAlign: "center",
  },
  row: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: 16,
    marginBottom: 12,
    ...shadows.card,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  date: {
    fontSize: scaleFontSize(13),
    lineHeight: scaleFontSize(18),
    color: colors.textTertiary,
  },
  chip: {
    borderRadius: borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipNeutral: {
    backgroundColor: colors.surfaceAlt,
  },
  chipLooking: {
    backgroundColor: colors.accent + "1A",
  },
  chipFixed: {
    backgroundColor: colors.statusUpcoming + "1A",
  },
  chipText: {
    fontSize: scaleFontSize(12),
    fontWeight: "600",
    lineHeight: scaleFontSize(16),
  },
  chipTextNeutral: {
    color: colors.textSecondary,
  },
  chipTextLooking: {
    color: colors.accent,
  },
  chipTextFixed: {
    color: colors.statusUpcoming,
  },
  text: {
    fontSize: scaleFontSize(15),
    lineHeight: scaleFontSize(21),
    color: colors.textPrimary,
  },
  note: {
    fontSize: scaleFontSize(14),
    lineHeight: scaleFontSize(20),
    color: colors.textSecondary,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
