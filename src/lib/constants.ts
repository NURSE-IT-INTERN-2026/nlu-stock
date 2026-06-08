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

export const STATUS_PILLS: Record<string, string> = {
  AVAILABLE: "bg-emerald-100 text-emerald-800 border-emerald-200",
  CHECKED_OUT: "bg-blue-100 text-blue-800 border-blue-200",
  DAMAGED: "bg-red-100 text-red-800 border-red-200",
  UNDER_REPAIR: "bg-amber-100 text-amber-800 border-amber-200",
  LOST: "bg-gray-100 text-gray-700 border-gray-200",
  DISPOSED: "bg-gray-200 text-gray-800 border-gray-300",
  PENDING_MAINTENANCE: "bg-amber-100 text-amber-800 border-amber-200",
};

// ─── Location label helper ───

export function locationLabel(loc: { building: string; floor: string; room: string; detail?: string | null }) {
  return [loc.building, loc.floor, loc.room, loc.detail].filter(Boolean).join(" / ");
}