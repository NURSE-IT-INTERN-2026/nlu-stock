// Re-export enums from Prisma generated client — single source of truth
export { ItemStatus, Role, AdjustmentReason, MaintenanceType, MaintenanceResult, UsageType } from "@/generated/prisma/enums";
import type { ItemStatus, AdjustmentReason } from "@/generated/prisma/enums";

// ─── Category ───
// NOTE: ประเภท (CategoryProfile) เป็น data แล้ว — label/color/icon อ่านจาก profile row ตรงๆ
// (profile.name, profile.color, profile.icon). ไม่มี CATEGORY_LABELS/COLORS map อีก.
// Icon name → component registry อยู่ใน src/lib/profile-icons.ts

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
  LOST: "สูญหาย",
  DAMAGED_PENDING_REPAIR: "เสียหาย (รอซ่อม)",
  COUNT_MISMATCH_SHORT: "นับแล้วขาด",
  COUNT_MISMATCH_OVER: "นับแล้วเกิน",
  DISPOSAL: "กำจัด (พ้นสภาพ)",
  OTHER: "อื่นๆ",
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

// Target statuses offered when adjusting a tracked (per-piece) item via the adjust dialog.
export const TRACKED_ADJUST_STATUS_OPTIONS: { value: ItemStatus; label: string }[] = (
  ["LOST", "DAMAGED", "DISPOSED", "UNDER_REPAIR"] as ItemStatus[]
).map((value) => ({ value, label: STATUS_LABELS[value] }));

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

// ─── Location label helper ───

export function locationLabel(loc: { building: string; floor: string; room: string; detail?: string | null }) {
  return [loc.building, loc.floor, loc.room, loc.detail].filter(Boolean).join(" / ");
}

// ─── Sub-code helper ───
// subCode may be stored as suffix ("C01") or full ("ITM001-01"); show full, avoid doubling prefix.
export function formatSubCode(itemCode: string, subCode: string): string {
  return subCode.startsWith(itemCode) ? subCode : `${itemCode}-${subCode}`;
}