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

export const RepairStatusDataSchema = z.object({
  damaged: z.number(),
  underRepair: z.number(),
});

export const RepairInProgressRowSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  code: z.string(),
  name: z.string(),
  updatedAt: z.string(),
});

export const OverdueReturnRowSchema = z.object({
  id: z.string(),
  dueAt: z.string(),
  quantity: z.number(),
  item: z.object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
  }),
  staff: z.object({
    name: z.string(),
  }),
});

export const LowStockRowSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  availableQty: z.number(),
  minThreshold: z.number(),
  issueUnit: z.object({ name: z.string() }),
});

export const MaintenanceFollowupRowSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  code: z.string(),
  name: z.string(),
  nextMaintenanceDate: z.string(),
});

// ── Array schemas (used by use-dashboard-queries for runtime response validation) ──

export const DispenseRecordArraySchema = z.array(DispenseRecordSchema);
export const ReceiveRecordArraySchema = z.array(ReceiveRecordSchema);
export const TopDispenseDataArraySchema = z.array(TopDispenseDataSchema);
export const UsageByTypeDataArraySchema = z.array(UsageByTypeDataSchema);
export const RepairInProgressArraySchema = z.array(RepairInProgressRowSchema);
export const OverdueReturnArraySchema = z.array(OverdueReturnRowSchema);
export const LowStockArraySchema = z.array(LowStockRowSchema);
export const MaintenanceFollowupArraySchema = z.array(MaintenanceFollowupRowSchema);

// ── Derived types ──

export type DispenseRecord = z.infer<typeof DispenseRecordSchema>;
export type ReceiveRecord = z.infer<typeof ReceiveRecordSchema>;
export type TopDispenseData = z.infer<typeof TopDispenseDataSchema>;
export type UsageByTypeData = z.infer<typeof UsageByTypeDataSchema>;
export type RepairStatusData = z.infer<typeof RepairStatusDataSchema>;
export type RepairInProgressRow = z.infer<typeof RepairInProgressRowSchema>;
export type OverdueReturnRow = z.infer<typeof OverdueReturnRowSchema>;
export type LowStockRow = z.infer<typeof LowStockRowSchema>;
export type MaintenanceFollowupRow = z.infer<typeof MaintenanceFollowupRowSchema>;
