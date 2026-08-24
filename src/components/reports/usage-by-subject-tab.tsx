"use client";

import { useState, useCallback } from "react";
import {
  ReportFilters, defaultDateFilters, periodLabel,
  type FilterValues, type FilterConfig,
} from "./report-filters";
import { ReportDataTable, type Column } from "./report-data-table";
import { ExportButtons } from "./export-buttons";
import { UsageBySubjectChart } from "./charts/usage-by-subject-chart";
import { UsageByMonthChart } from "./charts/usage-by-month-chart";
import { UsageDetailDialog, type UsageDetail } from "./usage-detail-dialog";
import { Tabs, TabsList, TabsTrigger, TabsIndicator } from "@/components/ui/tabs";
import { segmentStyle, type Token } from "./report-kit";
import { getReport } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";
import { monthLabel } from "@/lib/format";
import { type UsageMonth, type UsageMonthRow } from "@/lib/usage-groups";
import { DISPENSE_KINDS, DISPENSE_KIND_LABELS, type DispenseKind } from "@/lib/dispense-kind";

const filterConfig: FilterConfig = { dateRange: true, categories: true };

type ChartView = "month" | "course";
const VIEW_LABELS: Record<ChartView, string> = { month: "รายเดือน", course: "รายวิชา" };

interface Row {
  key: string;
  usageType: string | null;
  courseCode: string | null;
  label: string;
  totalQuantity: number;
  records: number;
  itemCount: number;
}

interface Summary {
  records: number;
  units: number;
}

/**
 * หนึ่ง segment = หนึ่งชนิดการออกจากคลัง เพราะสามอย่างนี้ตอบคนละคำถาม และเดิมถูกนับรวมกันหมด.
 * นำไปใช้งานไม่มีวิชาให้จัดกลุ่ม (validators/dispense ยกเว้น usageType ให้ INUSE โดยตั้งใจ)
 * แกนของมันจึงเป็นห้อง — คำและหัวคอลัมน์ของ segment นั้นต้องพูดว่า "ห้อง" ไม่ใช่ "วิชา".
 */
const KINDS: Record<DispenseKind, {
  token: Token;
  groupHeader: string;
  /** ป้ายการ์ดใบแรก และคำที่ใช้เรียกแถวที่จัดกลุ่มไม่ได้ */
  groupLabel: string;
  unspecifiedLabel: string;
  unspecifiedHint: string;
  empty: string;
}> = {
  consume: {
    token: "issue",
    groupHeader: "วิชา / กิจกรรม",
    groupLabel: "วิชา / กิจกรรมที่เบิกใช้",
    unspecifiedLabel: "ยังไม่ระบุการใช้งาน",
    unspecifiedHint: "ครั้งที่เบิกโดยไม่ได้เลือกวิชา/กิจกรรม",
    empty: "ไม่มีการเบิกใช้ในช่วงนี้",
  },
  borrow: {
    token: "borrow",
    groupHeader: "วิชา / กิจกรรม",
    groupLabel: "วิชา / กิจกรรมที่ยืม",
    unspecifiedLabel: "ยังไม่ระบุการใช้งาน",
    unspecifiedHint: "ครั้งที่ยืมโดยไม่ได้เลือกวิชา/กิจกรรม",
    empty: "ไม่มีการยืมในช่วงนี้",
  },
  inuse: {
    token: "inuse",
    groupHeader: "สถานที่",
    groupLabel: "ห้องที่มีของไปตั้ง",
    unspecifiedLabel: "ยังไม่ระบุสถานที่",
    unspecifiedHint: "แถวเก่าที่เขียนก่อนระบบบังคับให้เลือกห้อง",
    empty: "ไม่มีการนำไปใช้งานในช่วงนี้",
  },
};

// จำนวนหน่วยอย่างเดียวตอบไม่ได้ว่ากลุ่มนี้เบิกบ่อยหรือเบิกทีเดียวเยอะ และใช้ของกี่ชนิด —
// สองคอลัมน์นี้คือความต่างระหว่าง "รู้ยอด" กับ "รู้พฤติกรรม".
/** บรรทัดบอกว่าตารางใบถัดไปคือใบไหน — สองตารางหน้าตาเหมือนกันจนแยกไม่ออกถ้าไม่มีป้าย */
function TableCaption({ children }: { children: React.ReactNode }) {
  return <p className="pt-1 text-xs font-medium text-muted-foreground">{children}</p>;
}

function columnsFor(groupHeader: string): Column<Row>[] {
  return [
    { key: "label", header: groupHeader },
    { key: "records", header: "จำนวนครั้ง", className: "text-right", render: (r) => r.records.toLocaleString() },
    { key: "totalQuantity", header: "จำนวนหน่วย", className: "text-right", render: (r) => r.totalQuantity.toLocaleString() },
    // "ชนิดพัสดุ 12" อ่านไม่ออกว่า 12 คืออะไร — หัวคอลัมน์ต้องบอกว่ากำลังนับของกี่แบบ ไม่ใช่ตั้งชื่อหมวด
    { key: "itemCount", header: "ใช้พัสดุกี่ชนิด", className: "text-right", render: (r) => r.itemCount.toLocaleString() },
  ];
}

export function UsageBySubjectTab() {
  const [kind, setKind] = useState<DispenseKind>("consume");
  const [filters, setFilters] = useState<FilterValues>(defaultDateFilters);
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  // เก็บ key ไม่ใช่ตัวแถว ด้วยเหตุผลเดียวกับ openMonth — ผลลัพธ์ชุดใหม่ต้องไม่ค้างยอดเก่า
  const [openRow, setOpenRow] = useState<string | null>(null);
  // กราฟทีละใบ: สองใบซ้อนกันกินจอไปเจ็ดร้อยพิกเซลก่อนถึงตาราง และทั้งคู่เล่าเรื่องเดียวกันคนละแกน
  const [view, setView] = useState<ChartView>("month");
  const spec = KINDS[kind];

  const fetcher = useCallback(async () => {
    const params: Record<string, string> = { kind };
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    if (filters.categoryId) params.categoryId = filters.categoryId;
    return (await getReport("usage-by-subject", params)) as {
      rows: Row[]; courses?: Row[]; months?: UsageMonth[]; summary: Summary;
    };
  }, [filters, kind]);

  const { data: result, isFetching: loading } = useAsync(fetcher, [fetcher]);
  const data = result?.rows ?? [];
  const courses = result?.courses ?? [];
  const months = result?.months ?? [];
  const summary = result?.summary ?? null;

  // เดือนที่เปิดอยู่อ้างด้วย key ไม่ใช่ object — ผลลัพธ์ชุดใหม่ (เปลี่ยน segment/ตัวกรอง) จะได้ไม่
  // ค้างกล่องเก่าที่ไม่มีอยู่ในชุดใหม่แล้วไว้บนจอ
  const month = months.find((m) => m.month === openMonth) ?? null;
  const monthDetail: UsageDetail | null = month && {
    title: monthLabel(month.month),
    subtitle: `${month.totalQuantity.toLocaleString()} หน่วย · ${month.records.toLocaleString()} ครั้ง`,
    groups: month.groups,
    empty: "เดือนนี้ไม่มีการใช้งาน",
  };

  // นำไปใช้งานไม่มีวิชาให้เรียง และช่วงที่ไม่มีวิชาเลยก็ไม่มีอะไรให้สลับไปดู — view ตกกลับเป็นเดือนเอง
  const canCourse = kind !== "inuse" && courses.length > 0;

  const row = data.find((r) => r.key === openRow) ?? null;

  // รายละเอียดของหนึ่งวิชา/กิจกรรม/ห้อง = ต้นไม้ก้อนเดิมอ่านกลับด้าน (เดือน → พัสดุ) — months ที่
  // ยิงมาแล้วมีครบทั้งวิชาและพัสดุอยู่ในนั้น จึงไม่ต้องยิง API เพิ่มต่อหนึ่งแถวที่กด. join ด้วย key
  // ที่ API คิดมาให้ ไม่ใช่ชื่อที่แสดงผล — สองวิชาชื่อซ้ำกันได้ แต่คีย์ไม่ซ้ำ
  const rowDetail: UsageDetail | null = (() => {
    if (!row) return null;
    const rows: UsageMonthRow[] = [];
    // ล่าสุดอยู่บน — กล่องนี้อ่านแบบสมุดบันทึก ไม่ใช่กราฟที่เดินตามเวลาไปข้างหน้า
    for (const m of [...months].reverse()) {
      for (const g of m.groups) {
        const hit = g.rows.find((r) => r.key === row.key);
        if (hit) rows.push({ ...hit, key: m.month, label: monthLabel(m.month) });
      }
    }
    return {
      title: row.label,
      subtitle: `${row.totalQuantity.toLocaleString()} หน่วย · ${row.records.toLocaleString()} ครั้ง · ใช้พัสดุ ${row.itemCount.toLocaleString()} ชนิด`,
      groups: [{
        group: "BY_MONTH",
        label: "แยกตามเดือน",
        records: row.records,
        totalQuantity: row.totalQuantity,
        rows,
      }],
      empty: "ไม่มีการใช้งานในช่วงนี้",
    };
  })();

  return (
    <div className="space-y-4">
      {/* segment เป็น state ในหน้านี้เอง ไม่ขึ้น URL: ?kind= ถูก tab ออกจากคลังจองไว้แล้ว และทุก
          tab ของหน้ารายงานถูก mount พร้อมกัน — ใช้ชื่อซ้ำจะเด้งข้ามกัน */}
      <ReportFilters
        leading={
          <Tabs value={kind} onValueChange={(v) => { setKind(v as DispenseKind); setOpenMonth(null); setOpenRow(null); }}>
            {/* สีอยู่บนราง ไม่ใช่บนแต่ละช่อง เพราะตัวที่ทาสีคือแถบที่เลื่อน ไม่ใช่ปุ่ม */}
            <TabsList variant="segment" className="w-full min-w-0" style={segmentStyle(spec.token)}>
              <TabsIndicator />
              {DISPENSE_KINDS.map((k) => (
                <TabsTrigger key={k} value={k} className="min-w-0">
                  {DISPENSE_KIND_LABELS[k]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
        config={filterConfig}
        values={filters}
        onChange={setFilters}
        actions={<ExportButtons reportType="usage-by-subject" filters={{ ...filters, kind }} />}
      />
      {/* เดือนเป็นค่าตั้งต้นเพราะเป็นคำถามแรกของรายงาน (ใช้เยอะเดือนไหน) ส่วนรายวิชาตอบว่าใครคือ
          ตัวใหญ่ ซึ่งกราฟรายเดือนกลบไว้ในกอง. นำไปใช้งานไม่มีวิชา ปุ่มสลับจึงหายไปทั้งอัน */}
      {canCourse && (
        <div className="flex justify-end">
          <Tabs value={view} onValueChange={(v) => setView(v as ChartView)}>
            <TabsList variant="segment" style={segmentStyle(spec.token)}>
              <TabsIndicator />
              {(Object.keys(VIEW_LABELS) as ChartView[]).map((v) => (
                <TabsTrigger key={v} value={v}>{VIEW_LABELS[v]}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      )}

      {canCourse && view === "course" ? (
        <UsageBySubjectChart
          data={courses}
          title="สัดส่วนรายวิชา"
          hint={`${courses.length.toLocaleString()} วิชาในช่วงนี้ · กดที่แท่งเพื่อดูรายละเอียด`}
          height={260}
          onSelect={(r) => setOpenRow(r.key)}
        />
      ) : (
        <UsageByMonthChart months={months} hint={periodLabel(filters)} onSelect={setOpenMonth} />
      )}

      {/* ยอดรวมเคยเป็นการ์ดใบใหญ่บนสุด — ตัวเลขเดียวที่ไม่มีที่อื่นบอก เลยย้ายมาอยู่กับตารางที่มัน
          เป็นผลรวมของมันจริงๆ แทนที่จะกินพื้นที่หน้าจอทั้งแถว */}
      <TableCaption>
        อันดับรวมทั้งช่วง · {periodLabel(filters)}
        {summary && ` · รวม ${summary.units.toLocaleString()} หน่วย จาก ${summary.records.toLocaleString()} ครั้ง`}
        {" "}· กดที่แถวเพื่อดูรายละเอียด
      </TableCaption>
      <ReportDataTable
        columns={columnsFor(spec.groupHeader)}
        data={data}
        loading={loading}
        emptyMessage={spec.empty}
        token={spec.token}
        onRowClick={(r) => setOpenRow(r.key)}
      />

      <UsageDetailDialog detail={monthDetail} token={spec.token} onClose={() => setOpenMonth(null)} />
      <UsageDetailDialog detail={rowDetail} token={spec.token} onClose={() => setOpenRow(null)} />
    </div>
  );
}
