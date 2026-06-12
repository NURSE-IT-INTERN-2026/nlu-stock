// Re-export enums from Prisma generated client — single source of truth
export { Category, ItemStatus, Role, AdjustmentReason, MaintenanceType, MaintenanceResult, UsageType } from "@/generated/prisma/enums";
import type { Category, ItemStatus, AdjustmentReason } from "@/generated/prisma/enums";

// ─── Category ───

export const CATEGORY_LABELS: Record<Category, string> = {
  KRU: "ครุภัณฑ์",
  ELE: "อุปกรณ์อิเล็กทรอนิกส์",
  BOOK: "หนังสือ",
  TOY: "ของเล่น",
  DUR: "วัสดุคงทน",
  CON: "วัสดุสิ้นเปลือง",
  MED: "ยา",
  KIT: "อุปกรณ์ประกอบวิชา",
};

export const CATEGORY_COLORS: Record<Category, string> = {
  CON: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  DUR: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  KRU: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  BOOK: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  ELE: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  TOY: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  MED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  KIT: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
};

// ─── Usage Type ───

export const USAGE_TYPE_LABELS: Record<string, string> = {
  COURSE: "รายวิชา",
  ACTIVITY: "กิจกรรม",
  OTHER: "อื่นๆ",
};

export const USAGE_TYPE_OPTIONS = [
  { value: "COURSE", label: "รายวิชา" },
  { value: "ACTIVITY", label: "กิจกรรม" },
  { value: "OTHER", label: "อื่นๆ" },
] as const;

// ─── Adjustment Reason ───

export const ADJUSTMENT_REASON_LABELS: Record<AdjustmentReason, string> = {
  LOST: "Lost",
  DAMAGED_PENDING_REPAIR: "Damaged (pending repair)",
  COUNT_MISMATCH: "Count mismatch",
  DISPOSAL: "Disposal",
  OTHER: "Other",
};

export const ADJUSTMENT_REASON_OPTIONS = Object.entries(ADJUSTMENT_REASON_LABELS)
  .map(([value, label]) => ({ value, label })) as { value: AdjustmentReason; label: string }[];

// ─── Item Status (damage reporting subset) ───

export const DAMAGE_STATUS_OPTIONS: { value: ItemStatus; label: string }[] = [
  { value: "DAMAGED", label: "Damaged" },
  { value: "UNDER_REPAIR", label: "Under Repair" },
  { value: "LOST", label: "Lost" },
  { value: "DISPOSED", label: "Disposed" },
];

export const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "พร้อมใช้",
  CHECKED_OUT: "เบิกแล้ว",
  DAMAGED: "ชำรุด",
  UNDER_REPAIR: "ซ่อมบำรุง",
  LOST: "สูญหาย",
  PENDING_MAINTENANCE: "รอบำรุง",
  DISPOSED: "จำหน่าย",
};

export const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: "#22c55e",
  CHECKED_OUT: "#3b82f6",
  DAMAGED: "#ef4444",
  UNDER_REPAIR: "#f59e0b",
  LOST: "#a855f7",
  PENDING_MAINTENANCE: "#06b6d4",
  DISPOSED: "#9ca3af",
};

export const STATUS_PILLS: Record<string, string> = {
  AVAILABLE: "bg-success/15 text-success border-success/30",
  CHECKED_OUT: "bg-info-500/15 text-info-500 border-info-500/30",
  DAMAGED: "bg-destructive/15 text-destructive border-destructive/30",
  UNDER_REPAIR: "bg-warning/15 text-warning-foreground border-warning/30",
  LOST: "bg-purple-500/15 text-purple-500 border-purple-500/30",
  DISPOSED: "bg-muted text-muted-foreground border-border",
  PENDING_MAINTENANCE: "bg-cyan-500/15 text-cyan-600 border-cyan-500/30",
};

export const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  AVAILABLE: "default",
  CHECKED_OUT: "secondary",
  DAMAGED: "destructive",
  UNDER_REPAIR: "secondary",
  LOST: "destructive",
  DISPOSED: "outline",
  PENDING_MAINTENANCE: "secondary",
};

export const STATUS_CHIPS = [
  { value: "AVAILABLE", label: "พร้อมใช้", color: "bg-success/15 text-success hover:bg-success/25 border-success/30" },
  { value: "CHECKED_OUT", label: "เบิกแล้ว", color: "bg-info-500/15 text-info-500 hover:bg-info-500/25 border-info-500/30" },
  { value: "DAMAGED", label: "ชำรุด", color: "bg-destructive/15 text-destructive hover:bg-destructive/25 border-destructive/30" },
  { value: "UNDER_REPAIR", label: "ซ่อมบำรุง", color: "bg-warning/15 text-warning-foreground hover:bg-warning/25 border-warning/30" },
  { value: "LOST", label: "สูญหาย", color: "bg-purple-500/15 text-purple-500 hover:bg-purple-500/25 border-purple-500/30" },
  { value: "DISPOSED", label: "จำหน่าย", color: "bg-muted text-muted-foreground hover:bg-muted/80 border-border" },
  { value: "PENDING_MAINTENANCE", label: "รอบำรุง", color: "bg-cyan-500/15 text-cyan-600 hover:bg-cyan-500/25 border-cyan-500/30" },
] as const;

// ─── Location label helper ───

export function locationLabel(loc: { building: string; floor: string; room: string; detail?: string | null }) {
  return [loc.building, loc.floor, loc.room, loc.detail].filter(Boolean).join(" / ");
}