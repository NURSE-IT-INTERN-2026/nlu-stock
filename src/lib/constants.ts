// Re-export enums from Prisma generated client — single source of truth
export { ItemStatus, AdjustmentReason, MaintenanceType, MaintenanceResult, UsageType } from "@/generated/prisma/enums";
import type { ItemStatus, AdjustmentReason, MaintenanceType, MaintenanceResult } from "@/generated/prisma/enums";
// Role is NOT a Prisma enum — it comes from env allowlists.
export { ROLES, type Role } from "@/lib/roles";
import type { Role } from "@/lib/roles";

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
  SUPERADMIN: "ผู้ดูแลระบบ",
  ADMIN: "ผู้ดูแล",
  EXECUTIVE: "ผู้บริหาร",
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
// One DispenseRecord is three different real events depending on the item's dispenseType
// and loanType, so they get three separate types here — calling all of them "เบิก" told a
// reader nothing about whether the stock is coming back.
export type TimelineEventType =
  | "DISPENSE" | "INUSE" | "BORROW" | "RETURN" | "RECEIVE" | "ADJUSTMENT"
  | "STATUS_CHANGE" | "MAINTENANCE" | "LOCATION_CHANGE";

export const EVENT_TYPE_LABELS: Record<TimelineEventType, string> = {
  DISPENSE: "เบิก",
  INUSE: "นำไปใช้งาน",
  BORROW: "ถูกยืม",
  RETURN: "รับคืน",
  RECEIVE: "รับเข้า",
  ADJUSTMENT: "ปรับสต๊อก",
  STATUS_CHANGE: "เปลี่ยนสถานะ",
  MAINTENANCE: "ซ่อมบำรุง",
  LOCATION_CHANGE: "ย้ายที่ตั้ง",
};

export const RETURN_CONDITION_LABELS: Record<string, string> = {
  AVAILABLE: "ปกติ",
  DAMAGED: "ชำรุด",
  LOST: "สูญหาย",
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

// OTHER requires the free-text line in the cart dialog, so it never lands as a bare
// "อื่นๆ" with nothing behind it.
export const USAGE_TYPE_OPTIONS = [
  { value: "COURSE", label: "รายวิชา" },
  { value: "ACTIVITY", label: "กิจกรรม" },
  { value: "OTHER", label: "อื่นๆ" },
] as const;

// ─── Adjustment Reason ───

export const ADJUSTMENT_REASON_LABELS: Record<AdjustmentReason, string> = {
  LOST: "สูญหาย",
  DAMAGED_PENDING_REPAIR: "เสียหาย/ชำรุด",
  COUNT_MISMATCH_SHORT: "นับแล้วขาด",
  COUNT_MISMATCH_OVER: "นับแล้วเกิน",
  DISPOSAL: "ตัดจำหน่าย",
  ASSEMBLY: "ประกอบเป็นชุด",
  OTHER: "อื่นๆ",
};

// What the staff member is DOING, picked first in the adjust dialog — the choice
// decides how qty is entered: STOCK_COUNT asks for the counted total (absolute,
// stamps the count cycle), every other mode asks how many pieces leave the shelf
// (relative), because "ทิ้งขวดหมดอายุ 3 ขวด" should not require doing 50-3 in your head.
// Excluded from the list (still in the enum for history/other flows):
//   ASSEMBLY — system-driven (kit assembly in api/kits)
//   DAMAGED_PENDING_REPAIR — entered via the "แจ้งชำรุด" tile (fixedReason)
//   COUNT_MISMATCH_SHORT/OVER — server-assigned from a count's delta, never picked by hand
//   OTHER — "แก้ยอดให้ตรงความจริง" is what ตรวจนับตามรอบ already does, and it does it
//     better: a count moves the number in either direction, while every other mode can
//     only subtract. Knowing the true shelf figure means someone looked at the shelf,
//     so recording it as a count is honest, not a workaround.
export const STOCK_COUNT_MODE = "STOCK_COUNT";
export const ADJUST_MODE_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: STOCK_COUNT_MODE, label: "ตรวจนับตามรอบ", hint: "กรอกยอดที่นับได้จริง — ระบบเทียบกับยอดในระบบให้" },
  { value: "DISPOSAL", label: "ตัดจำหน่าย", hint: "ของหมดอายุ/ใช้ไม่ได้ ทิ้งออกจากระบบ" },
  { value: "LOST", label: "สูญหาย", hint: "หาไม่เจอ ไม่ทราบสาเหตุ" },
];

// Reasons a short count can carry — default LOST, but stock thrown away between
// counts is DISPOSAL, not missing stock. This list answers "why", so it holds no
// "อื่นๆ": the shortfall itself is already known from the delta, and an option that
// only repeats it adds nothing. Staff who cannot tell yet still have to pick one —
// the dialog requires a note on a short count so the doubt is written down.
export const COUNT_SHORT_REASON_OPTIONS: { value: string; label: string }[] = [
  { value: "LOST", label: "สูญหาย" },
  { value: "DISPOSAL", label: "ตัดจำหน่าย (ทิ้งไปแล้ว)" },
];

export const STATUS_LABELS = {
  AVAILABLE: "พร้อมใช้งาน",
  ON_LOAN: "ถูกยืม",
  IN_USE: "ถูกใช้งาน",
  DAMAGED: "ชำรุด",
  UNDER_REPAIR: "ส่งซ่อม",
  LOST: "สูญหาย",
  PENDING_MAINTENANCE: "บำรุงรักษา",
  DISPOSED: "ตัดจำหน่าย",
} satisfies Record<ItemStatus, string>;

export const STATUS_COLORS = {
  AVAILABLE: "#22c55e",
  ON_LOAN: "#3b82f6",
  IN_USE: "#6366f1",
  DAMAGED: "#ef4444",
  UNDER_REPAIR: "#f59e0b",
  LOST: "#a855f7",
  PENDING_MAINTENANCE: "#06b6d4",
  DISPOSED: "#9ca3af",
} satisfies Record<ItemStatus, string>;

export const STATUS_PILLS = {
  AVAILABLE: "bg-success/15 text-success border-success/30",
  ON_LOAN: "bg-info-500/15 text-info-500 border-info-500/30",
  IN_USE: "bg-indigo-500/15 text-indigo-500 border-indigo-500/30",
  DAMAGED: "bg-destructive/15 text-destructive border-destructive/30",
  UNDER_REPAIR: "bg-warning/15 text-warning-foreground border-warning/30",
  LOST: "bg-purple-500/15 text-purple-500 border-purple-500/30",
  DISPOSED: "bg-muted text-muted-foreground border-border",
  PENDING_MAINTENANCE: "bg-cyan-500/15 text-cyan-600 border-cyan-500/30",
} satisfies Record<ItemStatus, string>;

export const STATUS_VARIANTS = {
  AVAILABLE: "default",
  ON_LOAN: "secondary",
  IN_USE: "secondary",
  DAMAGED: "destructive",
  UNDER_REPAIR: "secondary",
  LOST: "destructive",
  DISPOSED: "outline",
  PENDING_MAINTENANCE: "secondary",
} satisfies Record<ItemStatus, "default" | "secondary" | "destructive" | "outline">;

// The six statuses shown in the "สัดส่วนการใช้งาน" breakdown. LOST/DISPOSED are written
// off — never counted, never rendered. Every one of the six renders even at count 0.
export const USAGE_STATUS_ORDER = ["AVAILABLE", "ON_LOAN", "IN_USE", "PENDING_MAINTENANCE", "UNDER_REPAIR", "DAMAGED"] as const;

// Non-tracked items (consumable / COUNT durable) have no per-unit lifecycle status —
// their stock state derives from available/total. COUNT (ยืม-คืน) has a middle "on loan"
// band; consumables only deplete (no borrowing) so they're binary. Used by the item
// detail headline + master list pill. Tracked items keep the ItemStatus enum.
export type NonTrackedStockKey = "AVAILABLE" | "ON_LOAN" | "OUT";

export const NON_TRACKED_STOCK_LABELS: Record<NonTrackedStockKey, string> = {
  AVAILABLE: "พร้อมใช้งาน",
  ON_LOAN: "ถูกยืม",
  // "หมด" everywhere — the breadcrumb chip already said หมด while the card said
  // ไม่พร้อมใช้งาน for the same state. One word for one thing.
  OUT: "หมด",
};

export const NON_TRACKED_STOCK_PILLS: Record<NonTrackedStockKey, string> = {
  AVAILABLE: STATUS_PILLS.AVAILABLE,
  ON_LOAN: STATUS_PILLS.ON_LOAN,
  OUT: "bg-destructive/15 text-destructive border-destructive/30",
};

export function nonTrackedStockKey(
  dispenseType: "CONSUMABLE" | "COUNT" | "ITEM",
  available: number,
  total: number,
): NonTrackedStockKey {
  if (available <= 0) return "OUT";
  if (dispenseType !== "CONSUMABLE" && available < total) return "ON_LOAN";
  return "AVAILABLE";
}

// Status pill {cls, label} for a list row. Tracked → ItemStatus enum pill;
// non-tracked → a manually set lifecycle status if there is one (recompute keeps it),
// otherwise the derived stock state via nonTrackedStockKey. Shared by the master
// tab + inventory list so the two stay consistent.
export function statusDisplay(item: {
  trackIndividually: boolean;
  status: ItemStatus;
  availableQty: number;
  totalQty: number;
  category: { profile?: { dispenseType?: "CONSUMABLE" | "COUNT" | "ITEM" } | null };
}): { cls: string; label: string } {
  if (!item.trackIndividually) {
    if (item.status !== "AVAILABLE" && item.status !== "ON_LOAN") {
      return { cls: STATUS_PILLS[item.status] || "bg-muted text-muted-foreground border-border", label: STATUS_LABELS[item.status] ?? item.status.replace(/_/g, " ") };
    }
    const key = nonTrackedStockKey(item.category.profile?.dispenseType ?? "COUNT", item.availableQty, item.totalQty);
    return { cls: NON_TRACKED_STOCK_PILLS[key], label: NON_TRACKED_STOCK_LABELS[key] };
  }
  return { cls: STATUS_PILLS[item.status] || "bg-muted text-muted-foreground border-border", label: STATUS_LABELS[item.status] ?? item.status.replace(/_/g, " ") };
}

// ─── Location label helper ───

export function locationLabel(loc: { building: string; floor: string; room: string; detail?: string | null }) {
  return [loc.building, loc.floor, loc.room, loc.detail].filter(Boolean).join(" / ");
}

// ─── Sub-code helper ───
// subCode may be stored as suffix ("C01") or full ("ITM001-01"); show full, avoid doubling prefix.
export function formatSubCode(itemCode: string, subCode: string): string {
  return subCode.startsWith(itemCode) ? subCode : `${itemCode}-${subCode}`;
}

// ─── QR payload helpers ───
// Printed QR encodes an absolute URL so an external scanner (iPhone Camera etc.)
// opens the item page directly. /items/[id] already resolves by code, and the
// detail shell already honours ?copy=<subCode>, so no resolver route is needed.

export function qrUrl(itemCode: string, subCode?: string | null): string {
  const base = process.env.NEXT_PUBLIC_APP_URL
    || (typeof window !== "undefined" ? window.location.origin : "");
  const q = subCode ? `?copy=${encodeURIComponent(subCode)}` : "";
  return `${base}/items/${encodeURIComponent(itemCode)}${q}`;
}

// Scanned string → { code, copy }. Accepts the new URL payload and legacy
// bare-code labels already printed and stuck on shelves.
export function parseScannedCode(raw: string): { code: string; copy?: string } {
  const s = raw.trim();
  if (!/^https?:\/\//i.test(s)) return { code: s };
  try {
    const u = new URL(s);
    const last = u.pathname.split("/").filter(Boolean).pop() ?? "";
    return { code: decodeURIComponent(last), copy: u.searchParams.get("copy") || undefined };
  } catch {
    return { code: s };
  }
}

/**
 * Display code for a tracked item's piece. Per the single-copy rule:
 * 1 copy → base code (the single piece IS the item); ≥2 copies → itemCode-subCode.
 * `subCount` = number of sub-items on the parent item. Pass the count you have in
 * scope (item.subItems.length, item._count.subItems, etc.).
 */
export function effectiveCode(itemCode: string, subCode: string | null | undefined, subCount: number): string {
  if (!subCode || subCount <= 1) return itemCode;
  return formatSubCode(itemCode, subCode);
}

// ─── Label lookup helper ───
// Type-safe over E: the map must be exhaustive (Record<E, string>) so a missing
// member errors at compile time, and `key` is typed E so a typo'd enum at the
// call site is caught. When the source value is a plain `string` (e.g. API JSON),
// cast at the boundary: labelFor(ROLE_LABELS, user.role as Role).
export function labelFor<E extends string>(map: Record<E, string>, key: E): string {
  return map[key] ?? key;
}