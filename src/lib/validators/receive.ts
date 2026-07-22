import { z } from "zod";

const receiveItemSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().int().min(1),
  lotNumber: z.string().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  unitCost: z.number().min(0).optional().nullable(),
  subCodes: z.array(z.string()).optional().nullable(),
});

// lotNumber is optional everywhere: consumables fall back to a date code in the API
// handler (src/lib/lot-code.ts), non-consumables have no lots at all.
export const receiveRequestSchema = z.object({
  items: z.array(receiveItemSchema).min(1, "At least one item required"),
  notes: z.string().max(500).optional().nullable(),
});
