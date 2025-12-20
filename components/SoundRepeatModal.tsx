import React, { useEffect, useState } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
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

export default function SoundRepeatModal({
  visible,
  initialValue,
  onConfirm,
  onCancel,
}: SoundRepeatModalProps) {
  const [repeatCount, setRepeatCount] = useState(
    typeof initialValue === "number" ? String(initialValue) : "1"
  );
  const [untilStopped, setUntilStopped] = useState(initialValue === "until_stopped");

  useEffect(() => {
    if (visible) {
      if (initialValue === "until_stopped") {
        setUntilStopped(true);
        setRepeatCount("1");
      } else {
        setUntilStopped(false);
        setRepeatCount(String(initialValue));
      }
    }
  }, [visible, initialValue]);

  const handleConfirm = () => {
    if (untilStopped) {
      onConfirm("until_stopped");
    } else {
      const count = parseInt(repeatCount, 10);
      onConfirm(count > 0 ? count : 1);
    }
  };

  const handleCountChange = (text: string) => {
    // Only allow digits
    const cleaned = text.replace(/[^0-9]/g, "");
    setRepeatCount(cleaned);
  };

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

          {/* Custom repeat count input */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>Repeat count</Text>
            <TextInput
              style={[styles.input, untilStopped && styles.inputDisabled]}
              value={repeatCount}
              onChangeText={handleCountChange}
              keyboardType="number-pad"
              placeholder="1"
              placeholderTextColor="#9e9e9e"
              maxLength={3}
              editable={!untilStopped}
              selectTextOnFocus
            />
            <Text style={styles.inputSuffix}>times</Text>
          </View>

          {/* Until stopped toggle */}
          <TouchableOpacity
            style={styles.toggleRow}
            onPress={() => setUntilStopped(!untilStopped)}
            activeOpacity={0.7}
          >
            <Text style={styles.toggleLabel}>Until stopped</Text>
            <View style={[styles.checkbox, untilStopped && styles.checkboxChecked]}>
              {untilStopped && <Text style={styles.checkmark}>✓</Text>}
            </View>
          </TouchableOpacity>

          <View style={styles.actions}>
            <TouchableOpacity onPress={onCancel} style={styles.actionButton}>
              <Text style={styles.cancelText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleConfirm}
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
    marginBottom: 20,
  },
  inputSection: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: scaleFontSize(15),
    color: "#424242",
    marginRight: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: scaleFontSize(16),
    fontWeight: "600",
    color: "#212121",
    minWidth: 70,
    textAlign: "center",
  },
  inputDisabled: {
    backgroundColor: "#f5f5f5",
    color: "#9e9e9e",
  },
  inputSuffix: {
    fontSize: scaleFontSize(15),
    color: "#616161",
    marginLeft: 10,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  toggleLabel: {
    fontSize: scaleFontSize(15),
    color: "#424242",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#bdbdbd",
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: "#4285f4",
    borderColor: "#4285f4",
  },
  checkmark: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 16,
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
