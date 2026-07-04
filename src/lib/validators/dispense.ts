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
  usageNote: z.string().max(500).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  recipient: z.string().max(255).optional().nullable(),
  dueAt: z.string().optional().nullable(), // "YYYY-MM-DD" from <input type="date">, one per borrow
  // ponytail: per-dispense flag, not a DB column — API flips trackIndividually sub-item status to
  // ON_LOAN (ยืม, default) or IN_USE (ตั้งใช้ในห้อง). Ignored for CONSUMABLE/COUNT.
  loanType: z.enum(["BORROW", "INUSE"]).optional().nullable(),
});
