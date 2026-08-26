"use client";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { ChartContainer } from "@/components/dashboard/chart-container";
import { useThemeColor } from "@/lib/resolve-color";

/**
 * ยอดคงเหลือราย **ประเภท** ไม่ใช่รายหมวดหมู่.
 *
 * คลังนี้มีหมวดหมู่หลายสิบหมวด — แท่งหลายสิบแท่งบนแกนเดียวคือป้ายที่ recharts ซ่อนทิ้งเกือบหมด
 * แล้วเหลือกราฟที่อ่านไม่ออกว่าแท่งไหนคืออะไร. ประเภทมีไม่กี่อัน จึงเป็นระดับที่ตอบ "ของอยู่ตรงไหน
 * เยอะ" ได้ในสายตาเดียว ส่วนหมวดหมู่ย้ายไปอยู่ในกล่องที่กดแท่งแล้วเปิด — รายละเอียดที่ขอดูได้
 * ไม่ใช่รายละเอียดที่ถูกยัดมาให้ทั้งหมดตั้งแต่แรก.
 */
const BARS = [
  { key: "total", label: "ทั้งหมด" },
  { key: "available", label: "พร้อมใช้" },
] as const;

export interface StockSummaryData {
  key: string;
  profileName: string;
  totalItems: number;
  totalQty: number;
  availableQty: number;
}

function ChartTooltip({
  active, payload, colors,
}: {
  active?: boolean;
  payload?: Array<{ payload: StockSummaryData }>;
  colors: { total: string; available: string };
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="mb-1 font-medium text-foreground">{d.profileName}</p>
      <p className="flex items-center gap-1.5 text-muted-foreground">
        <span className="size-2 rounded-full" style={{ background: colors.total }} />
        ทั้งหมด: <span className="font-semibold text-foreground">{d.totalQty.toLocaleString()}</span>
      </p>
      <p className="flex items-center gap-1.5 text-muted-foreground">
        <span className="size-2 rounded-full" style={{ background: colors.available }} />
        พร้อมใช้: <span className="font-semibold text-foreground">{d.availableQty.toLocaleString()}</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {d.totalItems.toLocaleString()} รายการ · กดเพื่อดูรายหมวดหมู่
      </p>
    </div>
  );
}

export function StockSummaryChart({
  data,
  onSelect,
  action,
}: {
  data: StockSummaryData[];
  onSelect?: (row: StockSummaryData) => void;
  /** ที่มุมขวาบนของการ์ด — ตัวสลับว่าการ์ดใบนี้กำลังแสดงกราฟไหน */
  action?: React.ReactNode;
}) {
  const colors = {
    total: useThemeColor("--chart-1"),
    available: useThemeColor("--chart-2"),
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">ยอดคงเหลือรายประเภท</CardTitle>
        {action && <CardAction>{action}</CardAction>}
        {data.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[11px] font-medium">
            {BARS.map((b) => (
              <span key={b.key} className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="size-2 rounded-full" style={{ background: colors[b.key] }} />
                {b.label}
              </span>
            ))}
            {onSelect && <span className="text-muted-foreground">· กดที่แท่งเพื่อดูรายหมวดหมู่</span>}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">ไม่มีข้อมูล</p>
        ) : (
          <div
            className="h-[280px] w-full"
            role="img"
            aria-label={`ยอดคงเหลือรายประเภท: ${data.map((d) => `${d.profileName} พร้อมใช้ ${d.availableQty} จาก ${d.totalQty}`).join(", ")}`}
          >
            <ChartContainer>
              {({ width, height }) => (
                <BarChart
                  data={data}
                  width={width}
                  height={height}
                  margin={{ top: 8, right: 8, bottom: 0, left: -12 }}
                  style={onSelect ? { cursor: "pointer" } : undefined}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="profileName" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toLocaleString()}k` : String(v))}
                  />
                  <Tooltip content={<ChartTooltip colors={colors} />} cursor={{ fill: "var(--secondary)" }} />
                  {/* onClick อยู่บน <Bar> ไม่ใช่บน <BarChart>: chart-level click ของ recharts 3
                      ส่ง activeIndex เป็น null ในกราฟนี้ และ `Number(null)` คือ 0 — คลิกตรงไหน
                      ก็เปิดแท่งแรกเสมอโดยไม่มีอะไรฟ้อง. onClick ของ Bar ได้ payload ของแถวที่
                      ถูกคลิกมาตรงๆ จึงเดาไม่ได้ว่าผิดแถว.
                      background โปร่งใสทำให้เป้าคลิกสูงเต็มแกน ไม่ใช่แค่ความสูงของแท่ง —
                      ประเภทที่ยอดน้อยมีแท่งสูงไม่กี่พิกเซล ซึ่งกดไม่โดนในทางปฏิบัติ. */}
                  {BARS.map((b) => (
                    <Bar
                      key={b.key}
                      dataKey={b.key === "total" ? "totalQty" : "availableQty"}
                      name={b.label}
                      fill={colors[b.key]}
                      radius={[6, 6, 0, 0]}
                      isAnimationActive={false}
                      maxBarSize={72}
                      {...(onSelect
                        ? {
                            background: { fill: "transparent" },
                            onClick: (d: { payload?: StockSummaryData }) => {
                              if (d?.payload) onSelect(d.payload);
                            },
                          }
                        : {})}
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
