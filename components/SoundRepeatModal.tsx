import React, { useState } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { scaleFontSize } from "../lib/theme";

type SoundRepeatModalProps = {
  visible: boolean;
  initialValue: string | number;
  onConfirm: (value: string | number) => void;
  onCancel: () => void;
};

const OPTIONS = [
  { label: "1x", value: 1 },
  { label: "2x", value: 2 },
  { label: "3x", value: 3 },
  { label: "5x", value: 5 },
  { label: "10x", value: 10 },
  { label: "Until stopped", value: "until_stopped" },
];

export default function SoundRepeatModal({
  visible,
  initialValue,
  onConfirm,
  onCancel,
}: SoundRepeatModalProps) {
  const [selectedValue, setSelectedValue] = useState(initialValue);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>Sound repeats</Text>
          
          <View style={styles.optionsContainer}>
            {OPTIONS.map((opt) => {
              const isSelected = selectedValue === opt.value;
              return (
                <TouchableOpacity
                  key={opt.label}
                  style={[
                    styles.optionRow,
                    isSelected && styles.optionRowSelected,
                  ]}
                  onPress={() => setSelectedValue(opt.value)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.optionText,
                      isSelected && styles.optionTextSelected,
                    ]}
                  >
                    {opt.label}
                  </Text>
                  {isSelected && (
                    <View style={styles.radioOuter}>
                      <View style={styles.radioInner} />
                    </View>
                  )}
                  {!isSelected && <View style={styles.radioOuter} />}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity onPress={onCancel} style={styles.actionButton}>
              <Text style={styles.cancelText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onConfirm(selectedValue)}
              style={styles.actionButton}
            >
              <Text style={styles.doneText}>DONE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modal: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 20,
    width: "100%",
    maxWidth: 340,
  },
  title: {
    fontSize: scaleFontSize(18),
    fontWeight: "700",
    color: "#212121",
    marginBottom: 16,
  },
  optionsContainer: {
    marginVertical: 8,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  optionRowSelected: {
    // Optional: add background or different color if needed
  },
  optionText: {
    fontSize: scaleFontSize(15),
    color: "#424242",
  },
  optionTextSelected: {
    color: "#212121",
    fontWeight: "500",
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#bdbdbd",
    justifyContent: "center",
    alignItems: "center",
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#4285f4",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 12,
    gap: 20,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  cancelText: {
    fontSize: scaleFontSize(14),
    fontWeight: "600",
    color: "#757575",
  },
  doneText: {
    fontSize: scaleFontSize(14),
    fontWeight: "600",
    color: "#4285f4",
  },
});
