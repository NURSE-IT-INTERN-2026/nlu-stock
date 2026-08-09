/** Months shown in the KPI sparkline, current month last. */
export const SPARK_MONTHS = 6;

export interface MonthlyFlow {
  /** Quantity per month, oldest first — feeds the sparkline. */
  spark: number[];
  thisMonthQty: number;
  lastMonthQty: number;
  /** Record count (ครั้ง), not quantity — the KPI headline number. */
  thisMonthCount: number;
}

/** First day of the oldest sparkline bucket. Use it as the query's lower bound. */
export function sparkStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth() - (SPARK_MONTHS - 1), 1);
}

/**
 * Bucket movement rows into the last SPARK_MONTHS calendar months.
 *
 * One pass over one query covers everything the KPI cards show — headline count, this/last
 * month quantity and the sparkline — instead of six separate aggregates. Rows outside the
 * window are ignored rather than clamped into the edge buckets, so a stale row cannot
 * inflate the oldest month.
 */
export function monthlyFlow(rows: { at: Date; quantity: number }[], now: Date): MonthlyFlow {
  const start = sparkStart(now);
  const qty = new Array<number>(SPARK_MONTHS).fill(0);
  const count = new Array<number>(SPARK_MONTHS).fill(0);

  for (const r of rows) {
    const i =
      (r.at.getFullYear() - start.getFullYear()) * 12 + (r.at.getMonth() - start.getMonth());
    if (i >= 0 && i < SPARK_MONTHS) {
      qty[i] += r.quantity;
      count[i] += 1;
    }
  }

  return {
    spark: qty,
    thisMonthQty: qty[SPARK_MONTHS - 1],
    lastMonthQty: qty[SPARK_MONTHS - 2],
    thisMonthCount: count[SPARK_MONTHS - 1],
  };
}
