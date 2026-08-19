"use client";

import { useState, useCallback } from "react";
import {
  ReportFilters, defaultDateFilters, periodLabel,
  type FilterValues, type FilterConfig,
} from "./report-filters";
import { ReportDataTable, type Column } from "./report-data-table";
import { ReportSummary } from "./report-summary";
import { ExportButtons } from "./export-buttons";
import { UsageBySubjectChart } from "./charts/usage-by-subject-chart";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp } from "lucide-react";
import { SectionTitle, chipStyle, type Token } from "./report-kit";
import { getReport } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { DISPENSE_KINDS, DISPENSE_KIND_LABELS, type DispenseKind } from "@/lib/dispense-kind";

const filterConfig: FilterConfig = { dateRange: true, categories: true };

interface Row {
  usageType: string | null;
  courseCode: string | null;
  label: string;
  totalQuantity: number;
  records: number;
  itemCount: number;
}

interface Summary {
  subjects: number;
  records: number;
  units: number;
  unspecifiedRecords: number;
}

/**
 * หนึ่ง segment = หนึ่งชนิดการออกจากคลัง เพราะสามอย่างนี้ตอบคนละคำถาม และเดิมถูกนับรวมกันหมด.
 * นำไปใช้งานไม่มีวิชาให้จัดกลุ่ม (validators/dispense ยกเว้น usageType ให้ INUSE โดยตั้งใจ)
 * แกนของมันจึงเป็นห้อง — คำและหัวคอลัมน์ของ segment นั้นต้องพูดว่า "ห้อง" ไม่ใช่ "วิชา".
 */
const KINDS: Record<DispenseKind, {
  token: Token;
  subtitle: string;
  groupHeader: string;
  chartTitle: string;
  /** ป้ายการ์ดใบแรก และคำที่ใช้เรียกแถวที่จัดกลุ่มไม่ได้ */
  groupLabel: string;
  unspecifiedLabel: string;
  unspecifiedHint: string;
  empty: string;
}> = {
  consume: {
    token: "issue",
    subtitle: "ของสิ้นเปลืองที่เบิกออกไป ถูกใช้กับวิชาหรือกิจกรรมไหน และวิชาไหนใช้มากที่สุด",
    groupHeader: "วิชา / กิจกรรม",
    chartTitle: "สัดส่วนการเบิกใช้",
    groupLabel: "วิชา / กิจกรรมที่เบิกใช้",
    unspecifiedLabel: "ยังไม่ระบุการใช้งาน",
    unspecifiedHint: "ครั้งที่เบิกโดยไม่ได้เลือกวิชา/กิจกรรม",
    empty: "ไม่มีการเบิกใช้ในช่วงนี้",
  },
  borrow: {
    token: "borrow",
    subtitle: "ของที่ถูกยืมออกไป ใช้กับวิชาหรือกิจกรรมไหน และวิชาไหนยืมมากที่สุด",
    groupHeader: "วิชา / กิจกรรม",
    chartTitle: "สัดส่วนการยืม",
    groupLabel: "วิชา / กิจกรรมที่ยืม",
    unspecifiedLabel: "ยังไม่ระบุการใช้งาน",
    unspecifiedHint: "ครั้งที่ยืมโดยไม่ได้เลือกวิชา/กิจกรรม",
    empty: "ไม่มีการยืมในช่วงนี้",
  },
  inuse: {
    token: "inuse",
    subtitle: "ของที่นำไปใช้งาน ไปตั้งอยู่ห้องไหน และห้องไหนใช้มากที่สุด",
    groupHeader: "สถานที่",
    chartTitle: "สัดส่วนตามสถานที่",
    groupLabel: "ห้องที่มีของไปตั้ง",
    unspecifiedLabel: "ยังไม่ระบุสถานที่",
    unspecifiedHint: "แถวเก่าที่เขียนก่อนระบบบังคับให้เลือกห้อง",
    empty: "ไม่มีการนำไปใช้งานในช่วงนี้",
  },
};

// จำนวนหน่วยอย่างเดียวตอบไม่ได้ว่ากลุ่มนี้เบิกบ่อยหรือเบิกทีเดียวเยอะ และใช้ของกี่ชนิด —
// สองคอลัมน์นี้คือความต่างระหว่าง "รู้ยอด" กับ "รู้พฤติกรรม".
function columnsFor(groupHeader: string): Column<Row>[] {
  return [
    { key: "label", header: groupHeader },
    { key: "records", header: "จำนวนครั้ง", className: "text-right", render: (r) => r.records.toLocaleString() },
    { key: "totalQuantity", header: "จำนวนหน่วย", className: "text-right", render: (r) => r.totalQuantity.toLocaleString() },
    { key: "itemCount", header: "ชนิดพัสดุ", className: "text-right", render: (r) => r.itemCount.toLocaleString() },
  ];
}

export function UsageBySubjectTab() {
  const [kind, setKind] = useState<DispenseKind>("consume");
  const [filters, setFilters] = useState<FilterValues>(defaultDateFilters);
  const spec = KINDS[kind];

  const fetcher = useCallback(async () => {
    const params: Record<string, string> = { kind };
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    if (filters.categoryId) params.categoryId = filters.categoryId;
    return (await getReport("usage-by-subject", params)) as {
      rows: Row[]; courses?: Row[]; summary: Summary;
    };
  }, [filters, kind]);

  const { data: result, isFetching: loading } = useAsync(fetcher, [fetcher]);
  const data = result?.rows ?? [];
  const courses = result?.courses ?? [];
  const summary = result?.summary ?? null;

  return (
    <div className="space-y-4">
      <SectionTitle
        token={spec.token}
        icon={TrendingUp}
        title="สถิติการใช้งาน"
        subtitle={spec.subtitle}
      />

      {/* segment เป็น state ในหน้านี้เอง ไม่ขึ้น URL: ?kind= ถูก tab ออกจากคลังจองไว้แล้ว และทุก
          tab ของหน้ารายงานถูก mount พร้อมกัน — ใช้ชื่อซ้ำจะเด้งข้ามกัน */}
      <Tabs value={kind} onValueChange={(v) => setKind(v as DispenseKind)}>
        <TabsList variant="chip" className="w-full min-w-0 sm:w-auto">
          {DISPENSE_KINDS.map((k) => (
            <TabsTrigger key={k} value={k} className="min-w-0" style={chipStyle(KINDS[k].token)}>
              {DISPENSE_KIND_LABELS[k]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <ReportFilters
        config={filterConfig}
        values={filters}
        onChange={setFilters}
        actions={<ExportButtons reportType="usage-by-subject" filters={{ ...filters, kind }} />}
      />
      {summary && (
        <ReportSummary
          stats={[
            {
              label: spec.groupLabel,
              value: summary.subjects.toLocaleString(),
              hint: periodLabel(filters),
              token: spec.token,
            },
            {
              label: "จำนวนหน่วยรวม",
              value: summary.units.toLocaleString(),
              hint: `จาก ${summary.records.toLocaleString()} ครั้ง`,
              token: "issue",
            },
            {
              // The unspecified bucket is the report's own blind spot; hiding it would let the
              // breakdown read as complete when part of the stock is unaccounted for. กรอง kind
              // แล้วตัวเลขนี้จึงหมายถึงการกรอกตกหล่นจริง ไม่ใช่ INUSE ที่ไม่ต้องกรอกอยู่แล้ว.
              label: spec.unspecifiedLabel,
              value: summary.unspecifiedRecords.toLocaleString(),
              hint: spec.unspecifiedHint,
              token: summary.unspecifiedRecords > 0 ? "repair" : undefined,
            },
          ]}
        />
      )}
      <UsageBySubjectChart
        data={data}
        title={spec.chartTitle}
        hint={periodLabel(filters)}
        height={260}
      />

      {/* การ์ดรายวิชาแยกอีกใบ ตามที่ feedback ขอ: ภาพรวมข้างบนตอบ "รายวิชา/กิจกรรม/อื่นๆ อย่างละ
          เท่าไร" ซึ่งกลบว่าวิชาไหนคือตัวใหญ่ — และนำไปใช้งานไม่มีวิชา จึงไม่มีการ์ดนี้ */}
      {kind !== "inuse" && courses.length > 0 && (
        <UsageBySubjectChart
          data={courses}
          title="สัดส่วนรายวิชา"
          hint={`${courses.length.toLocaleString()} วิชาในช่วงนี้`}
          height={260}
        />
      )}

      <ReportDataTable
        columns={columnsFor(spec.groupHeader)}
        data={data}
        loading={loading}
        emptyMessage={spec.empty}
        token={spec.token}
      />
    </div>
  );
}
