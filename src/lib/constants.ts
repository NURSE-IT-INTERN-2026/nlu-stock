// Re-export enums from Prisma generated client — single source of truth
export { ItemStatus, AdjustmentReason, MaintenanceType, MaintenanceResult, UsageType } from "@/generated/prisma/enums";
import type { ItemStatus, AdjustmentReason, MaintenanceType, MaintenanceResult } from "@/generated/prisma/enums";
// Role is NOT a Prisma enum — it comes from env allowlists.
export { ROLES, ENV_ROLES, type Role, type EnvRole } from "@/lib/roles";
import type { Role } from "@/lib/roles";
import { BASE_PATH } from "@/lib/base-path";

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
  // นศ./บุคลากรคณะที่ผ่าน CMU OAuth แต่ไม่อยู่ใน env list ไหน — ยืมเองได้อย่างเดียว.
  // ป้ายบอกว่า "เป็นใคร" ไม่ใช่ "ทำอะไร" เหมือนอีกสามค่า — เจ้าหน้าที่ก็ยืม คำว่าผู้ยืม
  // จึงไม่ได้แยกใครออกจากใคร
  BORROWER: "นักศึกษา/บุคลากร",
};

// สีของ "บทบาท" คือสิ่งที่ต้องกวาดตาเจอในตารางผู้ใช้ — เรียงจากสิทธิ์มากไปน้อย และ ผู้ยืม
// เงียบที่สุดเพราะเป็นเกือบทุกแถวเมื่อทั้งคณะเริ่มล็อกอิน. -700 อ่านไม่ผ่าน AA บนพื้นมืด
// จึงต้องจับคู่ dark:-200 ทุกตัว
export const ROLE_BADGE: Record<Role, string> = {
  SUPERADMIN: "bg-primary/10 text-primary",
  ADMIN: "bg-info-500/10 text-info-700 dark:text-info-200",
  EXECUTIVE: "bg-warning/15 text-warning-700 dark:text-warning-200",
  BORROWER: "bg-muted text-muted-foreground",
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
// ซ่อม is its own pair of events, not a flavour of เปลี่ยนสถานะ / ซ่อมบำรุง: a repair trip is the
// thing staff look for in the history, and it reads the same whether the unit is a tracked piece
// (sub-item status log) or qty stock (a ชำรุด booking). REPAIR_RETURN also splits ซ่อมแซม
// (CORRECTIVE) out of บำรุงรักษา (PREVENTIVE) — same split the reports already make.
export type TimelineEventType =
  | "DISPENSE" | "INUSE" | "BORROW" | "RETURN" | "RECEIVE" | "ADJUSTMENT"
  | "DAMAGE_REPORT" | "REPAIR_SENT" | "REPAIR_RETURN"
  | "STATUS_CHANGE" | "MAINTENANCE" | "LOCATION_CHANGE";

export const EVENT_TYPE_LABELS: Record<TimelineEventType, string> = {
  DISPENSE: "เบิก",
  INUSE: "นำไปใช้งาน",
  BORROW: "ถูกยืม",
  RETURN: "รับคืน",
  RECEIVE: "รับเข้า",
  ADJUSTMENT: "ปรับสต๊อก",
  DAMAGE_REPORT: "แจ้งชำรุด",
  REPAIR_SENT: "ส่งซ่อม",
  // Not "รับคืน": RETURN above already owns that word, and two chips reading the same thing on
  // one timeline is exactly how a loan coming back and a repair coming back became one blur.
  REPAIR_RETURN: "รับคืนจากซ่อม",
  STATUS_CHANGE: "เปลี่ยนสถานะ",
  MAINTENANCE: "บำรุงรักษา",
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

/**
 * เหตุผล = สิ่งที่ของถูกเบิกไปทำ. There is no ผู้รับ field, and no ผู้รับ column anywhere in
 * the app any more: staff monitor stock by what it was used for, not by whose name is on it.
 *
 * The cart used to ask "ผู้รับ" on top of the usage block, and the two answers were the same
 * answer twice: a draw for รายวิชา is received by that course, a กิจกรรม by that activity, and
 * อื่นๆ already asks "เอาไปทำอะไร / ใครขอ". So the field is gone from the cart and every
 * เหตุผล label in the app is derived from the usage instead.
 *
 * `recipient` is still read first — the column stays for the rows written before this, where
 * someone deliberately typed a name. New rows leave it null and fall through to the usage.
 */
export function recipientLabel(r: {
  recipient?: string | null;
  usageType?: string | null;
  courseCode?: string | null;
  usageNote?: string | null;
  notes?: string | null;
}): string | null {
  if (r.recipient?.trim()) return r.recipient.trim();
  // รหัสวิชา + ชื่อวิชา snapshot — the code alone is not something anyone reads as a reason.
  if (r.usageType === "COURSE") {
    return [r.courseCode?.trim(), r.usageNote?.trim()].filter(Boolean).join(" ") || null;
  }
  // กิจกรรม / อื่นๆ write their line into usageNote too, so the reason lives in one column for
  // every usage type — that is what lets lib/usage-by-subject tell one activity from another.
  // `notes` stays as the fallback for rows written before that: their text is still the reason,
  // it just landed in the wrong column, and a migration to move it is not worth its own risk.
  return r.usageNote?.trim() || stripLegacyRoomNote(r.notes) || null;
}

/**
 * The course-name half of a "578101 การพยาบาลพื้นฐาน" label, for the callers that stack the
 * code on its own line instead of printing the label as one string.
 *
 * Lives beside recipientLabel because it is the inverse of the join a few lines up — split
 * anywhere else and the two drift the first time the separator changes. Returns the whole
 * label untouched when it does not start with the code, which is the recipient-wins case:
 * a typed name is not a course name with a code in front of it.
 */
export function courseNamePart(reason: string, courseCode: string): string {
  return reason.startsWith(courseCode) ? reason.slice(courseCode.length).trim() || courseCode : reason;
}

/**
 * นำไปใช้งาน used to fold the destination room into notes as "ห้องที่ตั้ง: X", back when
 * locationId could come back null (see item-detail-shell roomFromNotes, which still reads it
 * to place those rows). The dialog stopped writing it once INUSE required a real Location.
 *
 * Those rows now sit under เหตุผล, one column away from a สถานที่ that says the same room —
 * so the room half is dropped and only a genuine reason ("ยืมเล่นๆ | ห้องที่ตั้ง: …") survives.
 * A row that was nothing but the room reads "—", which is honest: nobody ever gave a reason.
 */
export function stripLegacyRoomNote(notes: string | null | undefined): string | null {
  if (!notes) return null;
  return notes
    .split("|")
    .filter((part) => !/^\s*ห้องที่ตั้ง\s*:/.test(part))
    .join("|")
    .trim() || null;
}

// ─── Adjustment Reason ───

export const ADJUSTMENT_REASON_LABELS: Record<AdjustmentReason, string> = {
  LOST: "สูญหาย",
  DAMAGED_PENDING_REPAIR: "ชำรุด",
  COUNT_MISMATCH_SHORT: "นับแล้วขาด",
  COUNT_MISMATCH_OVER: "นับแล้วเกิน",
  DISPOSAL: "ตัดจำหน่าย",
  ASSEMBLY: "ประกอบเป็นชุด",
  REPAIR_RETURN: "รับคืนจากซ่อม",
  DAMAGE_CANCELLED: "ยกเลิกคำขอชำรุด",
  OPENING_BALANCE: "ยอดตั้งต้นตอนขึ้นทะเบียน",
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
  PENDING_MAINTENANCE: "กำลังบำรุงรักษา",
  DAMAGED: "ชำรุด",
  UNDER_REPAIR: "ส่งซ่อม",
  LOST: "สูญหาย",
  DISPOSED: "ตัดจำหน่าย",
} satisfies Record<ItemStatus, string>;

export const STATUS_COLORS = {
  AVAILABLE: "#22c55e",
  ON_LOAN: "#3b82f6",
  IN_USE: "#6366f1",
  PENDING_MAINTENANCE: "#0ea5e9",
  DAMAGED: "#ef4444",
  UNDER_REPAIR: "#f59e0b",
  LOST: "#a855f7",
  DISPOSED: "#9ca3af",
} satisfies Record<ItemStatus, string>;

export const STATUS_PILLS = {
  AVAILABLE: "bg-success/15 text-success border-success/30",
  ON_LOAN: "bg-info-500/15 text-info-500 border-info-500/30",
  IN_USE: "bg-indigo-500/15 text-indigo-500 border-indigo-500/30",
  PENDING_MAINTENANCE: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
  DAMAGED: "bg-destructive/15 text-destructive border-destructive/30",
  UNDER_REPAIR: "bg-warning/15 text-warning-foreground border-warning/30",
  LOST: "bg-purple-500/15 text-purple-500 border-purple-500/30",
  DISPOSED: "bg-muted text-muted-foreground border-border",
} satisfies Record<ItemStatus, string>;

export const STATUS_VARIANTS = {
  AVAILABLE: "default",
  ON_LOAN: "secondary",
  IN_USE: "secondary",
  PENDING_MAINTENANCE: "secondary",
  DAMAGED: "destructive",
  UNDER_REPAIR: "secondary",
  LOST: "destructive",
  DISPOSED: "outline",
} satisfies Record<ItemStatus, "default" | "secondary" | "destructive" | "outline">;

/**
 * The statuses shown in the "สัดส่วนการใช้งาน" / สต็อกคงเหลือ breakdowns, in display order.
 * Every one of them renders even at count 0 — a missing row reads as "not applicable"
 * rather than "none", so the reader can tell an empty bucket from a bucket that does not
 * exist for this item.
 *
 * LOST/DISPOSED are absent because they are written off: not counted in the total, not
 * rendered. They still show in ประวัติสูญหาย and in the รายชิ้น legend below the breakdown.
 *
 * ถึงรอบบำรุงรักษายังไม่ใช่สถานะ: ของที่ถึงรอบยังพร้อมใช้งานอยู่ มันถูกชี้ด้วยวันที่
 * (Item/SubItem.nextMaintenanceDate) ที่หน้า /maintenance และ /alerts.
 * PENDING_MAINTENANCE คนละเรื่อง — มันไม่ได้แปลว่า "ถึงรอบ" แต่แปลว่า "ส่งออกไปบำรุงข้างนอกแล้ว
 * ยังไม่กลับมา" ซึ่งเป็นที่อยู่จริงของชิ้นนั้น เหมือน UNDER_REPAIR ทุกประการ จึงมีบักเก็ตของตัวเอง.
 */
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
  // The fallback needs BASE_PATH spelled out: origin alone drops the subpath the app is
  // served from, and a QR printed off that fallback would point at a 404.
  const base = process.env.NEXT_PUBLIC_APP_URL
    || (typeof window !== "undefined" ? window.location.origin + BASE_PATH : "");
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