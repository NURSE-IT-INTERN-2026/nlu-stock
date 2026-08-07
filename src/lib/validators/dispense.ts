import { z } from "zod";

// ponytail: plain type — cartItemSchema was never parsed at runtime (the cart is built
// client-side), only the inferred type was consumed. Matches the old z.infer shape exactly.
export interface CartItem {
  itemId: string;
  itemCode: string;
  itemName: string;
  categoryName: string;
  dispenseType: "CONSUMABLE" | "COUNT" | "ITEM";
  trackIndividually: boolean;
  issueUnit: string;
  quantity: number;
  lotId?: string | null;
  lotNumber?: string | null;
  subItemId?: string | null;
  subCode?: string | null;
  availableQty: number;
  imageUrl?: string | null;
  location?: { building: string; floor: string; room: string; detail: string | null } | null;
  lots: { id: string; lotNumber: string; expiryDate: string | null; quantity: number }[];
  subItems: { id: string; subCode: string; condition?: string | null }[];
}

export const dispenseRequestSchema = z.object({
  items: z.array(z.object({
    itemId: z.string().min(1),
    subItemId: z.string().optional().nullable(),
    lotId: z.string().optional().nullable(),
    quantity: z.number().int().min(1),
  })).min(1, "At least one item required"),
  usageType: z.enum(["COURSE", "ACTIVITY", "OTHER"]).optional().nullable(),
  // COURSE only: the CMU รหัสวิชา, with the course name snapshotted into usageNote.
  courseCode: z.string().max(50).optional().nullable(),
  usageNote: z.string().max(500).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  recipient: z.string().max(255).optional().nullable(),
  // นำไปใช้งาน (INUSE) only — the room the stock was placed in. Required for INUSE
  // (see the refine below); ignored for เบิก/ยืม, which don't move an item's home.
  locationId: z.string().optional().nullable(),
  dueAt: z.string().optional().nullable(), // "YYYY-MM-DD" from <input type="date">, one per borrow
  // ponytail: per-dispense flag, not a DB column — API flips trackIndividually sub-item status to
  // ON_LOAN (ยืม, default) or IN_USE (ตั้งใช้ในห้อง). Ignored for CONSUMABLE/COUNT.
  loanType: z.enum(["BORROW", "INUSE"]).optional().nullable(),
})
  // กิจกรรม and อื่นๆ are only labels — the free-text line is what a reader of the history
  // actually learns from, so neither may be filed without it. Enforced here rather than in
  // the dialog alone: a bare "อื่นๆ" record explains nothing no matter which client wrote it.
  .refine(
    (d) => !(d.usageType === "ACTIVITY" || d.usageType === "OTHER") || !!d.notes?.trim(),
    { path: ["notes"], message: "ระบุรายละเอียดการนำไปใช้" },
  )
  // Same reasoning one refine up: "รายวิชา" on its own tells a reader of the history
  // nothing, and the report cannot split by course without the code. Enforced server-side
  // because the dialog's guard only binds the one client that happens to have it.
  .refine(
    (d) => d.usageType !== "COURSE" || !!d.courseCode?.trim(),
    { path: ["courseCode"], message: "เลือกรายวิชา" },
  )
  // นำไปใช้งาน moves stock to a room, so the room is the whole point of the record — an
  // INUSE row without one is stock the system has lost track of. The picker already
  // restricts to existing locations, but that guard is client-side: rows written before
  // it existed have locationId NULL and only a free-text room in notes ("asad", "mnmn").
  .refine(
    (d) => d.loanType !== "INUSE" || !!d.locationId,
    { path: ["locationId"], message: "นำไปใช้งานต้องระบุสถานที่" },
  );
