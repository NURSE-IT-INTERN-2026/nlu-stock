"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { PieChart } from "lucide-react";
import { useThemeColor } from "@/lib/resolve-color";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { ChartContainer } from "@/components/dashboard/chart-container";
import { Panel } from "@/components/dashboard/primitives";

interface UsageByTypeData {
  usageType: string | null;
  /** ชื่อเต็ม "01-1234 — เคมีทั่วไป" — สำหรับ tooltip ไม่ใช่แกน */
  label: string;
  courseCode?: string | null;
  totalQuantity: number;
  records: number;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: { name: string; fullName: string } }>;
  clickable?: boolean;
  unitWord?: string;
}

function ChartTooltip({ active, payload, clickable, unitWord }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-foreground">{d.payload.fullName}</p>
      <p className="text-muted-foreground">
        จำนวน: <span className="font-semibold text-foreground">{d.value.toLocaleString("th-TH")}</span> {unitWord ?? "ชิ้น"}
      </p>
      {clickable && <p className="mt-1 text-xs text-muted-foreground">กดเพื่อดูรายละเอียดของวิชานี้</p>}
    </div>
  );
}

// Reports-only since the dashboard moved to รายวิชา (top-courses-chart). title/hint come from
// the caller because /reports draws this over whatever range the filter bar is set to.
// It sits in a plain stack there, where ChartContainer's height:100% of an only-min-height
// parent computes to 0 and the chart renders blank — `height` gives it a definite box.
export function UsageBySubjectChart<T extends UsageByTypeData>({
  data,
  title,
  hint,
  height,
  onSelect,
  metric = "quantity",
}: {
  data: T[];
  title: string;
  hint: string;
  height: number;
  /** กดแท่งแล้วเปิดรายละเอียดของวิชานั้น — เหมือนกราฟรายเดือน ไม่งั้นกราฟจบที่ "วิชานี้เยอะ" เฉยๆ */
  onSelect?: (row: T) => void;
  /** ยืมนับเป็นครั้ง — ดูเหตุผลที่ KINDS ใน usage-by-subject-tab */
  metric?: "quantity" | "records";
}) {
  const unitWord = metric === "records" ? "ครั้ง" : "ชิ้น";
  // ponytail: one fill, not a colour per bar. The categories are already named on the axis,
  // so a second encoding would carry no information.
  const fillColor = useThemeColor("--chart-2");

  // แท่งเยอะกว่านี้บนจอมือถือคือแท่งกว้างสามสี่พิกเซลที่อ่านชื่อไม่ออกสักอัน — ตัดที่อันดับต้น
  // แล้วบอกไปตรงๆ ว่าตัด. ที่เหลืออยู่ครบในตาราง "อันดับรวมทั้งช่วง" ข้างล่างอยู่แล้ว.
  const isMobile = useIsMobile();
  const shown = data.slice(0, isMobile ? 5 : 12);
  const note = shown.length < data.length ? `แสดง ${shown.length} อันดับแรก` : "";
  // แกน x เอาแค่รหัสวิชา: ชื่อเต็มยาวกว่าความกว้างของแท่งหลายเท่า recharts เลยซ่อน tick ที่ชนกัน
  // ทิ้ง — ได้แท่งสิบสองแท่งที่มีป้ายสามอัน วางไม่ตรงกับแท่งไหนเลย. ชื่อเต็มอยู่ใน tooltip
  // และในกล่องรายละเอียดที่กดเข้าไปดู.
  // แถวต้นทางเดินทางไปกับ datum เพื่อให้ onClick ของ Bar คืนของจริงกลับมาได้ ไม่ต้องหาย้อนจาก
  // index ที่ recharts ไม่ได้ให้มา (ดูคอมเมนต์ที่ <Bar> ข้างล่าง)
  const chartData = shown.map((d) => ({
    name: d.courseCode || d.label,
    fullName: d.label,
    value: metric === "records" ? d.records : d.totalQuantity,
    row: d,
  }));

  return (
    <Panel title={title} hint={[hint, note].filter(Boolean).join(" · ")}>
      {chartData.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10">
          <span className="grid size-12 place-items-center rounded-full bg-secondary">
            <PieChart className="size-5 text-muted-foreground" />
          </span>
          <div className="text-center">
            <p className="text-[13px] font-medium text-foreground">ยังไม่มีข้อมูลการใช้งาน</p>
            <p className="mt-0.5 text-xs text-muted-foreground">กราฟจะแสดงสัดส่วนเมื่อมีการเบิก</p>
          </div>
        </div>
      ) : (
        <div
          style={{ height }}
          role="img"
          aria-label={`สัดส่วนการใช้งาน: ${chartData.map((d) => `${d.fullName} (${d.value} ${unitWord})`).join(", ")}`}
        >
          <ChartContainer>
            {({ width, height }) => (
              <BarChart
                data={chartData}
                width={width}
                height={height}
                margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
                style={onSelect ? { cursor: "pointer" } : undefined}
              >
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={44} />
                <Tooltip content={<ChartTooltip clickable={!!onSelect} unitWord={unitWord} />} cursor={{ fill: "var(--secondary)" }} />
                {/* onClick อยู่บน <Bar> ไม่ใช่บน <BarChart>: chart-level click ของ recharts 3
                    ส่ง activeIndex เป็น null และ `Number(null)` คือ 0 — กดแท่งไหนก็เปิดอันดับ 1
                    เสมอโดยไม่มีอะไรฟ้อง. background โปร่งใสทำให้เป้าคลิกสูงเต็มแกน ไม่ใช่แค่
                    ความสูงของแท่ง ซึ่งอันดับท้ายๆ เตี้ยจนกดไม่โดน. */}
                <Bar
                  dataKey="value"
                  fill={fillColor}
                  radius={[6, 6, 0, 0]}
                  isAnimationActive={false}
                  {...(onSelect
                    ? {
                        background: { fill: "transparent" },
                        onClick: (d: { payload?: { row: T } }) => {
                          if (d?.payload) onSelect(d.payload.row);
                        },
                      }
                    : {})}
                />
              </BarChart>
            )}
          </ChartContainer>
        </div>
      )}
    </Panel>
  );
}
