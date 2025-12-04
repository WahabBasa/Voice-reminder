export const colors = {
  background: "#FAFAFA",
  card: "#FFFFFF",
  textPrimary: "#1A1A1A",
  textSecondary: "#6B6B6B",
  accent: "#4A90D9",
  accentLight: "#E8F1FA",
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
