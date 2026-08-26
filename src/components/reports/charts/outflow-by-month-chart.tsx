"use client";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { ChartContainer } from "@/components/dashboard/chart-container";
import { useThemeColor } from "@/lib/resolve-color";
import { monthLabel, monthLabelShort } from "@/lib/format";
import { tokenCssVar, type Token } from "../report-kit";

export interface OutflowMonth {
  month: string;
  qty: number;
  value: number;
  unpricedQty: number;
}

/**
 * ของที่ออกจากคลังรายเดือน — จำนวนเป็นแท่ง มูลค่าอยู่ใน tooltip.
 *
 * ทำไมจำนวนถึงเป็นแกน ไม่ใช่มูลค่า: ราคาซื้อในคลังนี้ยังกรอกไม่ครบ (ดู AGENTS.md) กราฟที่พล็อต
 * มูลค่าจึงมีรูปร่างของ "เดือนไหนมีคนกรอกราคา" ไม่ใช่ "เดือนไหนของออกเยอะ" — และสองอย่างนั้น
 * หน้าตาเหมือนกันเป๊ะบนจอ. จำนวนชิ้นรู้ครบทุกแถวเสมอ.
 */
const baht = (n: number) => `฿${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function ChartTooltip({
  active, payload, unitWord,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: OutflowMonth }>;
  unitWord: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="mb-1 font-medium text-foreground">{monthLabel(d.month)}</p>
      <p className="text-muted-foreground">
        <span className="font-semibold text-foreground">{d.qty.toLocaleString()}</span> {unitWord}
      </p>
      {/* ยอดเงินที่ต่ำกว่าจริงเพราะบางหน่วยไม่มีราคา ต้องบอกว่าต่ำกว่าเท่าไร ไม่ใช่แค่ปัดเศษ */}
      {d.value > 0 && (
        <p className="text-muted-foreground">
          มูลค่า <span className="font-semibold text-foreground">{baht(d.value)}</span>
          {d.unpricedQty > 0 && ` · ไม่รู้ราคา ${d.unpricedQty.toLocaleString()} ${unitWord}`}
        </p>
      )}
      {d.value === 0 && d.qty > 0 && (
        <p className="text-muted-foreground">ยังไม่รู้ราคาสักหน่วย</p>
      )}
    </div>
  );
}

export function OutflowByMonthChart({
  data,
  title,
  unitWord,
  token,
  empty,
  note,
  action,
}: {
  data: OutflowMonth[];
  title: string;
  unitWord: string;
  token: Token;
  empty: string;
  /** บอกเกณฑ์ เมื่อยอดของกราฟไม่ตรงกับการ์ดข้างบนโดยตั้งใจ */
  note?: string;
  /** ที่มุมขวาบนของการ์ด — ตัวสลับว่าการ์ดใบนี้กำลังแสดงกราฟไหน */
  action?: React.ReactNode;
}) {
  const fill = useThemeColor(tokenCssVar[token]);
  const totalQty = data.reduce((s, d) => s + d.qty, 0);
  const unpriced = data.reduce((s, d) => s + d.unpricedQty, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        {action && <CardAction>{action}</CardAction>}
        {totalQty > 0 && (
          <p className="pt-1 text-[11px] text-muted-foreground">
            รวม {totalQty.toLocaleString()} {unitWord}
            {unpriced > 0 && ` · ตีราคาไม่ได้ ${unpriced.toLocaleString()} ${unitWord}`}
          </p>
        )}
        {note && <p className="pt-0.5 text-[11px] text-muted-foreground">{note}</p>}
      </CardHeader>
      <CardContent>
        {totalQty === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{empty}</p>
        ) : (
          <div
            className="h-[260px] w-full"
            role="img"
            aria-label={`${title}: ${data.map((d) => `${monthLabel(d.month)} ${d.qty} ${unitWord}`).join(", ")}`}
          >
            <ChartContainer>
              {({ width, height }) => (
                <BarChart data={data} width={width} height={height} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={monthLabelShort}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toLocaleString()}k` : String(v))}
                  />
                  <Tooltip content={<ChartTooltip unitWord={unitWord} />} cursor={{ fill: "var(--secondary)" }} />
                  <Bar dataKey="qty" fill={fill} radius={[6, 6, 0, 0]} isAnimationActive={false} />
                </BarChart>
              )}
            </ChartContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
