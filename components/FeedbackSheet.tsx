import { useCallback, useMemo, useRef, useState } from "react";
import { Keyboard, StyleSheet, Text, View } from "react-native";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetTextInput,
  BottomSheetView,
  TouchableOpacity,
} from "@gorhom/bottom-sheet";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { useToast } from "./ToastProvider";
import { getDeviceId } from "../lib/deviceId";
import {
  enqueue,
  flush,
  isQueued,
  newFeedbackClientId,
  type FeedbackContext,
  type FeedbackSubmitInput,
  type FeedbackSubmitResult,
} from "../lib/feedbackOutbox";
import { buildFeedbackContext } from "../lib/feedbackContext";
import { borderRadius, colors, scaleFontSize, shadows } from "../lib/theme";

const MAX_FEEDBACK_CHARS = 2000;

export type FeedbackSheetProps = {
  visible: boolean;
  /** The entrance's context; merged with build/runtime fields at send time. */
  context: FeedbackContext | null;
  /** The single grey notice line; empty string renders no line. */
  notice: string;
  onClose: () => void;
};

/**
 * The feedback composer (bottom sheet).
 *
 * Send does the durable thing first — the note is written to the outbox before
 * anything else — then tries to flush it right away. Whether the flush landed
 * decides the toast: a note that reached the server says "Sent. Thank you.", a
 * note still queued (offline, or the send failed) says it's saved on the phone
 * and will go out later. Either way the sheet closes; nothing is lost.
 */
export default function FeedbackSheet({ visible, context, notice, onClose }: FeedbackSheetProps) {
  const submitFeedback = useMutation(api.feedback.submit);
  const toast = useToast();
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["55%", "90%"], []);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const reset = useCallback(() => {
    setText("");
    setSending(false);
  }, []);

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    reset();
    onClose();
  }, [onClose, reset]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);

    const clientId = newFeedbackClientId();
    const fullContext = buildFeedbackContext(context ?? {});

    // Persist first — this is the promise the user is told about.
    try {
      await enqueue({
        clientId,
        text: trimmed,
        createdAt: Date.now(),
        context: fullContext,
      });
    } catch {
      // Couldn't even save locally: rare (storage full). Tell them plainly.
      toast.show({ title: "Couldn't save your note", message: "Please try again.", type: "error" });
      setSending(false);
      return;
    }

    // Try to send it now. The outbox binds the deviceId; a failure just leaves
    // it queued for the next flush trigger.
    const deviceId = await getDeviceId();
    const submit = (input: FeedbackSubmitInput): Promise<FeedbackSubmitResult> =>
      submitFeedback({ deviceId, ...input }) as Promise<FeedbackSubmitResult>;
    await flush(submit).catch(() => {});

    if (isQueued(clientId)) {
      toast.show({
        title: "Saved on this phone",
        message: "Sends when Remi is open and online.",
        type: "info",
      });
    } else {
      toast.show({ title: "Sent. Thank you.", type: "success" });
    }

    handleClose();
  }, [text, sending, context, submitFeedback, toast, handleClose]);

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

  const sendDisabled = sending || text.trim().length === 0;

  return (
    <BottomSheet
      ref={sheetRef}
      snapPoints={snapPoints}
      index={0}
      enablePanDownToClose
      animateOnMount
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backdropComponent={renderBackdrop}
      onClose={handleClose}
      handleIndicatorStyle={styles.handleIndicator}
      backgroundStyle={styles.sheetBackground}
    >
      <BottomSheetView style={styles.content}>
        <Text style={styles.title}>Send feedback</Text>

        <View style={styles.inputCard}>
          <BottomSheetTextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="What happened? What were you trying to do?"
            placeholderTextColor={colors.textTertiary}
            multiline
            autoFocus
            maxLength={MAX_FEEDBACK_CHARS}
            editable={!sending}
          />
        </View>

        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleClose}
            activeOpacity={0.7}
            disabled={sending}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sendButton, sendDisabled && styles.sendButtonDisabled]}
            onPress={() => void handleSend()}
            activeOpacity={0.7}
            disabled={sendDisabled}
          >
            <Text style={styles.sendText}>{sending ? "Sending…" : "Send"}</Text>
          </TouchableOpacity>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
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
    paddingBottom: 28,
  },
  title: {
    fontSize: scaleFontSize(20),
    fontWeight: "600",
    lineHeight: scaleFontSize(26),
    color: colors.textHeading,
    marginBottom: 16,
  },
  inputCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...shadows.card,
  },
  input: {
    fontSize: scaleFontSize(16),
    lineHeight: scaleFontSize(22),
    color: colors.textPrimary,
    minHeight: 120,
    textAlignVertical: "top",
    padding: 0,
  },
  notice: {
    fontSize: scaleFontSize(13),
    lineHeight: scaleFontSize(18),
    color: colors.textSecondary,
    marginTop: 12,
    marginLeft: 4,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 24,
  },
  cancelButton: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: borderRadius.full,
    backgroundColor: colors.card,
    ...shadows.card,
  },
  cancelText: {
    fontSize: scaleFontSize(16),
    fontWeight: "600",
    lineHeight: scaleFontSize(21),
    color: colors.textSecondary,
  },
  sendButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    borderRadius: borderRadius.full,
    paddingVertical: 15,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendText: {
    fontSize: scaleFontSize(16),
    fontWeight: "600",
    lineHeight: scaleFontSize(21),
    color: "white",
  },
});
