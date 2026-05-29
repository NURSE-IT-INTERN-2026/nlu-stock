// Re-export enums from Prisma generated client — single source of truth
export { Category, ItemStatus, Role, AdjustmentReason, MaintenanceType, MaintenanceResult, UsageType } from "@/generated/prisma/enums";

export const CATEGORY_LABELS: Record<string, string> = {
  KRU: "ครุภัณฑ์",
  ELE: "อุปกรณ์อิเล็กทรอนิกส์",
  BOOK: "หนังสือ",
  TOY: "ของเล่น",
  DUR: "วัสดุคงทน",
  CON: "วัสดุสิ้นเปลือง",
  MED: "ยา",
  KIT: "อุปกรณ์ประกอบวิชา",
};

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