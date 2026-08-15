import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { TimerPickerModal } from "react-native-timer-picker";
import AppIcon from "./AppIcon";
import {
  INTERVAL_PRESET_MINUTES,
  MAX_TIMES_PER_DAY,
  formatClock12,
  formatEveryMinutes,
  type ScheduleDraft,
  type TimesMode,
} from "./schedule/scheduleDraft";
import { normalizeClockTimes } from "../lib/schedule";
import { borderRadius, colors, scaleFontSize } from "../lib/theme";

/**
 * The times axis of the schedule grid (OLD-99): a list of clock times, or an
 * interval inside a start–end window.
 *
 * Rendered inline in the edit sheet rather than behind another modal — the
 * whole point of the grid is that a mis-parse ("8 and 9" heard as one ring) is
 * fixed in one place without leaving the sheet.
 */

type TimesPatch = Partial<
  Pick<ScheduleDraft, "timesMode" | "times" | "everyMinutes" | "windowStart" | "windowEnd">
>;

type TimesEditorProps = {
  mode: TimesMode;
  times: string[];
  everyMinutes: number;
  windowStart: string;
  windowEnd: string;
  onChange: (patch: TimesPatch) => void;
  /** Interval mode is premium (decision 6). Locked = tapping it calls back instead. */
  intervalLocked?: boolean;
  onIntervalLocked?: () => void;
};

/** Which value the shared time wheel is currently editing. */
type PickerTarget =
  | { kind: "time"; index: number } // index -1 = appending a new time
  | { kind: "windowStart" }
  | { kind: "windowEnd" };

function toHoursMinutes(time: string): { hours: number; minutes: number } {
  const [hours, minutes] = time.split(":").map(Number);
  return { hours: Number.isFinite(hours) ? hours : 9, minutes: Number.isFinite(minutes) ? minutes : 0 };
}

/** The preset step nearest the current value, so a parsed 37 min still steps sanely. */
function nearestPresetIndex(everyMinutes: number): number {
  let best = 0;
  for (let i = 1; i < INTERVAL_PRESET_MINUTES.length; i++) {
    if (
      Math.abs(INTERVAL_PRESET_MINUTES[i] - everyMinutes) <
      Math.abs(INTERVAL_PRESET_MINUTES[best] - everyMinutes)
    ) {
      best = i;
    }
  }
  return best;
}

export default function TimesEditor({
  mode,
  times,
  everyMinutes,
  windowStart,
  windowEnd,
  onChange,
  intervalLocked = false,
  onIntervalLocked,
}: TimesEditorProps) {
  const [picker, setPicker] = useState<PickerTarget | null>(null);

  const pickerInitial = useMemo(() => {
    if (!picker) return { hours: 9, minutes: 0 };
    if (picker.kind === "windowStart") return toHoursMinutes(windowStart);
    if (picker.kind === "windowEnd") return toHoursMinutes(windowEnd);
    // A new time opens on midday rather than on whatever was picked last.
    return picker.index < 0 ? { hours: 12, minutes: 0 } : toHoursMinutes(times[picker.index]);
  }, [picker, times, windowStart, windowEnd]);

  const applyPickedTime = useCallback(
    (value: string) => {
      if (!picker) return;
      if (picker.kind === "windowStart") {
        onChange({ windowStart: value });
      } else if (picker.kind === "windowEnd") {
        onChange({ windowEnd: value });
      } else {
        const next = [...times];
        if (picker.index < 0) next.push(value);
        else next[picker.index] = value;
        // Re-normalizing here is what makes "8am twice" collapse to one ring.
        onChange({ times: normalizeClockTimes(next) });
      }
      setPicker(null);
    },
    [picker, times, onChange]
  );

  const removeTime = useCallback(
    (index: number) => {
      if (times.length <= 1) return; // a schedule with no time is not a schedule
      onChange({ times: times.filter((_, i) => i !== index) });
    },
    [times, onChange]
  );

  const stepInterval = useCallback(
    (delta: number) => {
      const index = nearestPresetIndex(everyMinutes);
      const nextIndex = Math.max(0, Math.min(INTERVAL_PRESET_MINUTES.length - 1, index + delta));
      onChange({ everyMinutes: INTERVAL_PRESET_MINUTES[nextIndex] });
    },
    [everyMinutes, onChange]
  );

  const selectMode = useCallback(
    (next: TimesMode) => {
      if (next === "interval" && intervalLocked) {
        onIntervalLocked?.();
        return;
      }
      if (next !== mode) onChange({ timesMode: next });
    },
    [mode, intervalLocked, onIntervalLocked, onChange]
  );

  const presetIndex = nearestPresetIndex(everyMinutes);

  return (
    <View style={styles.container}>
      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modeChip, mode === "clock" && styles.modeChipSelected]}
          onPress={() => selectMode("clock")}
          activeOpacity={0.7}
        >
          <Text style={[styles.modeChipText, mode === "clock" && styles.modeChipTextSelected]}>
            Set times
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeChip, mode === "interval" && styles.modeChipSelected]}
          onPress={() => selectMode("interval")}
          activeOpacity={0.7}
        >
          {intervalLocked ? (
            <AppIcon
              name="crown"
              size={13}
              color={mode === "interval" ? "#ffffff" : colors.textSecondary}
            />
          ) : null}
          <Text style={[styles.modeChipText, mode === "interval" && styles.modeChipTextSelected]}>
            Interval
          </Text>
        </TouchableOpacity>
      </View>

      {mode === "clock" ? (
        <View style={styles.timeChips}>
          {times.map((time, index) => (
            <View key={`${time}-${index}`} style={styles.timeChip}>
              <TouchableOpacity
                onPress={() => setPicker({ kind: "time", index })}
                activeOpacity={0.7}
              >
                <Text style={styles.timeChipText}>{formatClock12(time)}</Text>
              </TouchableOpacity>
              {times.length > 1 ? (
                <TouchableOpacity
                  onPress={() => removeTime(index)}
                  hitSlop={8}
                  activeOpacity={0.7}
                  accessibilityLabel={`Remove ${formatClock12(time)}`}
                >
                  <AppIcon name="x" size={13} color={colors.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
          {times.length < MAX_TIMES_PER_DAY ? (
            <TouchableOpacity
              style={styles.addChip}
              onPress={() => setPicker({ kind: "time", index: -1 })}
              activeOpacity={0.7}
            >
              <Text style={styles.addChipText}>+ Add time</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <View style={styles.intervalBlock}>
          <View style={styles.intervalRow}>
            <Text style={styles.intervalLabel}>Every</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.stepperButton}
                onPress={() => stepInterval(-1)}
                disabled={presetIndex === 0}
                activeOpacity={0.7}
              >
                <Text style={[styles.stepperGlyph, presetIndex === 0 && styles.stepperGlyphDisabled]}>
                  −
                </Text>
              </TouchableOpacity>
              <Text style={styles.stepperValue}>{formatEveryMinutes(everyMinutes)}</Text>
              <TouchableOpacity
                style={styles.stepperButton}
                onPress={() => stepInterval(1)}
                disabled={presetIndex === INTERVAL_PRESET_MINUTES.length - 1}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.stepperGlyph,
                    presetIndex === INTERVAL_PRESET_MINUTES.length - 1 && styles.stepperGlyphDisabled,
                  ]}
                >
                  +
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.intervalRow}>
            <Text style={styles.intervalLabel}>Between</Text>
            <View style={styles.windowRow}>
              <TouchableOpacity
                style={styles.windowPill}
                onPress={() => setPicker({ kind: "windowStart" })}
                activeOpacity={0.7}
              >
                <Text style={styles.windowPillText}>{formatClock12(windowStart)}</Text>
              </TouchableOpacity>
              <Text style={styles.windowDash}>–</Text>
              <TouchableOpacity
                style={styles.windowPill}
                onPress={() => setPicker({ kind: "windowEnd" })}
                activeOpacity={0.7}
              >
                <Text style={styles.windowPillText}>{formatClock12(windowEnd)}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.intervalHint}>Stays quiet outside the window.</Text>
        </View>
      )}

      {picker ? (
        <TimerPickerModal
          closeOnOverlayPress
          LinearGradient={LinearGradient}
          hideDays
          visible
          setIsVisible={(next: boolean) => {
            if (!next) setPicker(null);
          }}
          modalTitle="Select time"
          onCancel={() => setPicker(null)}
          amLabel="AM"
          pmLabel="PM"
          initialValue={pickerInitial}
          onConfirm={({ hours, minutes, seconds }) => {
            // react-native-timer-picker's AM/PM wheel rides in `seconds`.
            const isPm = (seconds ?? 0) >= 12;
            const hour24 = (hours % 12) + (isPm ? 12 : 0);
            applyPickedTime(
              `${String(hour24).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
            );
          }}
          styles={{ theme: "light" }}
          useAmPmWheel
          use12HourPicker
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingLeft: 36,
    paddingBottom: 14,
    paddingTop: 2,
    gap: 12,
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
  },
  modeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.full,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  modeChipSelected: {
    backgroundColor: colors.accent,
  },
  modeChipText: {
    fontSize: scaleFontSize(12),
    fontWeight: "600",
    color: colors.textSecondary,
  },
  modeChipTextSelected: {
    color: "#ffffff",
  },
  timeChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  timeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.accentLight,
    borderRadius: borderRadius.full,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  timeChipText: {
    fontSize: scaleFontSize(13),
    fontWeight: "600",
    color: colors.accentDark,
  },
  addChip: {
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  addChipText: {
    fontSize: scaleFontSize(13),
    fontWeight: "600",
    color: colors.textSecondary,
  },
  intervalBlock: {
    gap: 12,
  },
  intervalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  intervalLabel: {
    fontSize: scaleFontSize(13),
    fontWeight: "500",
    color: colors.textSecondary,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stepperButton: {
    width: 30,
    height: 30,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperGlyph: {
    fontSize: scaleFontSize(17),
    fontWeight: "600",
    color: colors.textPrimary,
    lineHeight: scaleFontSize(19),
  },
  stepperGlyphDisabled: {
    color: colors.textTertiary,
  },
  stepperValue: {
    fontSize: scaleFontSize(13),
    fontWeight: "700",
    color: colors.textPrimary,
    minWidth: 74,
    textAlign: "center",
  },
  windowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  windowPill: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.full,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  windowPillText: {
    fontSize: scaleFontSize(13),
    fontWeight: "600",
    color: colors.textPrimary,
  },
  windowDash: {
    fontSize: scaleFontSize(13),
    color: colors.textSecondary,
  },
  intervalHint: {
    fontSize: scaleFontSize(11),
    color: colors.textTertiary,
  },
});
