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
  /** ครั้งที่ถูกเบิก — what the ranking is on. totalQuantity is tooltip detail. */
  records: z.number(),
  totalQuantity: z.number(),
});

// One record count + one unit total per series, per month. Records draw the bar; units only
// ride the tooltip.
const UsageSeriesTotalsSchema = z.record(z.string(), z.number());

export const DispenseByUsageMonthSchema = z.object({
  month: z.string(),
  records: UsageSeriesTotalsSchema,
  units: UsageSeriesTotalsSchema,
});

export const TopCoursesSchema = z.object({
  rows: z.array(z.object({
    courseCode: z.string(),
    label: z.string(),
    records: z.number(),
    units: z.number(),
  })),
  /** ครั้งที่เบิกในช่วงเดียวกันแต่ไม่ใช่รายวิชา — the chart says this out loud so its bars
   *  are never mistaken for the whole of การเบิก. */
  excluded: z.number(),
});

export const StationByRoomSchema = z.object({
  rows: z.array(z.object({
    locationId: z.string().nullable(),
    label: z.string(),
    units: z.number(),
  })),
  total: z.number(),
});

// ── Tab-level summaries ──

/** KPI row of ยืม. Cards count ชิ้น, charts count ครั้ง — `thisMonth` is the one event count
 *  here and is labelled as such. onTimeRate is null when nothing has been returned yet. */
export const LoanSummarySchema = z.object({
  thisMonth: z.number(),
  outstanding: z.number(),
  overdue: z.number(),
  onTimeRate: z.number().nullable(),
});

/** KPI row of นำไปใช้งาน. */
export const InUseSummarySchema = z.object({
  thisMonth: z.number(),
  outstanding: z.number(),
  locations: z.number(),
  maintenanceOverdue: z.number(),
});

export const FlowMonthlySchema = z.object({
  rows: z.array(z.object({ month: z.string(), out: z.number(), back: z.number(), outstanding: z.number() })),
  totalOut: z.number(),
  totalBack: z.number(),
  outstanding: z.number(),
});

export const LoanDurationSchema = z.object({
  counts: z.record(z.string(), z.number()),
  closed: z.number(),
  /** open loans, excluded from the buckets on purpose — see the route */
  stillOut: z.number(),
});

export const OutstandingLoansSchema = z.object({
  rows: z.array(z.object({
    id: z.string(),
    itemId: z.string(),
    name: z.string(),
    code: z.string(),
    reason: z.string().nullable(),
    quantity: z.number(),
    dispensedAt: z.string(),
    dueAt: z.string().nullable(),
    overdueDays: z.number().nullable(),
  })),
  total: z.number(),
  overdue: z.number(),
});

export const AssetStatusSchema = z.object({
  status: z.string(),
  label: z.string(),
  color: z.string(),
  count: z.number(),
});

// ── Array schemas (used by use-dashboard-queries for runtime response validation) ──

export const DispenseRecordArraySchema = z.array(DispenseRecordSchema);
export const ReceiveRecordArraySchema = z.array(ReceiveRecordSchema);
export const TopDispenseDataArraySchema = z.array(TopDispenseDataSchema);
export const DispenseByUsageMonthArraySchema = z.array(DispenseByUsageMonthSchema);
export const AssetStatusArraySchema = z.array(AssetStatusSchema);

// ── Derived types ──

export type DispenseRecord = z.infer<typeof DispenseRecordSchema>;
export type ReceiveRecord = z.infer<typeof ReceiveRecordSchema>;
export type TopDispenseData = z.infer<typeof TopDispenseDataSchema>;
export type DispenseByUsageMonth = z.infer<typeof DispenseByUsageMonthSchema>;
export type TopCoursesData = z.infer<typeof TopCoursesSchema>;
export type StationByRoomData = z.infer<typeof StationByRoomSchema>;
export type LoanSummaryData = z.infer<typeof LoanSummarySchema>;
export type InUseSummaryData = z.infer<typeof InUseSummarySchema>;
export type FlowMonthlyData = z.infer<typeof FlowMonthlySchema>;
export type LoanDurationData = z.infer<typeof LoanDurationSchema>;
export type OutstandingLoansData = z.infer<typeof OutstandingLoansSchema>;
export type AssetStatusData = z.infer<typeof AssetStatusSchema>;
