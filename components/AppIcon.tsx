import type { ComponentType } from "react";
import {
  Bell,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleX,
  Clock,
  Info,
  Mic,
  Pause,
  Play,
  RefreshCw,
  Settings,
  Square,
  Sun,
  Trash2,
  Volume1,
  Volume2,
  X,
  Zap,
} from "lucide-react-native";
import { colors } from "../lib/theme";

type BaseIconProps = {
  color?: string;
  size?: string | number;
  strokeWidth?: string | number;
  style?: any;
};

export type AppIconName =
  | "bell"
  | "calendar"
  | "check"
  | "check-circle"
  | "chevron-left"
  | "chevron-right"
  | "clock"
  | "info"
  | "mic"
  | "pause"
  | "play"
  | "refresh-cw"
  | "settings"
  | "square"
  | "sun"
  | "trash-2"
  | "volume-1"
  | "volume-2"
  | "x"
  | "x-circle"
  | "zap";

const iconByName: Record<AppIconName, ComponentType<BaseIconProps>> = {
  bell: Bell,
  calendar: Calendar,
  check: Check,
  "check-circle": CircleCheck,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  clock: Clock,
  info: Info,
  mic: Mic,
  pause: Pause,
  play: Play,
  "refresh-cw": RefreshCw,
  settings: Settings,
  square: Square,
  sun: Sun,
  "trash-2": Trash2,
  "volume-1": Volume1,
  "volume-2": Volume2,
  x: X,
  "x-circle": CircleX,
  zap: Zap,
};

type AppIconProps = {
  name: AppIconName;
  color?: string;
  size?: number;
  strokeWidth?: number;
  style?: any;
};

export default function AppIcon({
  name,
  size = 20,
  color = colors.textSecondary,
  strokeWidth = 2.25,
  style,
}: AppIconProps) {
  const Icon = iconByName[name];
  return <Icon size={size} color={color} strokeWidth={strokeWidth} style={style} />;
}
