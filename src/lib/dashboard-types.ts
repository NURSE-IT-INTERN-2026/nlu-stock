import { z } from "zod";

// ── Dashboard record schemas ──

export const DispenseRecordSchema = z.object({
  id: z.string(),
  dispensedAt: z.string(),
  quantity: z.number(),
  item: z.object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
  }),
  staff: z.object({
    name: z.string(),
  }),
  usageType: z.string().nullable(),
  usageNote: z.string().nullable(),
});

export const ReceiveRecordSchema = z.object({
  id: z.string(),
  receivedAt: z.string(),
  quantity: z.number(),
  item: z.object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
  }),
  receiver: z.object({
    name: z.string(),
  }),
});

export const TopDispenseDataSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  totalQuantity: z.number(),
});

export const UsageByTypeDataSchema = z.object({
  usageType: z.string().nullable(),
  label: z.string(),
  totalQuantity: z.number(),
});

export const StatusDataSchema = z.object({
  status: z.string(),
  count: z.number(),
});

// ── Array schemas (for API response validation) ──

export const DispenseRecordArraySchema = z.array(DispenseRecordSchema);
export const ReceiveRecordArraySchema = z.array(ReceiveRecordSchema);
export const TopDispenseDataArraySchema = z.array(TopDispenseDataSchema);
export const UsageByTypeDataArraySchema = z.array(UsageByTypeDataSchema);
export const StatusDataArraySchema = z.array(StatusDataSchema);

// ── Derived types ──

export type DispenseRecord = z.infer<typeof DispenseRecordSchema>;
export type ReceiveRecord = z.infer<typeof ReceiveRecordSchema>;
export type TopDispenseData = z.infer<typeof TopDispenseDataSchema>;
export type UsageByTypeData = z.infer<typeof UsageByTypeDataSchema>;
export type StatusData = z.infer<typeof StatusDataSchema>;
