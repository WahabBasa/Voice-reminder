import type { ComponentType } from "react";
import {
  ArrowLeft,
  Bell,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleX,
  Clock,
  FileText,
  Info,
  Mic,
  MoreVertical,
  Pause,
  Play,
  RefreshCw,
  Settings,
  Square,
  Sun,
  Trash2,
  Volume1,
  Volume2,
  WifiOff,
  X,
  Zap,
  Crown,
} from "lucide-react-native";
import { colors } from "../lib/theme";

type BaseIconProps = {
  color?: string;
  size?: string | number;
  strokeWidth?: string | number;
  style?: any;
};

export type AppIconName =
  | "arrow-left"
  | "bell"
  | "calendar"
  | "check"
  | "check-circle"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "clock"
  | "file-text"
  | "info"
  | "mic"
  | "more-vertical"
  | "pause"
  | "play"
  | "refresh-cw"
  | "settings"
  | "square"
  | "sun"
  | "trash-2"
  | "volume-1"
  | "volume-2"
  | "wifi-off"
  | "x"
  | "x-circle"
  | "zap"
  | "crown";

const iconByName: Record<AppIconName, ComponentType<BaseIconProps>> = {
  "arrow-left": ArrowLeft,
  bell: Bell,
  calendar: Calendar,
  check: Check,
  "check-circle": CircleCheck,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  clock: Clock,
  "file-text": FileText,
  info: Info,
  mic: Mic,
  "more-vertical": MoreVertical,
  pause: Pause,
  play: Play,
  "refresh-cw": RefreshCw,
  settings: Settings,
  square: Square,
  sun: Sun,
  "trash-2": Trash2,
  "volume-1": Volume1,
  "volume-2": Volume2,
  "wifi-off": WifiOff,
  x: X,
  "x-circle": CircleX,
  zap: Zap,
  crown: Crown,
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
