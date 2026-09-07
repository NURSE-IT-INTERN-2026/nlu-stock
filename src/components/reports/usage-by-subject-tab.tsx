"use client";

import { useState, useCallback, useMemo } from "react";
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
import { type UsageMonth, type UsageMonthGroup, type UsageMonthRow } from "@/lib/usage-groups";
import { DISPENSE_KINDS, DISPENSE_KIND_LABELS, type DispenseKind } from "@/lib/dispense-kind";

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
 *
 * `metric` คือตัวเลขที่กราฟกับตารางนำ — ไม่ใช่ทางเลือกด้านการแสดงผล แต่เป็นคำถามคนละข้อ:
 * ของสิ้นเปลืองที่เบิกไปแล้วไม่กลับ คำถามคือ "หมดไปเท่าไร" (หน่วย) ส่วนของที่ยืมแล้วคืน
 * จำนวนหน่วยแทบไม่ขยับ — สิ่งที่บอกภาระจริงคือ "ถูกหยิบออกไปกี่ครั้ง".
 *
 * นำไปใช้งานไม่มีวิชาให้จัดกลุ่ม (validators/dispense ยกเว้น usageType ให้ INUSE โดยตั้งใจ)
 * และไม่มีแกนเวลาเลย — มันคือภาพนิ่งว่าตอนนี้ของอยู่ห้องไหน (ดู groupInUseSnapshot).
 */
const KINDS: Record<DispenseKind, {
  token: Token;
  metric: "quantity" | "records";
  groupHeader: string;
  empty: string;
  /** บรรทัดใต้ตาราง — คำที่ segment นี้ใช้เรียกสิ่งที่กำลังนับ */
  tableHint: string;
}> = {
  consume: {
    token: "issue",
    metric: "quantity",
    groupHeader: "วิชา / กิจกรรม",
    empty: "ไม่มีการเบิกใช้ในช่วงนี้",
    tableHint: "อันดับรวมทั้งช่วง",
  },
  borrow: {
    token: "borrow",
    metric: "records",
    groupHeader: "วิชา / กิจกรรม",
    empty: "ไม่มีการยืมในช่วงนี้",
    tableHint: "อันดับตามความถี่การยืม",
  },
  inuse: {
    token: "inuse",
    metric: "quantity",
    groupHeader: "สถานที่",
    empty: "ตอนนี้ไม่มีของตั้งอยู่ที่ไหนเลย",
    tableHint: "ของที่ตั้งอยู่ตอนนี้ แยกตามห้อง",
  },
};

/** บรรทัดบอกว่าตารางใบถัดไปคือใบไหน — สองตารางหน้าตาเหมือนกันจนแยกไม่ออกถ้าไม่มีป้าย */
function TableCaption({ children }: { children: React.ReactNode }) {
  return <p className="pt-1 text-xs font-medium text-muted-foreground">{children}</p>;
}

// จำนวนหน่วยอย่างเดียวตอบไม่ได้ว่ากลุ่มนี้เบิกบ่อยหรือเบิกทีเดียวเยอะ และใช้ของกี่ชนิด —
// สองคอลัมน์นี้คือความต่างระหว่าง "รู้ยอด" กับ "รู้พฤติกรรม". คอลัมน์ที่ segment นี้นับด้วยมาก่อน
// เสมอ ไม่งั้นสายตาไปตกที่เลขที่ไม่ใช่คำตอบ.
function columnsFor(kind: DispenseKind): Column<Row>[] {
  const spec = KINDS[kind];
  const qtyHeader = kind === "inuse" ? "จำนวนที่ตั้งอยู่" : "จำนวนหน่วย";
  const records: Column<Row> = {
    key: "records",
    header: kind === "inuse" ? "จำนวนใบตั้ง" : "จำนวนครั้ง",
    className: "text-right",
    render: (r) => r.records.toLocaleString(),
  };
  const quantity: Column<Row> = {
    key: "totalQuantity",
    header: qtyHeader,
    className: "text-right",
    render: (r) => r.totalQuantity.toLocaleString(),
  };
  return [
    { key: "label", header: spec.groupHeader },
    ...(spec.metric === "records" ? [records, quantity] : [quantity, records]),
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
  const isSnapshot = kind === "inuse";

  // ภาพนิ่งไม่มีช่วงเวลาให้เลือก — ปล่อยตัวเลือกวันที่ค้างไว้บนจอทั้งที่ API ไม่อ่านมันคือ
  // ตัวกรองที่โกหก. เหลือหมวดหมู่ ซึ่งยังกรองได้จริง.
  const filterConfig: FilterConfig = isSnapshot
    ? { categories: true }
    : { dateRange: true, yearQuick: true, categories: true };

  const fetcher = useCallback(async () => {
    const params: Record<string, string> = { kind };
    if (kind !== "inuse") {
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
    }
    if (filters.categoryId) params.categoryId = filters.categoryId;
    else if (filters.profileId) params.profileId = filters.profileId;
    return (await getReport("usage-by-subject", params)) as {
      rows: Row[]; courses?: Row[]; months?: UsageMonth[]; buildings?: UsageMonthGroup[]; summary: Summary;
    };
  }, [filters, kind]);

  const { data: result, isFetching: loading } = useAsync(fetcher, [fetcher]);
  const months = useMemo(() => result?.months ?? [], [result]);
  const buildings = useMemo(() => result?.buildings ?? [], [result]);
  const summary = result?.summary ?? null;

  // API เรียงตามจำนวนหน่วยเสมอ — segment ที่นับเป็นครั้งต้องเรียงใหม่ตรงนี้ ไม่งั้นอันดับในตาราง
  // กับตัวเลขที่คอลัมน์แรกโชว์ไม่ใช่เรื่องเดียวกัน (และกราฟที่ตัด 12 อันดับแรกก็ตัดผิดชุด)
  const byMetric = useCallback(
    (rows: Row[]) =>
      spec.metric === "records" ? [...rows].sort((a, b) => b.records - a.records) : rows,
    [spec.metric],
  );
  const data = useMemo(() => byMetric(result?.rows ?? []), [result, byMetric]);
  const courses = useMemo(() => byMetric(result?.courses ?? []), [result, byMetric]);

  // เดือนที่เปิดอยู่อ้างด้วย key ไม่ใช่ object — ผลลัพธ์ชุดใหม่ (เปลี่ยน segment/ตัวกรอง) จะได้ไม่
  // ค้างกล่องเก่าที่ไม่มีอยู่ในชุดใหม่แล้วไว้บนจอ
  const month = months.find((m) => m.month === openMonth) ?? null;
  const monthDetail: UsageDetail | null = month && {
    title: monthLabel(month.month),
    subtitle: `${month.totalQuantity.toLocaleString()} หน่วย · ${month.records.toLocaleString()} ครั้ง`,
    groups: month.groups,
    empty: "เดือนนี้ไม่มีการใช้งาน",
  };

  // ภาพนิ่งไม่มีเดือน — แท่งที่กดคืออาคาร และกล่องที่เปิดคือห้องในอาคารนั้น
  const building = buildings.find((b) => b.group === openMonth) ?? null;
  const buildingDetail: UsageDetail | null = building && {
    title: building.label,
    subtitle: `${building.totalQuantity.toLocaleString()} หน่วยที่ตั้งอยู่ · ${building.rows.length.toLocaleString()} ห้อง`,
    groups: [building],
    empty: "ไม่มีของตั้งอยู่ในอาคารนี้",
  };

  // นำไปใช้งานไม่มีวิชาให้เรียง และช่วงที่ไม่มีวิชาเลยก็ไม่มีอะไรให้สลับไปดู — view ตกกลับเป็นเดือนเอง
  const canCourse = !isSnapshot && courses.length > 0;

  const row = data.find((r) => r.key === openRow) ?? null;

  // รายละเอียดของหนึ่งวิชา/กิจกรรม/ห้อง = ต้นไม้ก้อนเดิมอ่านกลับด้าน — สำหรับสองอันแรกคือ
  // เดือน → พัสดุ (months ที่ยิงมามีครบแล้ว จึงไม่ต้องยิง API เพิ่มต่อหนึ่งแถวที่กด) ส่วนภาพนิ่ง
  // ไม่มีเดือน แถวที่กดจึงเปิดตรงเข้าไปที่พัสดุในห้องนั้น. join ด้วย key ที่ API คิดมาให้ ไม่ใช่
  // ชื่อที่แสดงผล — สองวิชาชื่อซ้ำกันได้ แต่คีย์ไม่ซ้ำ
  const rowDetail: UsageDetail | null = useMemo(() => {
    if (!row) return null;

    if (isSnapshot) {
      const roomGroup = buildings
        .flatMap((b) => b.rows.map((r) => ({ b, r })))
        .find(({ r }) => r.key === row.key);
      if (!roomGroup) return null;
      return {
        title: row.label,
        subtitle: `${row.totalQuantity.toLocaleString()} หน่วยที่ตั้งอยู่ · ${row.records.toLocaleString()} ใบตั้ง · ${row.itemCount.toLocaleString()} ชนิด`,
        groups: [{
          group: roomGroup.b.group,
          label: roomGroup.b.label,
          records: roomGroup.r.records,
          totalQuantity: roomGroup.r.totalQuantity,
          rows: [roomGroup.r],
        }],
        empty: "ไม่มีของตั้งอยู่ในห้องนี้",
      };
    }

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
      subtitle: `${row.records.toLocaleString()} ครั้ง · ${row.totalQuantity.toLocaleString()} หน่วย · ใช้พัสดุ ${row.itemCount.toLocaleString()} ชนิด`,
      groups: [{
        group: "BY_MONTH",
        label: "แยกตามเดือน",
        records: row.records,
        totalQuantity: row.totalQuantity,
        rows,
      }],
      empty: "ไม่มีการใช้งานในช่วงนี้",
    };
  }, [row, isSnapshot, buildings, months]);

  // แท่งของภาพนิ่งคืออาคาร — รูปแถวเดียวกับ Row เพื่อให้กราฟใบเดิมรับได้
  const buildingRows: Row[] = useMemo(
    () => buildings.map((b) => ({
      key: b.group,
      usageType: null,
      courseCode: null,
      label: b.label,
      totalQuantity: b.totalQuantity,
      records: b.records,
      itemCount: b.rows.length,
    })),
    [buildings],
  );

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
                <TabsTrigger key={k} value={k}>
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

      {isSnapshot ? (
        <UsageBySubjectChart
          data={buildingRows}
          title="ของที่ตั้งอยู่ตอนนี้ แยกตามอาคาร"
          hint={`${buildingRows.length.toLocaleString()} อาคาร/ชั้น · กดที่แท่งเพื่อดูรายห้อง`}
          height={260}
          onSelect={(r) => setOpenMonth(r.key)}
        />
      ) : canCourse && view === "course" ? (
        <UsageBySubjectChart
          data={courses}
          title="สัดส่วนรายวิชา"
          hint={`${courses.length.toLocaleString()} วิชาในช่วงนี้ · กดที่แท่งเพื่อดูรายละเอียด`}
          height={260}
          metric={spec.metric}
          onSelect={(r) => setOpenRow(r.key)}
        />
      ) : (
        <UsageByMonthChart
          months={months}
          hint={periodLabel(filters)}
          metric={spec.metric}
          onSelect={setOpenMonth}
        />
      )}

      {/* ยอดรวมเคยเป็นการ์ดใบใหญ่บนสุด — ตัวเลขเดียวที่ไม่มีที่อื่นบอก เลยย้ายมาอยู่กับตารางที่มัน
          เป็นผลรวมของมันจริงๆ แทนที่จะกินพื้นที่หน้าจอทั้งแถว */}
      <TableCaption>
        {spec.tableHint}
        {!isSnapshot && ` · ${periodLabel(filters)}`}
        {summary && (spec.metric === "records"
          ? ` · รวม ${summary.records.toLocaleString()} ครั้ง จาก ${summary.units.toLocaleString()} หน่วย`
          : ` · รวม ${summary.units.toLocaleString()} หน่วย จาก ${summary.records.toLocaleString()} ${isSnapshot ? "ใบตั้ง" : "ครั้ง"}`)}
        {" "}· กดที่แถวเพื่อดูรายละเอียด
      </TableCaption>
      <ReportDataTable
        columns={columnsFor(kind)}
        data={data}
        loading={loading}
        emptyMessage={spec.empty}
        token={spec.token}
        onRowClick={(r) => setOpenRow(r.key)}
      />

      <UsageDetailDialog
        detail={isSnapshot ? buildingDetail : monthDetail}
        token={spec.token}
        onClose={() => setOpenMonth(null)}
      />
      <UsageDetailDialog detail={rowDetail} token={spec.token} onClose={() => setOpenRow(null)} />
    </div>
  );
}
