import { View, Text, StyleSheet } from "react-native";
import ScrollSelector from "./ScrollSelector";
import { colors, borderRadius } from "../lib/theme";

interface TimePickerProps {
  value: Date;
  onChange: (date: Date) => void;
}

const hours = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
const periods = ["AM", "PM"];

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
      <ScrollSelector
        dataSource={hours}
        selectedIndex={hour12 - 1}
        loop
        onValueChange={(val) => {
          const newHour = parseInt(val, 10);
          updateTime(newHour, minute, isPM);
        }}
        wrapperHeight={150}
        wrapperWidth={70}
        itemHeight={50}
        highlightColor="#e0e0e0"
        highlightBorderWidth={1}
      />

      <Text style={styles.separator}>:</Text>

      <ScrollSelector
        dataSource={minutes}
        selectedIndex={minute}
        loop
        onValueChange={(val) => {
          const newMinute = parseInt(val, 10);
          updateTime(hour12, newMinute, isPM);
        }}
        wrapperHeight={150}
        wrapperWidth={70}
        itemHeight={50}
        highlightColor="#e0e0e0"
        highlightBorderWidth={1}
      />

      <ScrollSelector
        dataSource={periods}
        selectedIndex={isPM ? 1 : 0}
        onValueChange={(val) => {
          updateTime(hour12, minute, val === "PM");
        }}
        wrapperHeight={150}
        wrapperWidth={60}
        itemHeight={50}
        highlightColor="#e0e0e0"
        highlightBorderWidth={1}
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
  },
  separator: {
    fontSize: 28,
    fontWeight: "600",
    color: colors.textPrimary,
    marginHorizontal: 4,
  },
});
