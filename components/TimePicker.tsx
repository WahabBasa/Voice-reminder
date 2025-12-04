import { View, Text, StyleSheet } from "react-native";
import WheelPicker from "@quidone/react-native-wheel-picker";
import { colors, spacing, borderRadius } from "../lib/theme";

interface TimePickerProps {
  value: Date;
  onChange: (date: Date) => void;
}

const hours = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: String(i + 1),
}));

const minutes = Array.from({ length: 60 }, (_, i) => ({
  value: i,
  label: i.toString().padStart(2, "0"),
}));

const periods = [
  { value: "AM", label: "AM" },
  { value: "PM", label: "PM" },
];

export default function TimePicker({ value, onChange }: TimePickerProps) {
  const currentHour = value.getHours();
  const hour12 = currentHour % 12 || 12;
  const minute = value.getMinutes();
  const isPM = currentHour >= 12;

  const updateTime = (newHour12: number, newMinute: number, newIsPM: boolean) => {
    const newDate = new Date(value);
    let hour24 = newHour12;
    if (newIsPM && newHour12 !== 12) hour24 = newHour12 + 12;
    if (!newIsPM && newHour12 === 12) hour24 = 0;
    newDate.setHours(hour24, newMinute, 0, 0);
    onChange(newDate);
  };

  return (
    <View style={styles.container}>
      <WheelPicker
        data={hours}
        value={hour12}
        onValueChanged={({ item }) => updateTime(item.value, minute, isPM)}
        width={70}
        itemHeight={44}
        itemTextStyle={styles.itemText}
      />
      
      <Text style={styles.separator}>:</Text>
      
      <WheelPicker
        data={minutes}
        value={minute}
        onValueChanged={({ item }) => updateTime(hour12, item.value, isPM)}
        width={70}
        itemHeight={44}
        itemTextStyle={styles.itemText}
      />
      
      <WheelPicker
        data={periods}
        value={isPM ? "PM" : "AM"}
        onValueChanged={({ item }) => updateTime(hour12, minute, item.value === "PM")}
        width={70}
        itemHeight={44}
        itemTextStyle={styles.itemText}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
  },
  separator: {
    fontSize: 28,
    fontWeight: "600",
    color: colors.textPrimary,
    marginHorizontal: spacing.xs,
  },
  itemText: {
    fontSize: 22,
    color: colors.textPrimary,
  },
});
