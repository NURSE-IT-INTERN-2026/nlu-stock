"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { CalendarRange } from "lucide-react";
import { useThemeColor } from "@/lib/resolve-color";
import { ChartContainer } from "@/components/dashboard/chart-container";
import { Panel } from "@/components/dashboard/primitives";
import { monthLabel, monthLabelShort } from "@/lib/format";
import { USAGE_GROUP_LABELS, type UsageMonth } from "@/lib/usage-groups";

/**
 * ยอดการใช้งานรายเดือน ซ้อนตามกลุ่มการใช้งาน.
 *
 * แกนเป็นเดือน ไม่ใช่ชื่อวิชา เพราะรายงานนี้ต้องตอบก่อนว่า "ใช้เยอะเดือนไหน" — พอเรียงตามชื่อวิชา
 * ทั้งช่วง ฤดูกาลของคลัง (เปิดเทอมหนัก ปิดเทอมเงียบ) หายไปทั้งหมด. แต่ละแท่งกดได้ เพื่อเปิด
 * รายละเอียดว่าเดือนนั้นวิชา/กิจกรรมไหนใช้อะไรไปบ้าง.
 */
const SERIES = [
  { key: "COURSE", cssVar: "--chart-1" },
  { key: "ACTIVITY", cssVar: "--chart-2" },
  { key: "OTHER", cssVar: "--chart-3" },
  // ไม่ระบุคือช่องโหว่ของข้อมูล ไม่ใช่หมวดหนึ่งของการใช้งาน — สีเทาบอกแบบนั้นโดยไม่ต้องเขียนกำกับ
  { key: "NONE", cssVar: "--muted-foreground" },
  // นำไปใช้งานไม่มี usageType เลย จึงเป็นซีรีส์เดียว (ห้องอยู่ในรายละเอียดที่กดดู)
  { key: "INUSE", cssVar: "--inuse" },
] as const;

type Datum = { month: string; label: string; total: number } & Record<string, number | string>;

function ChartTooltip({
  active, payload, colors, unitWord,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; payload: Datum }>;
  colors: Record<string, string>;
  unitWord: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const shown = payload.filter((p) => p.value > 0);
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="mb-1 font-medium text-foreground">
        {monthLabel(row.month)} · รวม {row.total.toLocaleString()} {unitWord}
      </p>
      {shown.length === 0 ? (
        <p className="text-muted-foreground">ไม่มีการใช้งาน</p>
      ) : (
        // บนลงล่างตามลำดับที่แท่งซ้อนกันจริง
        [...shown].reverse().map((p) => (
          <p key={p.dataKey} className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: colors[p.dataKey] }} />
            {USAGE_GROUP_LABELS[p.dataKey] ?? p.dataKey}:{" "}
            <span className="font-semibold text-foreground">{p.value.toLocaleString()}</span>
          </p>
        ))
      )}
      <p className="mt-1 text-xs text-muted-foreground">กดเพื่อดูรายละเอียดของเดือนนี้</p>
    </div>
  );
}

export function UsageByMonthChart({
  months,
  hint,
  onSelect,
  metric = "quantity",
}: {
  months: UsageMonth[];
  hint: string;
  onSelect: (month: string) => void;
  /** ยืมนับเป็นครั้ง (records) — จำนวนหน่วยของการยืมไม่บอกความถี่ (โน้ต requirement owner) */
  metric?: "quantity" | "records";
}) {
  const unitWord = metric === "records" ? "ครั้ง" : "หน่วย";
  // One hook per series in a fixed order — useThemeColor re-resolves when the theme flips, and
  // a loop would break the rules-of-hooks contract the moment a series drops out.
  const colors: Record<string, string> = {
    COURSE: useThemeColor(SERIES[0].cssVar),
    ACTIVITY: useThemeColor(SERIES[1].cssVar),
    OTHER: useThemeColor(SERIES[2].cssVar),
    NONE: useThemeColor(SERIES[3].cssVar),
    INUSE: useThemeColor(SERIES[4].cssVar),
  };

  const data: Datum[] = months.map((m) => {
    const row: Datum = {
      month: m.month,
      label: monthLabelShort(m.month),
      total: metric === "records" ? m.records : m.totalQuantity,
    };
    for (const g of m.groups) row[g.group] = metric === "records" ? g.records : g.totalQuantity;
    return row;
  });

  // ซีรีส์ที่ทั้งช่วงเป็นศูนย์คือหัวข้อใน legend ที่ไม่ได้บอกอะไร
  const active = SERIES.filter((s) => months.some((m) => m.groups.some((g) => g.group === s.key)));

  return (
    <Panel
      title="การใช้งานรายเดือน"
      hint={hint}
      action={
        active.length > 0 ? (
          <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-[11px] font-medium">
            {active.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="size-2 rounded-full" style={{ background: colors[s.key] }} />
                {USAGE_GROUP_LABELS[s.key] ?? s.key}
              </span>
            ))}
          </div>
        ) : undefined
      }
    >
      {data.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10">
          <span className="grid size-12 place-items-center rounded-full bg-secondary">
            <CalendarRange className="size-5 text-muted-foreground" />
          </span>
          <div className="text-center">
            <p className="text-[13px] font-medium text-foreground">ยังไม่มีข้อมูลการใช้งาน</p>
            <p className="mt-0.5 text-xs text-muted-foreground">กราฟจะแสดงยอดรายเดือนเมื่อมีการเบิก</p>
          </div>
        </div>
      ) : (
        <div
          style={{ height: 280 }}
          role="img"
          aria-label={`ยอดการใช้งานรายเดือน: ${data.map((d) => `${monthLabel(d.month)} ${d.total} ${unitWord}`).join(", ")}`}
        >
          <ChartContainer>
            {({ width, height }) => (
              <BarChart
                data={data}
                width={width}
                height={height}
                margin={{ top: 8, right: 8, bottom: 0, left: -12 }}
                style={{ cursor: "pointer" }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toLocaleString()}k` : String(v))}
                />
                <Tooltip content={<ChartTooltip colors={colors} unitWord={unitWord} />} cursor={{ fill: "var(--secondary)" }} />
                {/* onClick อยู่บน <Bar> ไม่ใช่บน <BarChart>: chart-level click ของ recharts 3
                    ส่ง activeIndex เป็น null และ `Number(null)` คือ 0 — คลิกเดือนไหนก็เปิดเดือน
                    แรกเสมอโดยไม่มีอะไรฟ้อง. background โปร่งใสบนชั้นล่างสุดทำให้กดได้ทั้งความสูง
                    ของแกน ไม่ใช่แค่บนกองที่เตี้ยของเดือนที่ใช้ของน้อย. */}
                {active.map((s, i) => (
                  <Bar key={s.key} dataKey={s.key} stackId="usage" name={USAGE_GROUP_LABELS[s.key] ?? s.key}
                    fill={colors[s.key]} isAnimationActive={false}
                    {...(i === 0 ? { background: { fill: "transparent" } } : {})}
                    onClick={(d: { payload?: Datum }) => { if (d?.payload) onSelect(d.payload.month); }}
                    // เฉพาะแถบบนสุดของกองที่โค้งมุม ไม่งั้นทุกชั้นอ่านเป็นแท่งของตัวเอง
                    radius={i === active.length - 1 ? [6, 6, 0, 0] : undefined} />
                ))}
              </BarChart>
            )}
          </ChartContainer>
        </div>
      )}
    </Panel>
  );
}
