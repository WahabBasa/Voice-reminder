import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "../lib/theme";

type ToastType = "success" | "error" | "info";

type ToastOptions = {
  title: string;
  message?: string;
  type?: ToastType;
  durationMs?: number;
};

type ToastState = {
  title: string;
  message?: string;
  type: ToastType;
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
    ({ title, message, type = "info", durationMs = 2200 }: ToastOptions) => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }

      setToast({ title, message, type });
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
            onPress={hide}
            style={[styles.toast, { borderLeftColor: getToastAccent(toast.type) }]}
          >
            <Text style={styles.title}>{toast.title}</Text>
            {!!toast.message && (
              <Text style={styles.message} numberOfLines={2}>
                {toast.message}
              </Text>
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
  title: {
    color: colors.textHeading,
    fontWeight: "700",
    fontSize: 15,
  },
  message: {
    marginTop: 4,
    color: colors.textSecondary,
    fontWeight: "500",
    fontSize: 13,
  },
});
