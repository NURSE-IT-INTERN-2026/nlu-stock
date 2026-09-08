"use client";

import { useState, useCallback } from "react";
import { ReportFilters, type FilterValues, type FilterConfig } from "./report-filters";
import { ReportDataTable, type Column } from "./report-data-table";
import { ReportSummary, type SummaryStat } from "./report-summary";
import { ExportButtons } from "./export-buttons";
import { AnnualCostChart, type AnnualCostMonth } from "./charts/annual-cost-chart";
import { Tabs, TabsList, TabsTrigger, TabsIndicator } from "@/components/ui/tabs";
import { segmentStyle, type Token } from "./report-kit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDate, TH_DATE } from "@/lib/format";
import { getReport } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { MAINT_TYPE_LABELS, labelFor, type MaintenanceType } from "@/lib/constants";

const filterConfig: FilterConfig = { year: true, categories: true };

interface RepairRow {
  id: string;
  itemCode: string;
  itemName: string;
  categoryName: string;
  cost: number;
  performedAt: string;
  type: string;
  performer: string;
}

interface SideSummary {
  totalPurchase: number;
  purchaseCount: number;
  /** รายการที่อยู่ในปีนี้แต่ยังไม่มีราคา — ตัวหารที่บอกว่ายอดข้างบนครอบคลุมแค่ไหน */
  unpricedPurchases: number;
  correctiveCost: number;
  correctiveCount: number;
  preventiveCost: number;
  preventiveCount: number;
  repairCount: number;
  unpricedRepairs: number;
  total: number;
}

/** ของที่หายออกจากคลังในปีนั้น — lib/cost summariseLosses */
interface Loss {
  qty: number;
  unpricedQty: number;
  value: number;
  exact: boolean;
  events: number;
}

interface SidePayload {
  byMonth: AnnualCostMonth[];
  repairs: RepairRow[];
  loss: Loss;
  summary: SideSummary;
}

/** ต้นทุนของที่ถูกใช้ไปต่อวิชา — lib/usage-by-subject consumableCostBySubject */
interface SubjectRow {
  key: string;
  label: string;
  courseCode: string | null;
  qty: number;
  value: number;
  unpricedQty: number;
  records: number;
  itemCount: number;
}

interface Result {
  year: number;
  bySubject: SubjectRow[];
  sides: Record<Side, SidePayload>;
}

/**
 * สองก้อนงบ ไม่ใช่สองการ์ดในหน้าเดียว.
 *
 * สิ้นเปลืองกับอื่นๆ ตั้งงบคนละก้อน และมีเพียงฝั่งสิ้นเปลืองที่ตอนนี้เก็บราคาจริงตอนรับเข้าได้ครบ
 * (ครุภัณฑ์ยังไม่มีช่องราคาที่หน้ารับเข้า) — ยอดรวมที่กลบความต่างนั้นอ่านเหมือนสองฝั่งน่าเชื่อถือ
 * เท่ากัน. ฝั่ง "อื่นๆ" ไม่ได้ชื่อ "คงทน + ครุภัณฑ์" แบบ tab มูลค่าคงคลัง เพราะมันถือค่าซ่อมแซม
 * กับค่าตรวจบำรุงด้วย ซึ่งเป็นค่าบริการ ไม่ใช่ตัวครุภัณฑ์.
 */
const SIDES = {
  consumable: {
    label: "สิ้นเปลือง",
    token: "issue" as Token,
    purchaseLabel: "ค่าจัดซื้อวัสดุสิ้นเปลือง",
    purchaseHint: "ราคาต่อหน่วยถูกกรอกตอนรับเข้าเป็นล็อต",
    lossLabel: "สิ้นเปลืองที่สูญหาย / แทงจำหน่าย",
  },
  other: {
    label: "อื่นๆ",
    token: "value" as Token,
    purchaseLabel: "ค่าจัดซื้อ",
    purchaseHint: "ราคาครุภัณฑ์ยังกรอกได้ไม่ครบทุกใบรับเข้า",
    lossLabel: "สูญหาย / แทงจำหน่าย",
  },
};
type Side = keyof typeof SIDES;

const baht = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

const repairColumns: Column<RepairRow>[] = [
  { key: "performedAt", header: "วันที่", render: (r) => fmtDate(new Date(r.performedAt), TH_DATE) },
  { key: "itemCode", header: "รหัสพัสดุ" },
  { key: "itemName", header: "รายการพัสดุ" },
  { key: "type", header: "ประเภท", render: (r) => labelFor(MAINT_TYPE_LABELS, r.type as MaintenanceType) },
  { key: "cost", header: "ค่าใช้จ่าย", className: "text-right", render: (r) => baht(r.cost) },
  { key: "performer", header: "ผู้ดำเนินการ" },
];

const subjectColumns: Column<SubjectRow>[] = [
  { key: "label", header: "วิชา / กิจกรรม" },
  { key: "records", header: "จำนวนครั้ง", className: "text-right", render: (r) => r.records.toLocaleString() },
  { key: "qty", header: "จำนวนหน่วย", className: "text-right", render: (r) => r.qty.toLocaleString() },
  {
    key: "value",
    header: "เป็นเงิน",
    className: "text-right",
    // ≈ เมื่อมีหน่วยที่ตีราคาไม่ได้อยู่ในแถว — ยอดที่เห็นต่ำกว่าของจริง และคอลัมน์ถัดไปบอกว่าต่ำแค่ไหน
    render: (r) => (r.value > 0 ? `${r.unpricedQty > 0 ? "≈ " : ""}${baht(r.value)}` : "—"),
  },
  {
    key: "unpricedQty",
    header: "ยังไม่รู้ราคา",
    className: "text-right",
    render: (r) => (r.unpricedQty > 0 ? `${r.unpricedQty.toLocaleString()} หน่วย` : "—"),
  },
];

/**
 * การ์ดของฝั่งหนึ่ง.
 *
 * ค่าซ่อมแซม/ตรวจบำรุงมีเฉพาะฝั่งอื่นๆ: ของสิ้นเปลืองถูกเบิกออกไปใช้ ไม่ก็ตัดจำหน่าย — ไม่มีใคร
 * ส่งมันไปซ่อม (0 จาก 1,025 ใบซ่อมบำรุงในฐานข้อมูลผูกกับพัสดุสิ้นเปลือง วัดเมื่อ 2026-08-26).
 * การ์ด "—" ที่เป็นศูนย์ตลอดกาลคือที่ว่างที่แย่งความสนใจไปจากตัวเลขที่มีความหมาย. ใบซ่อมทุกใบ
 * ถูกจัดให้ฝั่งอื่นๆ ที่ route แล้ว จึงไม่มีอะไรตกหล่นแม้ API จะไม่ได้ห้ามไว้.
 */
function statsFor(side: Side, s: SideSummary, loss: Loss, buddhistYear: number): SummaryStat[] {
  const spec = SIDES[side];
  const showRepairs = side === "other";
  return [
    // ยอด ฿0 กับ "ยังไม่มีใครกรอกราคา" หน้าตาเหมือนกันเป๊ะ — พอไม่มีรายการที่มีราคาเลย
    // ตัวเลขจึงเป็น — และ hint เปลี่ยนไปบอกจำนวนที่ค้างกรอกแทน
    {
      label: spec.purchaseLabel,
      value: s.purchaseCount > 0 ? baht(s.totalPurchase) : "—",
      hint: s.purchaseCount > 0
        ? `จาก ${s.purchaseCount.toLocaleString()} ใบรับเข้าที่ระบุราคา${s.unpricedPurchases > 0 ? ` · ยังค้างกรอก ${s.unpricedPurchases.toLocaleString()}` : ""}`
        : s.unpricedPurchases > 0
          ? `ยังไม่ได้กรอกราคา ${s.unpricedPurchases.toLocaleString()} รายการในปีนี้`
          : `${spec.purchaseHint}`,
      token: s.purchaseCount > 0 ? spec.token : undefined,
    },
    ...(showRepairs
      ? ([
          // ซ่อมแซมกับตรวจบำรุงเป็นคนละก้อนงบ — ก้อนหนึ่งจ่ายเพราะของพัง อีกก้อนจ่ายเพื่อไม่ให้พัง
          {
            label: "ค่าซ่อมแซม",
            value: s.correctiveCount > 0 ? baht(s.correctiveCost) : "—",
            hint: s.correctiveCount > 0
              ? `จาก ${s.correctiveCount.toLocaleString()} ครั้งที่ซ่อมหลังของพัง`
              : s.unpricedRepairs > 0
                ? `ยังไม่ได้กรอกค่าซ่อม ${s.unpricedRepairs.toLocaleString()} รายการในปีนี้`
                : "ไม่มีงานซ่อมที่ระบุราคาในปีนี้",
            token: s.correctiveCount > 0 ? "damage" : undefined,
          },
          {
            label: "ค่าตรวจบำรุง",
            value: s.preventiveCount > 0 ? baht(s.preventiveCost) : "—",
            hint: s.preventiveCount > 0
              ? `จาก ${s.preventiveCount.toLocaleString()} รอบตรวจตามกำหนด`
              : "ไม่มีรอบตรวจที่ระบุราคาในปีนี้",
            token: s.preventiveCount > 0 ? "maintain" : undefined,
          },
        ] as SummaryStat[])
      : []),
    // ของที่หายไปกับเงินที่จ่ายออกไปเป็นคนละก้อน — บวกกันไม่ได้ และการ์ดนี้จึงไม่อยู่ในยอด
    // "รวมเงินที่จ่าย" ข้างล่าง. นำด้วย**จำนวน**ไม่ใช่บาท เพราะของที่หายส่วนใหญ่ตีราคาไม่ได้
    // (เกณฑ์เดียวกับการ์ดของหายใน /alerts)
    {
      label: spec.lossLabel,
      value: loss.qty > 0 ? `${loss.qty.toLocaleString()} หน่วย` : "—",
      hint: loss.qty === 0
        ? "ไม่มีของหายหรือถูกแทงจำหน่ายในปีนี้"
        : loss.value > 0
          ? `มูลค่า ${loss.exact ? "" : "≈ "}${baht(loss.value)}${loss.unpricedQty > 0 ? ` · ตีราคาไม่ได้ ${loss.unpricedQty.toLocaleString()} หน่วย` : ""}`
          : `ยังตีราคาไม่ได้สักหน่วย (${loss.qty.toLocaleString()} หน่วย)`,
      token: loss.qty > 0 ? "lost" : undefined,
    },
    {
      label: `รวมเงินที่จ่ายปี พ.ศ. ${buddhistYear}`,
      value: s.total > 0 ? baht(s.total) : "—",
      hint: `เฉพาะ${spec.label} · ไม่รวมของที่สูญหาย · ยังค้างกรอก ${(s.unpricedPurchases + s.unpricedRepairs).toLocaleString()} รายการ`,
      token: s.total > 0 ? spec.token : undefined,
    },
  ];
}

export function AnnualCostTab() {
  const [filters, setFilters] = useState<FilterValues>({});
  const [side, setSide] = useState<Side>("consumable");
  const spec = SIDES[side];

  const fetcher = useCallback(async () => {
    const params: Record<string, string> = {};
    if (filters.year) params.year = filters.year;
    if (filters.categoryId) params.categoryId = filters.categoryId;
    else if (filters.profileId) params.profileId = filters.profileId;
    return (await getReport("annual-cost", params)) as Result;
  }, [filters]);

  const { data: result, isFetching: loading } = useAsync(fetcher, [fetcher]);

  const payload = result?.sides?.[side] ?? null;
  const bySubject = result?.bySubject ?? [];
  const buddhistYear = (result?.year ?? new Date().getFullYear()) + 543;

  return (
    <div className="space-y-4">
      {/* side ถูกส่งไปกับ export ด้วย — ไฟล์ที่โหลดออกไปต้องเป็นฝั่งเดียวกับที่เห็นอยู่บนจอ */}
      <ReportFilters
        leading={
          <Tabs value={side} onValueChange={(v) => setSide(v as Side)}>
            {/* สีอยู่บนราง ไม่ใช่บนแต่ละช่อง เพราะตัวที่ทาสีคือแถบที่เลื่อน ไม่ใช่ปุ่ม */}
            <TabsList variant="segment" className="w-full min-w-0" style={segmentStyle(spec.token)}>
              <TabsIndicator />
              {(Object.keys(SIDES) as Side[]).map((k) => (
                <TabsTrigger key={k} value={k}>
                  {SIDES[k].label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
        config={filterConfig}
        values={filters}
        onChange={setFilters}
        actions={<ExportButtons reportType="annual-cost" filters={{ ...filters, side }} />}
      />

      {payload && <ReportSummary stats={statsFor(side, payload.summary, payload.loss, buddhistYear)} />}

      <AnnualCostChart data={payload?.byMonth ?? []} year={buddhistYear} />

      {/* ค่าใช้จ่ายรายปีเดิมตอบได้แค่ "คลังจ่ายเงินซื้ออะไรเข้ามา" ซึ่งเป็นคำถามของคนซื้อ.
          ตารางนี้ตอบคำถามของคนตั้งงบ: ปีนี้วิชาไหนกินของไปเท่าไร — ของที่ซื้อเข้ามาปีนี้กับ
          ของที่ถูกใช้ไปปีนี้เป็นคนละก้อนเงิน จึงไม่ได้บวกเข้ากับยอดใดข้างบน. อยู่ฝั่งสิ้นเปลือง
          ฝั่งเดียวเพราะครุภัณฑ์ไม่ถูกเบิกใช้ และยืมแล้วคืนไม่ใช่ต้นทุน */}
      {side === "consumable" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">ต้นทุนของสิ้นเปลืองที่เบิกไป แยกรายวิชา</CardTitle>
            <p className="pt-1 text-xs text-muted-foreground">
              เฉพาะการเบิกใช้ในปี พ.ศ. {buddhistYear} · ยืมแล้วคืนไม่นับเป็นต้นทุน
            </p>
          </CardHeader>
          <CardContent>
            <ReportDataTable
              className="rounded-xl"
              columns={subjectColumns}
              data={bySubject}
              loading={loading}
              pageSize={10}
              emptyMessage="ไม่มีการเบิกใช้ของสิ้นเปลืองในปีนี้"
              token="issue"
            />
          </CardContent>
        </Card>
      )}

      {/* ตารางซ่อมบำรุงมีเฉพาะฝั่งอื่นๆ ด้วยเหตุผลเดียวกับการ์ด (ดู statsFor) — ฝั่งสิ้นเปลือง
          เคยมีตารางใบนี้ที่ว่างเปล่าตลอดกาล ซึ่งอ่านเหมือนข้อมูลหาย ไม่ใช่เหมือนของที่ไม่มีอยู่จริง */}
      {side === "other" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">รายการซ่อมบำรุง</CardTitle>
          </CardHeader>
          <CardContent>
            <ReportDataTable
              className="rounded-xl"
              columns={repairColumns}
              data={payload?.repairs ?? []}
              loading={loading}
              pageSize={10}
              emptyMessage="ไม่มีรายการซ่อมที่ระบุค่าใช้จ่ายในปีนี้"
              token="repair"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
