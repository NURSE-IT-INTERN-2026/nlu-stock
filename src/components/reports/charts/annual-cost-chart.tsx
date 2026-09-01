"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { ChartContainer } from "@/components/dashboard/chart-container";
import { useThemeColor } from "@/lib/resolve-color";

export interface AnnualCostMonth {
  month: string;
  purchase: number;
  corrective: number;
  preventive: number;
}

/**
 * เดิมกราฟนี้เป็นวงกลมสองชิ้น (ซื้อ / ซ่อมบำรุง) ทั้งปี ซึ่งตอบได้แค่ "ปีนี้จ่ายไปทางไหนมากกว่า"
 * คำถามจริงคือเงินออกเดือนไหน และเป็นเงินที่ต้องจ่ายเพราะของพัง (ซ่อมแซม) หรือเงินที่ตั้งใจจ่าย
 * เพื่อไม่ให้พัง (ตรวจบำรุง) — สองอย่างนี้จึงเป็นคนละแท่งซ้อนกันบนแกนเดือน.
 */
const SERIES = [
  { key: "purchase", label: "ค่าจัดซื้อ", cssVar: "--chart-1" },
  { key: "corrective", label: "ค่าซ่อมแซม", cssVar: "--chart-2" },
  { key: "preventive", label: "ค่าตรวจบำรุง", cssVar: "--chart-3" },
] as const;

type SeriesKey = (typeof SERIES)[number]["key"];

const baht = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

function ChartTooltip({
  active, payload, label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; dataKey: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const shown = payload.filter((p) => p.value > 0);
  if (shown.length === 0) return null;
  const total = payload.reduce((n, p) => n + p.value, 0);
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="mb-1 font-medium text-foreground">{label} · รวม {baht(total)}</p>
      {/* Top of the stack first, so the rows read in the order the bands are drawn. */}
      {[...shown].reverse().map((p) => (
        <p key={p.dataKey} className="flex items-center gap-1.5 text-muted-foreground">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-semibold text-foreground">{baht(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

export function AnnualCostChart({ data, year }: { data: AnnualCostMonth[]; year: number }) {
  // One hook per series, fixed order — useThemeColor takes a single var and re-resolves when
  // the theme flips (a memoized copy left the old chart in light colours after switching).
  const colors: Record<SeriesKey, string> = {
    purchase: useThemeColor(SERIES[0].cssVar),
    corrective: useThemeColor(SERIES[1].cssVar),
    preventive: useThemeColor(SERIES[2].cssVar),
  };

  // ซีรีส์ที่ทั้งปีเป็นศูนย์คือหัวข้อใน legend ที่ไม่ได้บอกอะไร — ตัดออกให้เหลือเฉพาะที่มีเงินจริง
  const active = SERIES.filter((s) => data.some((d) => d[s.key] > 0));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">ค่าใช้จ่ายรายเดือน</CardTitle>
        {active.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[11px] font-medium">
            {active.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="size-2 rounded-full" style={{ background: colors[s.key] }} />
                {s.label}
              </span>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {active.length === 0 ? (
          // 12 แท่งศูนย์อ่านว่า "ปีนี้ไม่ได้ใช้เงินเลย" ทั้งที่แปลว่ายังไม่มีใครกรอกราคา
          <p className="py-12 text-center text-sm text-muted-foreground">
            ยังไม่มีรายการที่ระบุราคาในปีนี้
          </p>
        ) : (
          <div
            className="h-[280px] w-full"
            role="img"
            aria-label={`ค่าใช้จ่ายรายเดือน ปี ${year}: ${data
              .map((d) => `${d.month} ${active.map((s) => `${s.label} ${d[s.key]}`).join(" ")}`)
              .join(", ")}`}
          >
            <ChartContainer>
              {({ width, height }) => (
                <BarChart data={data} width={width} height={height} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toLocaleString()}k` : String(v))}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--secondary)" }} />
                  {active.map((s, i) => (
                    <Bar
                      key={s.key}
                      dataKey={s.key}
                      stackId="cost"
                      name={s.label}
                      fill={colors[s.key]}
                      // Only the top band gets the rounded cap, or every segment reads as its
                      // own bar and the stack stops looking like one month's total.
                      radius={i === active.length - 1 ? [6, 6, 0, 0] : undefined}
                      isAnimationActive={false}
                    />
                  ))}
                </BarChart>
              )}
            </ChartContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
