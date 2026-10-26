import { useCallback, useState } from "react";
import { DENSE_MAX_FONT_SCALE } from "../lib/textDefaults";
import { LayoutChangeEvent, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Plus } from "lucide-react-native";
import AppIcon from "./AppIcon";
import { t } from "../lib/i18n";
import { colors, scaleFontSize, shadows } from "../lib/theme";
import { FONT_DISPLAY } from "../lib/fonts";
import { joinedScriptText } from "../lib/scriptStyle";
import {
  ADD_BUTTON_SIZE,
  HEADER_GAP,
  PILL_GAP,
  PILL_MAX_WIDTH,
  PILL_MIN_SCALE,
  TITLE_MIN_SCALE,
  proPillMode,
} from "../lib/headerFit";

type HomeHeaderProps = {
  dateLabel: string;
  isPro: boolean;
  onGetPro: () => void;
  onAdd: () => void;
};

/** The pill's crown and label, shared by the visible pill and its measurer. */
function PillContent({ label, fit }: { label: string; fit: boolean }) {
  return (
    <>
      <AppIcon name="crown" size={14} color="white" style={styles.proIcon} />
      <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE}
        style={styles.proPillText}
        numberOfLines={1}
        adjustsFontSizeToFit={fit}
        minimumFontScale={PILL_MIN_SCALE}
      >
        {label}
      </Text>
    </>
  );
}

/**
 * Home's title row: "Reminders" + date, the "Get Pro" pill, the + button.
 * The title keeps HEADER_GAP from the pill and stays on one line; when the
 * full pill and the title don't both fit (lib/headerFit), the pill compacts to
 * crown + "Pro", and a title still too wide shrinks rather than collide.
 * Natural widths come from two invisible one-line measurers.
 */
export default function HomeHeader({ dateLabel, isPro, onGetPro, onAdd }: HomeHeaderProps) {
  const title = t("today.header.title");
  const proLabel = t("today.header.getPro");
  const [rowWidth, setRowWidth] = useState(0);
  const [titleWidth, setTitleWidth] = useState(0);
  const [pillFullWidth, setPillFullWidth] = useState(0);
  const [pillCompactWidth, setPillCompactWidth] = useState(0);

  const widthSetter = useCallback(
    (set: (width: number) => void) => (event: LayoutChangeEvent) => {
      const width = Math.ceil(event.nativeEvent.layout.width);
      if (width > 0) set(width);
    },
    []
  );

  const mode = proPillMode({ rowWidth, titleWidth, pillFullWidth, pillCompactWidth });
  const stacked = mode === "stacked";

  const titleText = (
    <Text
      style={[styles.headerTitle, joinedScriptText()]}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={TITLE_MIN_SCALE}
    >
      {title}
    </Text>
  );
  const dateText = (
    <Text style={[styles.headerDate, stacked && styles.headerDateStacked]} numberOfLines={1}>
      {dateLabel}
    </Text>
  );
  const actions = (
    <View style={styles.headerActions}>
      {!isPro && (
        <TouchableOpacity
          style={[styles.proPill, mode !== "full" && styles.proPillCompact]}
          activeOpacity={0.85}
          onPress={onGetPro}
          accessibilityRole="button"
          accessibilityLabel={proLabel}
          testID={`pro-pill-${mode}`}
        >
          <PillContent label={mode === "full" ? proLabel : "Pro"} fit={mode === "full"} />
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={styles.addButton}
        activeOpacity={0.85}
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel={t("today.header.addTyped.a11y")}
      >
        <Plus size={20} color={colors.textHeading} strokeWidth={2} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.header}>
      <View style={[styles.headerTop, stacked && styles.headerTopStacked]} onLayout={widthSetter(setRowWidth)}>
        {stacked ? (
          // Too long even shrunk next to the compact pill: the title gets its
          // own line; the date, pill and + share the row under it.
          <>
            {titleText}
            <View style={styles.stackedRow}>
              {dateText}
              {actions}
            </View>
          </>
        ) : (
          <>
            <View style={styles.headerTitleWrap}>
              {titleText}
              {dateText}
            </View>
            {actions}
          </>
        )}

        {/* Invisible natural-width measurers (no width limit, one line). */}
        <View style={styles.measureBox} pointerEvents="none" aria-hidden>
          <View style={styles.measureItem}>
            <Text style={[styles.headerTitle, joinedScriptText()]} numberOfLines={1} onLayout={widthSetter(setTitleWidth)}>
              {title}
            </Text>
          </View>
          {!isPro && (
            <View style={styles.measureItem}>
              <View style={[styles.proPill, styles.proPillMeasure]} onLayout={widthSetter(setPillFullWidth)}>
                <PillContent label={proLabel} fit={false} />
              </View>
            </View>
          )}
          {!isPro && (
            <View style={styles.measureItem}>
              <View style={[styles.proPill, styles.proPillCompact, styles.proPillMeasure]} onLayout={widthSetter(setPillCompactWidth)}>
                <PillContent label="Pro" fit={false} />
              </View>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: Platform.OS === "ios" ? 60 : 26,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerTopStacked: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  stackedRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  headerDateStacked: {
    flex: 1,
    marginTop: 0,
    marginRight: HEADER_GAP,
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
    // Never touches the pill, whatever the language.
    marginRight: HEADER_GAP,
  },
  headerTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: scaleFontSize(32),
    lineHeight: scaleFontSize(38),
    letterSpacing: -0.3,
    color: colors.textHeading,
  },
  headerDate: {
    marginTop: 4,
    fontSize: scaleFontSize(14),
    lineHeight: scaleFontSize(20),
    color: colors.textSecondary,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
  },
  proPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    marginRight: PILL_GAP,
    // Longer translations shrink the label first; past that the pill compacts.
    maxWidth: PILL_MAX_WIDTH,
    flexShrink: 1,
  },
  proPillCompact: {
    paddingHorizontal: 10,
  },
  proPillMeasure: {
    maxWidth: undefined,
    marginRight: 0,
    alignSelf: "flex-start",
  },
  proPillText: {
    flexShrink: 1,
    color: "white",
    fontWeight: "600",
    fontSize: scaleFontSize(14),
    lineHeight: scaleFontSize(19),
  },
  proIcon: {
    marginRight: 6,
  },
  // Tiimo-style header +: quiet white circle, top-right. The composer's only door.
  addButton: {
    width: ADD_BUTTON_SIZE,
    height: ADD_BUTTON_SIZE,
    borderRadius: ADD_BUTTON_SIZE / 2,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.card,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  measureBox: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 2000,
    opacity: 0,
  },
  measureItem: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
});
