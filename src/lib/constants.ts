// Re-export enums from Prisma generated client — single source of truth
export { ItemStatus, Role, AdjustmentReason, MaintenanceType, MaintenanceResult, UsageType } from "@/generated/prisma/enums";
import type { ItemStatus, AdjustmentReason, Role, MaintenanceType, MaintenanceResult } from "@/generated/prisma/enums";

// ─── Item Condition (sub-item สภาพ) ───
export const CONDITION_LABELS: Record<string, string> = {
  NEW: "ใหม่",
  OLD: "เก่า",
  USABLE: "ใช้งานได้",
  FAIR: "สภาพพอใช้",
  UNUSABLE: "ใช้งานไม่ได้",
  DAMAGED: "ชำรุด",
};

// ─── Role ───
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "ผู้ดูแล",
  STAFF: "เจ้าหน้าที่",
  INSTRUCTOR: "ผู้สอน",
  CHILDREN: "นักศึกษา",
};

// ─── Maintenance ───
export const MAINT_TYPE_LABELS: Record<MaintenanceType, string> = {
  PREVENTIVE: "ตรวจบำรุง",
  CORRECTIVE: "ซ่อมแซม",
};

export const MAINT_RESULT_LABELS: Record<MaintenanceResult, string> = {
  AVAILABLE: "พร้อมใช้งาน",
  NEEDS_MORE_REPAIR: "ต้องซ่อมเพิ่ม",
  DISPOSED: "ตัดจำหน่าย",
};

// ─── Timeline event type ───
export type TimelineEventType =
  | "DISPENSE" | "RECEIVE" | "ADJUSTMENT"
  | "STATUS_CHANGE" | "MAINTENANCE" | "LOCATION_CHANGE";

export const EVENT_TYPE_LABELS: Record<TimelineEventType, string> = {
  DISPENSE: "เบิก",
  RECEIVE: "รับเข้า",
  ADJUSTMENT: "ปรับสต๊อก",
  STATUS_CHANGE: "เปลี่ยนสถานะ",
  MAINTENANCE: "บำรุงรักษา",
  LOCATION_CHANGE: "ที่ตั้ง",
};

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
  ASSEMBLY: "ประกอบเป็นชุด",
  OTHER: "อื่นๆ",
};

export const ADJUSTMENT_REASON_OPTIONS = Object.entries(ADJUSTMENT_REASON_LABELS)
  .map(([value, label]) => ({ value, label })) as { value: AdjustmentReason; label: string }[];

export const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "พร้อมใช้งาน",
  ON_LOAN: "ถูกยืม",
  IN_USE: "ถูกใช้งาน",
  DAMAGED: "ชำรุด",
  UNDER_REPAIR: "ส่งซ่อม",
  LOST: "สูญหาย",
  PENDING_MAINTENANCE: "บำรุงรักษา",
  DISPOSED: "ตัดจำหน่าย",
};

// Target statuses offered when adjusting a tracked (per-piece) item via the adjust dialog.
export const TRACKED_ADJUST_STATUS_OPTIONS: { value: ItemStatus; label: string }[] = (
  ["LOST", "DISPOSED"] as ItemStatus[]
).map((value) => ({ value, label: STATUS_LABELS[value] }));

export const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: "#22c55e",
  ON_LOAN: "#3b82f6",
  IN_USE: "#6366f1",
  DAMAGED: "#ef4444",
  UNDER_REPAIR: "#f59e0b",
  LOST: "#a855f7",
  PENDING_MAINTENANCE: "#06b6d4",
  DISPOSED: "#9ca3af",
};

export const STATUS_PILLS: Record<string, string> = {
  AVAILABLE: "bg-success/15 text-success border-success/30",
  ON_LOAN: "bg-info-500/15 text-info-500 border-info-500/30",
  IN_USE: "bg-indigo-500/15 text-indigo-500 border-indigo-500/30",
  DAMAGED: "bg-destructive/15 text-destructive border-destructive/30",
  UNDER_REPAIR: "bg-warning/15 text-warning-foreground border-warning/30",
  LOST: "bg-purple-500/15 text-purple-500 border-purple-500/30",
  DISPOSED: "bg-muted text-muted-foreground border-border",
  PENDING_MAINTENANCE: "bg-cyan-500/15 text-cyan-600 border-cyan-500/30",
};

export const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  AVAILABLE: "default",
  ON_LOAN: "secondary",
  IN_USE: "secondary",
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

// ─── Label lookup helper ───
// Type-safe over E: the map must be exhaustive (Record<E, string>) so a missing
// member errors at compile time, and `key` is typed E so a typo'd enum at the
// call site is caught. When the source value is a plain `string` (e.g. API JSON),
// cast at the boundary: labelFor(ROLE_LABELS, user.role as Role).
export function labelFor<E extends string>(map: Record<E, string>, key: E): string {
  return map[key] ?? key;
}