import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import BottomSheet, {
    BottomSheetBackdrop,
    BottomSheetTextInput,
    BottomSheetView,
} from "@gorhom/bottom-sheet";
import { Portal } from "@gorhom/portal";
import { ArrowUp, AudioLines } from "lucide-react-native";
import { borderRadius, colors, scaleFontSize } from "../lib/theme";
import { MAX_COMPOSER_CHARS, canSubmitComposerText, normalizeComposerText } from "../lib/typedTake";

const ANIMATION_DURATION = 250;

export type ComposerSheetProps = {
    visible: boolean;
    /** The parse is in flight — the field locks and the send button spins. */
    submitting?: boolean;
    onSubmit: (text: string) => void;
    /** Hand off to the voice flow: the sheet closes and the recorder opens. */
    onSpeak: () => void;
    onDismiss: () => void;
    hostName?: string;
};

/**
 * Typed input (OLD-101). The mic stays the hero; this opens from the header's +.
 *
 * One field and two ways out: send it to the same parse a recording goes
 * through, or hand the sentence over to the voice flow. There are no schedule
 * chips to assemble here on purpose — the parse result opens the edit sheet
 * pre-filled, and its grid is where a mis-read gets corrected.
 */
export default function ComposerSheet({
    visible,
    submitting = false,
    onSubmit,
    onSpeak,
    onDismiss,
    hostName = "root",
}: ComposerSheetProps) {
    const bottomSheetRef = useRef<BottomSheet>(null);
    const [draft, setDraft] = useState("");

    // A fresh sheet is a fresh sentence.
    useEffect(() => {
        if (visible) {
            setDraft("");
            bottomSheetRef.current?.snapToIndex(0);
        } else {
            bottomSheetRef.current?.close();
        }
    }, [visible]);

    // Android back closes the composer instead of leaving the screen.
    useEffect(() => {
        if (!visible) return;

        const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
            onDismiss();
            return true;
        });

        return () => backHandler.remove();
    }, [visible, onDismiss]);

    const renderBackdrop = useCallback(
        (props: any) => (
            <BottomSheetBackdrop
                {...props}
                disappearsOnIndex={-1}
                appearsOnIndex={0}
                opacity={0.25}
                pressBehavior="close"
            />
        ),
        []
    );

    const handleSheetChange = useCallback(
        (index: number) => {
            if (index === -1) {
                onDismiss();
            }
        },
        [onDismiss]
    );

    const handleSubmit = useCallback(() => {
        if (submitting || !canSubmitComposerText(draft)) return;
        onSubmit(normalizeComposerText(draft));
    }, [draft, submitting, onSubmit]);

    // The sentence so far is dropped: the recorder is about to take its own.
    const handleSpeak = useCallback(() => {
        if (submitting) return;
        bottomSheetRef.current?.close();
        onSpeak();
    }, [submitting, onSpeak]);

    if (!visible) return null;

    const canSend = !submitting && canSubmitComposerText(draft);

    return (
        <Portal hostName={hostName}>
            <BottomSheet
                ref={bottomSheetRef}
                index={0}
                enablePanDownToClose
                enableDynamicSizing
                animationConfigs={{ duration: ANIMATION_DURATION }}
                backdropComponent={renderBackdrop}
                onChange={handleSheetChange}
                handleIndicatorStyle={styles.handleIndicator}
                backgroundStyle={styles.background}
                keyboardBehavior="interactive"
                keyboardBlurBehavior="restore"
            >
                <BottomSheetView style={styles.content}>
                    <BottomSheetTextInput
                        style={styles.input}
                        value={draft}
                        onChangeText={setDraft}
                        placeholder="Type to begin"
                        placeholderTextColor={colors.textTertiary}
                        maxLength={MAX_COMPOSER_CHARS}
                        multiline
                        autoFocus
                        editable={!submitting}
                        returnKeyType="send"
                        blurOnSubmit={false}
                        onSubmitEditing={handleSubmit}
                        accessibilityLabel="Type your reminder"
                    />

                    <View style={styles.actions}>
                        {submitting ? (
                            <Text style={styles.status}>Reading that...</Text>
                        ) : (
                            <Text style={styles.hint}>Say it or type it — same reminder.</Text>
                        )}

                        <TouchableOpacity
                            style={styles.speakPill}
                            onPress={handleSpeak}
                            activeOpacity={0.85}
                            disabled={submitting}
                            accessibilityRole="button"
                            accessibilityLabel="Speak instead"
                        >
                            <AudioLines size={16} color="white" strokeWidth={2} />
                            <Text style={styles.speakText}>Speak</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
                            onPress={handleSubmit}
                            activeOpacity={0.85}
                            disabled={!canSend}
                            accessibilityRole="button"
                            accessibilityLabel="Create reminder"
                        >
                            {submitting ? (
                                <ActivityIndicator size="small" color="white" />
                            ) : (
                                <ArrowUp size={20} color="white" strokeWidth={2.25} />
                            )}
                        </TouchableOpacity>
                    </View>
                </BottomSheetView>
            </BottomSheet>
        </Portal>
    );
}

const styles = StyleSheet.create({
    handleIndicator: {
        backgroundColor: "#e0e0e0",
        width: 40,
    },
    background: {
        backgroundColor: colors.card,
        borderTopLeftRadius: borderRadius.sheet,
        borderTopRightRadius: borderRadius.sheet,
    },
    content: {
        paddingHorizontal: 20,
        paddingTop: 6,
        paddingBottom: 28,
    },
    input: {
        minHeight: 72,
        maxHeight: 160,
        fontSize: scaleFontSize(17),
        lineHeight: scaleFontSize(24),
        color: colors.textPrimary,
        textAlignVertical: "top",
    },
    actions: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginTop: 12,
    },
    hint: {
        flex: 1,
        fontSize: scaleFontSize(13),
        color: colors.textTertiary,
    },
    status: {
        flex: 1,
        fontSize: scaleFontSize(13),
        color: colors.textSecondary,
    },
    speakPill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        backgroundColor: colors.textHeading,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: borderRadius.full,
    },
    speakText: {
        color: "white",
        fontWeight: "600",
        fontSize: scaleFontSize(14),
    },
    sendButton: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: colors.accent,
        alignItems: "center",
        justifyContent: "center",
    },
    sendButtonDisabled: {
        backgroundColor: colors.muted,
    },
});
