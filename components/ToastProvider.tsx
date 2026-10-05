import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "../lib/theme";

type ToastType = "success" | "error" | "info" | "warning";

type ToastOptions = {
  title: string;
  message?: string;
  type?: ToastType;
  durationMs?: number;
  onPress?: () => void;
  /** A short label at the toast's right edge naming what a tap does ("Not right?"). */
  actionLabel?: string;
};

type ToastState = {
  title: string;
  message?: string;
  type: ToastType;
  onPress?: () => void;
  actionLabel?: string;
};

type ToastContextValue = {
  show: (options: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used within ToastProvider");
  return value;
}

function getToastAccent(type: ToastType): string {
  if (type === "success") return colors.statusUpcoming;
  if (type === "error") return colors.statusOverdue;
  if (type === "warning") return "#f59e0b"; // Amber-500
  return colors.accent;
}

export default function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastState | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translateY = useRef(new Animated.Value(-30)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const hide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: -30,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setToast(null);
    });
  }, [opacity, translateY]);

  const show = useCallback(
    ({ title, message, type = "info", durationMs = 2200, onPress, actionLabel }: ToastOptions) => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }

      setToast({ title, message, type, onPress, actionLabel });
      opacity.setValue(0);
      translateY.setValue(-30);

      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          speed: 22,
          bounciness: 6,
        }),
      ]).start();

      hideTimerRef.current = setTimeout(() => {
        hide();
      }, durationMs);
    },
    [hide, opacity, translateY]
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.host,
            { top: insets.top + 10, opacity, transform: [{ translateY }] },
          ]}
        >
          <Pressable
            onPress={() => {
              toast.onPress?.();
              hide();
            }}
            style={[
              styles.toast,
              !!toast.actionLabel && styles.toastWithAction,
              { borderLeftColor: getToastAccent(toast.type) },
            ]}
          >
            <View style={styles.body}>
              <Text style={styles.title}>{toast.title}</Text>
              {!!toast.message && (
                <Text style={styles.message} numberOfLines={2}>
                  {toast.message}
                </Text>
              )}
            </View>
            {!!toast.actionLabel && (
              <View style={styles.action} testID="toast-action">
                <Text style={styles.actionText}>{toast.actionLabel}</Text>
              </View>
            )}
          </Pressable>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: spacing.md,
    zIndex: 999,
  },
  toast: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  toastWithAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  body: {
    flexShrink: 1,
    flexGrow: 1,
  },
  action: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionText: {
    color: colors.textHeading,
    fontWeight: "600",
    fontSize: 13,
  },
  title: {
    color: colors.textHeading,
    fontWeight: "600",
    fontSize: 15,
  },
  message: {
    marginTop: 4,
    color: colors.textSecondary,
    fontWeight: "400",
    fontSize: 13,
  },
});
