export const colors = {
  background: "#f8f9fa",
  card: "#FFFFFF",
  textPrimary: "#1A1A1A",
  textSecondary: "#6B6B6B",
  accent: "#3D8BFF",
  accentDark: "#2F6FE6",
  accentLight: "#EAF2FF",
  accentGradient: ["#3D8BFF", "#2F6FE6"] as [string, string],
  success: "#34C759",
  destructive: "#FF3B30",
  muted: "#E5E5E5",
  border: "#E0E0E0",
  overlay: "rgba(0, 0, 0, 0.5)",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const typography = {
  title: {
    fontSize: 28,
    fontWeight: "700" as const,
    color: colors.textPrimary,
  },
  heading: {
    fontSize: 20,
    fontWeight: "600" as const,
    color: colors.textPrimary,
  },
  body: {
    fontSize: 16,
    fontWeight: "400" as const,
    color: colors.textPrimary,
  },
  bodyBold: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: colors.textPrimary,
  },
  caption: {
    fontSize: 14,
    fontWeight: "400" as const,
    color: colors.textSecondary,
  },
  time: {
    fontSize: 24,
    fontWeight: "600" as const,
    color: colors.textPrimary,
  },
};

export const shadows = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  fab: {
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 9999,
};

export function scaleFontSize(fontSize: number): number {
  // Basic responsive scaling across different device widths (keeps RN fontScale behavior intact).
  // Tuned for phones; clamped to avoid huge jumps on tablets.
  // Base width chosen to match common mobile designs.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Dimensions } = require("react-native") as typeof import("react-native");
  const width = Dimensions.get("window").width;
  const baseWidth = 375;
  const raw = (fontSize * width) / baseWidth;
  const scaled = Math.round(raw);
  const min = Math.round(fontSize * 1.0);
  const max = Math.round(fontSize * 1.25);
  return Math.max(min, Math.min(max, scaled));
}
