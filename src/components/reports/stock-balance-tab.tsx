"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { Tabs, TabsList, TabsTrigger, TabsIndicator } from "@/components/ui/tabs";
import { ReportFilters, type FilterValues, type FilterConfig } from "./report-filters";
import { ReportDataTable, wrapText, type Column } from "./report-data-table";
import { ReportSummary } from "./report-summary";
import { ExportButtons } from "./export-buttons";
import { StockSummaryChart, type StockSummaryData } from "./charts/stock-summary-chart";
import { OutflowByMonthChart, type OutflowMonth } from "./charts/outflow-by-month-chart";
import {
  DIALOG_SHELL, DIALOG_BODY,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { segmentStyle, tokenVar, type Token } from "./report-kit";
import { getReport } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";

const filterConfig: FilterConfig = { categories: true };

interface Row {
  code: string;
  dispenseType: "CONSUMABLE" | "COUNT" | "ITEM";
  name: string;
  categoryName: string;
  /** ชื่อประเภทพัสดุ (CategoryProfile) — แกนของกราฟยอดคงเหลือ, หมวดหมู่เป็นชั้นที่กดเข้าไปดู */
  profileName: string;
  totalQty: number;
  availableQty: number;
  unitName: string;
  unitCost: number | null;
  value: number;
  usedQty: number;
  usedValue: number;
  usedExact: boolean;
  usedUnpricedQty: number;
}

const baht = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

// สิ้นเปลืองกับคงทนตอบคนละคำถาม — ของสิ้นเปลืองอ่านว่า "เหลือของกี่บาท" ส่วนครุภัณฑ์อ่านว่า
// "ทรัพย์สินที่ถืออยู่กี่บาท" — ยอดรวมของสองอย่างนี้บวกกันแล้วไม่ได้แปลว่าอะไร จึงแยกฝั่งกันดู.
// COUNT (ยืม-คืน) กับ ITEM (รายชิ้น) อยู่ฝั่งเดียวกัน: ทั้งคู่คือของที่ไม่หมดไปเมื่อใช้.
const SIDES = {
  consumable: {
    label: "สิ้นเปลือง",
    token: "issue" as const,
    empty: "ไม่พบพัสดุสิ้นเปลืองตามตัวกรอง",
    // ของสิ้นเปลืองออกจากคลังแล้วไม่กลับ — "ใช้ไป" คือปลายทางปกติของมัน ไม่ใช่ความเสียหาย
    usedQtyHeader: "เบิกไปใช้",
    usedValueHeader: "มูลค่าที่ใช้ไป",
    usedCardLabel: "ใช้ไปแล้ว",
    usedCardToken: "issue" as const,
    usedUnit: "รายการเบิก",
    monthTitle: "เบิกใช้รายเดือน",
    monthEmpty: "ยังไม่มีการเบิกใช้",
    monthUnit: "หน่วย",
    monthNote: undefined as string | undefined,
  },
  durable: {
    label: "คงทน + ครุภัณฑ์",
    token: "value" as const,
    empty: "ไม่พบพัสดุคงทนตามตัวกรอง",
    // คงทนที่ออกจากคลังถาวรคือของที่เสียไปจริง — ชำรุดไม่นับ ของที่ยังพังอยู่ยังไม่ได้หายไปไหน
    usedQtyHeader: "แทงจำหน่าย/สูญหาย",
    usedValueHeader: "มูลค่าที่เสียไป",
    usedCardLabel: "แทงจำหน่าย/สูญหาย",
    usedCardToken: "repair" as const,
    usedUnit: "ชิ้น",
    monthTitle: "สูญหาย / แทงจำหน่าย รายเดือน",
    monthEmpty: "ยังไม่มีของสูญหายหรือแทงจำหน่าย",
    monthUnit: "ชิ้น",
    // การ์ดข้างบนนับ**สถานะปัจจุบัน**ของชิ้น (ไม่มีวันที่ให้เรียงเป็นเดือน) กราฟนับ**เหตุการณ์**
    // ตามวันที่แจ้ง สองยอดจึงไม่เท่ากันโดยตั้งใจ — ปล่อยให้คนอ่านเดาเองแย่กว่าบอกไปตรงๆ
    monthNote: "นับตามวันที่แจ้ง และไม่รวมของที่เรียกคืนได้แล้ว — ยอดจึงต่างจากการ์ดข้างบนที่นับสถานะปัจจุบัน",
  },
};
type Side = keyof typeof SIDES;

/** สองมุมมองของกราฟใบเดียวกัน — ภาพนิ่ง "ของอยู่ตรงไหน" กับแกนเวลา "หนักเดือนไหน" */
const CHART_VIEWS = { profile: "รายประเภท", month: "รายเดือน" } as const;
type ChartView = keyof typeof CHART_VIEWS;

const buildColumns = (spec: (typeof SIDES)[Side]): Column<Row>[] => [
  { key: "code", header: "รหัสพัสดุ" },
  { key: "name", header: "รายการพัสดุ", className: wrapText },
  { key: "categoryName", header: "หมวดหมู่" },
  {
    key: "availableQty",
    header: "คงเหลือ",
    render: (r) => `${r.availableQty} ${r.unitName}`,
  },
  {
    key: "unitCost",
    header: "ราคา/หน่วย",
    className: "text-right",
    render: (r) => (r.unitCost === null ? "—" : baht(r.unitCost)),
  },
  {
    key: "value",
    header: "มูลค่ารวม",
    className: "text-right",
    render: (r) => (r.value > 0 ? baht(r.value) : "—"),
  },
  {
    key: "usedQty",
    header: spec.usedQtyHeader,
    className: "text-right",
    render: (r) => (r.usedQty > 0 ? r.usedQty.toLocaleString() : "—"),
  },
  {
    key: "usedValue",
    header: spec.usedValueHeader,
    className: "text-right",
    // ≈ เป็นคำเดียวกับที่ tab ตัดจำหน่ายใช้ — ตีจากราคาเฉลี่ยของรายการ ไม่ใช่ยอดที่จ่ายจริง
    // ของหน่วยนั้น. แถวที่มีบางหน่วยไม่มีราคาเลยจะติด ≈ ด้วย เพราะยอดที่เห็นต่ำกว่าของจริง.
    render: (r) =>
      r.usedValue > 0 ? `${r.usedExact ? "" : "≈ "}${baht(r.usedValue)}` : r.usedQty > 0 ? "—" : "",
  },
];

/** หนึ่งหมวดหมู่ในกล่องที่เปิดจากแท่งกราฟ — พับจากแถวชุดเดียวกับตารางหลัก */
interface CategoryRow {
  categoryName: string;
  totalItems: number;
  totalQty: number;
  availableQty: number;
  usedQty: number;
  value: number;
}

function categoryColumnsFor(usedHeader: string): Column<CategoryRow>[] {
  return [
    { key: "categoryName", header: "หมวดหมู่" },
    { key: "availableQty", header: "คงเหลือ", className: "text-right", render: (r) => r.availableQty.toLocaleString() },
    { key: "totalQty", header: "ทั้งหมด", className: "text-right", render: (r) => r.totalQty.toLocaleString() },
    { key: "totalItems", header: "จำนวนรายการ", className: "text-right", render: (r) => r.totalItems.toLocaleString() },
    { key: "usedQty", header: usedHeader, className: "text-right", render: (r) => (r.usedQty > 0 ? r.usedQty.toLocaleString() : "—") },
    { key: "value", header: "มูลค่า", className: "text-right", render: (r) => (r.value > 0 ? baht(r.value) : "—") },
  ];
}

function usedColumnsFor(spec: (typeof SIDES)[Side]): Column<Row>[] {
  return [
    { key: "code", header: "รหัสพัสดุ" },
    { key: "name", header: "รายการพัสดุ", className: wrapText },
    // ไม่มีคอลัมน์หมวดหมู่: ห้าคอลัมน์ล้นความกว้างกล่องจนต้องเลื่อนแนวนอน และคำถามของกล่องนี้คือ
    // "อะไรออกไปกี่ชิ้น" ไม่ใช่ "ของหมวดไหน" ซึ่งตารางหลักข้างล่างตอบอยู่แล้ว
    {
      key: "usedQty",
      header: spec.usedQtyHeader,
      className: "text-right",
      render: (r) => `${r.usedQty.toLocaleString()} ${r.unitName}`,
    },
    {
      key: "usedValue",
      header: spec.usedValueHeader,
      className: "text-right",
      // ราคาที่ยังไม่มีใครกรอกต้องอ่านออกว่าไม่มี ไม่ใช่ช่องว่างที่อ่านได้ว่าไม่เสียอะไร
      render: (r) =>
        r.usedValue > 0 ? `${r.usedExact ? "" : "≈ "}${baht(r.usedValue)}` : "ยังไม่รู้ราคา",
    },
  ];
}

export function StockBalanceTab() {
  const [filters, setFilters] = useState<FilterValues>({});
  const [side, setSide] = useState<Side>("consumable");
  // การ์ด "ใช้ไปแล้ว / ตัดจำหน่าย" กดแล้วแจกแจงเป็นรายพัสดุ — ยอดรวมบอกว่าเสียไปเท่าไร
  // แต่คำถามถัดไปเสมอคือ "อะไรบ้าง กี่ชิ้น"
  const [openUsed, setOpenUsed] = useState(false);
  // ประเภทที่กดค้างไว้บนกราฟ — เก็บชื่อ ไม่ใช่ตัวแถว เพื่อให้ผลลัพธ์ชุดใหม่ (สลับฝั่ง/เปลี่ยน
  // ตัวกรอง) ไม่ค้างกล่องที่ไม่มีอยู่ในชุดใหม่แล้วไว้บนจอ
  const [openProfile, setOpenProfile] = useState<string | null>(null);
  // มุมมองกราฟที่เลือกไว้ — ค่าที่ใช้จริงคำนวณข้างล่าง เพราะฝั่งที่มีประเภทเดียวไม่มีมุมมองนั้นให้เลือก
  const [pickedView, setPickedView] = useState<ChartView>("profile");
  const spec = SIDES[side];

  const fetcher = useCallback(async () => {
    const params: Record<string, string> = {};
    if (filters.categoryId) params.categoryId = filters.categoryId;
    else if (filters.profileId) params.profileId = filters.profileId;
    return (await getReport("stock-balance", params)) as {
      rows: Row[];
      byMonth?: Record<Side, OutflowMonth[]>;
    };
  }, [filters]);

  const { data: result, isFetching: loading } = useAsync(fetcher, [fetcher]);
  const allRows = useMemo(() => result?.rows ?? [], [result]);
  const byMonth = result?.byMonth?.[side] ?? [];

  // ฝั่งไหนก็ตาม ทุกตัวเลขบนหน้าต้องมาจากแถวชุดเดียวกัน — การ์ด กราฟ ตาราง จึงเถียงกันไม่ได้.
  // summary จาก API เป็นยอดรวมทั้งคลัง ใช้กับหน้าที่แยกฝั่งแล้วไม่ได้ จึงพับจากแถวที่กรองแล้วแทน.
  const data = useMemo(
    () => allRows.filter((r) => (side === "consumable" ? r.dispenseType === "CONSUMABLE" : r.dispenseType !== "CONSUMABLE")),
    [allRows, side],
  );

  const summary = useMemo(() => {
    const inStock = data.filter((r) => r.availableQty > 0);
    return {
      totalValue: data.reduce((s, r) => s + r.value, 0),
      totalAvailableItems: inStock.length,
      itemsWithoutCost: data.filter((r) => r.unitCost === null).length,
      // ราคายังไม่ครบเป็นเรื่องปกติของคลังนี้ ตัวหารนี้คือสิ่งเดียวที่บอกว่ายอดข้างบนครอบคลุมแค่ไหน
      pricedInStock: inStock.filter((r) => r.unitCost !== null).length,
      usedQty: data.reduce((s, r) => s + r.usedQty, 0),
      usedValue: data.reduce((s, r) => s + r.usedValue, 0),
      // หน่วยที่ไม่มีราคาเลยไม่ได้อยู่ในยอด — การ์ดต้องบอกให้รู้ ไม่งั้นยอดที่ต่ำกว่าจริงจะถูกอ่าน
      // ว่าครบแล้ว. ต่างจาก ≈ ที่แปลว่ามีราคาแต่เป็นราคาเฉลี่ย.
      usedUnpricedQty: data.reduce((s, r) => s + r.usedUnpricedQty, 0),
      usedInexact: data.some((r) => r.usedQty > 0 && !r.usedExact),
    };
  }, [data]);

  // ยอดรายหมวดพับจากแถวที่อยู่บนจอแล้ว — ห้ามแยก route/fetch ใหม่ ไม่งั้นกราฟกับตารางข้างล่างไม่ตรงกัน.
  //
  // จัดกลุ่มที่ **ประเภท** ไม่ใช่หมวดหมู่: คลังนี้มีหมวดหมู่หลายสิบหมวด กราฟรายหมวดจะเป็นแท่งบางๆ
  // หลายสิบแท่งที่ recharts ซ่อนป้ายทิ้งเกือบหมด. หมวดหมู่ไม่ได้หายไป — มันไปอยู่ในกล่องที่กด
  // แท่งแล้วเปิด (byProfile[].categories) ซึ่งพับจากแถวชุดเดียวกัน จึงบวกกลับได้เท่ากันเสมอ.
  const byProfile = useMemo(() => {
    type Cat = { categoryName: string; totalItems: number; totalQty: number; availableQty: number; usedQty: number; value: number };
    const map = new Map<string, StockSummaryData & { categories: Map<string, Cat> }>();
    for (const r of data) {
      const p = map.get(r.profileName) ?? {
        key: r.profileName, profileName: r.profileName,
        totalItems: 0, totalQty: 0, availableQty: 0, categories: new Map<string, Cat>(),
      };
      p.totalItems += 1;
      p.totalQty += r.totalQty;
      p.availableQty += r.availableQty;

      const c = p.categories.get(r.categoryName)
        ?? { categoryName: r.categoryName, totalItems: 0, totalQty: 0, availableQty: 0, usedQty: 0, value: 0 };
      c.totalItems += 1;
      c.totalQty += r.totalQty;
      c.availableQty += r.availableQty;
      c.usedQty += r.usedQty;
      c.value += r.value;
      p.categories.set(r.categoryName, c);

      map.set(r.profileName, p);
    }
    return [...map.values()]
      .map((p) => ({ ...p, categories: [...p.categories.values()].sort((a, b) => b.availableQty - a.availableQty) }))
      .sort((a, b) => b.availableQty - a.availableQty);
  }, [data]);

  const openProfileRow = byProfile.find((p) => p.key === openProfile) ?? null;

  // ประเภทเดียวก็ไม่มีอะไรให้เทียบ: มุมมองรายประเภทหายไปเอง โดยไม่ต้องจำว่าเคยเลือกอะไรไว้
  const canProfile = byProfile.length > 1;
  const chartView: ChartView = canProfile ? pickedView : "month";
  const chartToggle = canProfile ? (
    <Tabs value={chartView} onValueChange={(v) => setPickedView(v as ChartView)}>
      <TabsList variant="segment" style={segmentStyle(spec.token)}>
        <TabsIndicator />
        {(Object.keys(CHART_VIEWS) as ChartView[]).map((v) => (
          <TabsTrigger key={v} value={v}>{CHART_VIEWS[v]}</TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  ) : undefined;

  const priced = summary.pricedInStock;
  const columns = useMemo(() => buildColumns(spec), [spec]);
  const categoryColumns = useMemo(() => categoryColumnsFor(spec.usedCardLabel), [spec]);
  const usedColumns = useMemo(() => usedColumnsFor(spec), [spec]);
  const usedPricedQty = summary.usedQty - summary.usedUnpricedQty;

  // แจกแจงการ์ด — เรียงตามจำนวนชิ้น ไม่ใช่มูลค่า: ราคายังกรอกไม่ครบทั้งคลัง เรียงตามเงินแล้ว
  // ของที่ออกไปเยอะที่สุดแต่ไม่มีใครกรอกราคาจะไปอยู่ท้ายสุด ทั้งที่มันคือคำตอบของคำถาม
  const usedRows = useMemo(
    () => data.filter((r) => r.usedQty > 0).sort((a, b) => b.usedQty - a.usedQty),
    [data],
  );

  return (
    <div className="space-y-4">
      {/* side ถูกส่งไปกับ export ด้วย — ไฟล์ที่โหลดออกไปต้องเป็นฝั่งเดียวกับที่เห็นอยู่บนจอ ไม่ใช่ทั้งคลัง */}
      <ReportFilters
        leading={
          <Tabs value={side} onValueChange={(v) => { setSide(v as Side); setOpenProfile(null); }}>
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
        actions={<ExportButtons reportType="stock-balance" filters={{ ...filters, side }} />}
      />
      <ReportSummary
        stats={[
          {
            label: "มูลค่าคงเหลือรวม",
            // ฿0 อ่านว่าของไม่มีมูลค่า ทั้งที่แปลว่ายังไม่มีใครกรอกราคา — ไม่มีแถวไหนมีราคาเลย
            // ก็ไม่มียอดให้รายงาน
            value: priced > 0 ? baht(summary.totalValue) : "—",
            token: priced > 0 ? spec.token : undefined,
            /* The sum can only count rows that carry a cost, and most don't — durables need
               purchasePrice, consumables need unitCost on a lot, both optional. Without this
               line the headline reads as the value of the whole storeroom when it is the value
               of the handful of items somebody priced. The ยังไม่ระบุราคา card beside it is
               the same fact from the other side; this makes the connection explicit. */
            hint: priced > 0
              ? `คิดจาก ${priced.toLocaleString()} จาก ${summary.totalAvailableItems.toLocaleString()} รายการที่มีสต็อก`
              : `ยังไม่ได้กรอกราคาสักรายการ (0 จาก ${summary.totalAvailableItems.toLocaleString()} ที่มีสต็อก)`,
          },
          {
            label: "รายการที่มีสต็อก",
            value: summary.totalAvailableItems.toLocaleString(),
            hint: `จาก${spec.label} ${data.length.toLocaleString()} รายการ`,
            token: "stockin",
          },
          {
            label: spec.usedCardLabel,
            // เหมือนการ์ดคงเหลือ: ไม่มีหน่วยไหนรู้ราคาเลยก็ไม่มียอดให้รายงาน — ฿0 จะอ่านว่าไม่เสียอะไร
            value:
              usedPricedQty > 0
                ? `${summary.usedInexact ? "≈ " : ""}${baht(summary.usedValue)}`
                : "—",
            token: usedPricedQty > 0 ? spec.usedCardToken : undefined,
            hint:
              summary.usedQty === 0
                ? `ยังไม่มีรายการ`
                : usedPricedQty > 0
                  ? `คิดจาก ${usedPricedQty.toLocaleString()} จาก ${summary.usedQty.toLocaleString()} ${spec.usedUnit} · กดดูรายการ`
                  : `ยังไม่รู้ราคาสักหน่วย (0 จาก ${summary.usedQty.toLocaleString()} ${spec.usedUnit}) · กดดูรายการ`,
            ...(usedRows.length > 0 ? { onClick: () => setOpenUsed(true) } : {}),
          },
          {
            label: "ยังไม่ระบุราคา",
            value: summary.itemsWithoutCost.toLocaleString(),
            hint: "กรอกราคาตอนรับเข้าเพื่อให้มูลค่าครบ",
            token: summary.itemsWithoutCost > 0 ? "repair" : undefined,
          },
        ]}
      />
      {/* กราฟใบเดียว สลับด้วยปุ่มมุมขวาบน — สองกราฟที่ซ้อนกันคนละใบกินจอไปห้าร้อยพิกเซลก่อนถึง
          ตาราง ทั้งที่คนอ่านดูทีละใบอยู่แล้ว. สองใบตอบคนละคำถาม: รายประเภทคือ "ตอนนี้ของอยู่ตรงไหน"
          (ภาพนิ่ง) รายเดือนคือ "หนักเดือนไหน" (แกนเวลา) — จึงเป็นมุมมองของข้อมูลชุดเดียวกัน
          ไม่ใช่สองเรื่องที่บังเอิญอยู่หน้าเดียวกัน.
          ประเภทเดียวไม่มีอะไรให้เทียบ ปุ่มสลับจึงหายไปทั้งอันและเหลือกราฟรายเดือนใบเดียว —
          เงื่อนไขผูกกับจำนวนประเภทที่นับได้จริง ไม่ใช่ผูกกับฝั่ง */}
      {chartView === "profile" ? (
        <StockSummaryChart
          data={byProfile}
          onSelect={(p) => setOpenProfile(p.key)}
          action={chartToggle}
        />
      ) : (
        <OutflowByMonthChart
          data={byMonth}
          title={spec.monthTitle}
          unitWord={spec.monthUnit}
          token={spec.usedCardToken}
          empty={spec.monthEmpty}
          note={spec.monthNote}
          action={chartToggle}
        />
      )}
      <ReportDataTable
        columns={columns}
        data={data}
        loading={loading}
        emptyMessage={spec.empty}
        emptyDescription="ลองล้างตัวกรอง"
        token={spec.token}
      />

      <BreakdownDialog
        open={openUsed}
        onClose={() => setOpenUsed(false)}
        token={spec.usedCardToken}
        title={spec.usedCardLabel}
        subtitle={`${summary.usedQty.toLocaleString()} ${spec.monthUnit} · ${usedRows.length.toLocaleString()} รายการ · เรียงตามจำนวน`}
        columns={usedColumns}
        data={usedRows}
      />

      <BreakdownDialog
        open={!!openProfileRow}
        onClose={() => setOpenProfile(null)}
        token={spec.token}
        title={openProfileRow?.profileName ?? ""}
        subtitle={
          openProfileRow
            ? `พร้อมใช้ ${openProfileRow.availableQty.toLocaleString()} จากทั้งหมด ${openProfileRow.totalQty.toLocaleString()} · ${openProfileRow.categories.length.toLocaleString()} หมวดหมู่`
            : ""
        }
        columns={categoryColumns}
        data={openProfileRow?.categories ?? []}
      />
    </div>
  );
}

/** เปลือกกล่องแจกแจง — การ์ดที่กดได้กับแท่งกราฟที่กดได้ต่างก็เปิดกล่อง "รายการย่อยของยอดนี้"
 *  หน้าตาเดียวกัน ต่างแค่ว่าแจกแจงอะไร. ข้างในเป็น ReportDataTable ตัวเดียวกับตารางอื่นทั้งแอป
 *  ไม่ใช่ list ที่ยัดทุกตัวเลขต่อกันเป็นประโยคเดียวชิดขวา — ตัวเลขที่อ่านเทียบกันระหว่างแถวต้อง
 *  อยู่คนละคอลัมน์ ไม่งั้นตาต้องไล่หาว่าเลขไหนคือเลขอะไรใหม่ทุกแถว. */
// ข้อจำกัดของ T ตรงกับ ReportDataTable เป๊ะ (ดู eslint-disable ที่ไฟล์นั้น): ตารางอ่านค่าด้วย
// col.key เป็นสตริง จึงต้องยอมให้ index ด้วยสตริงได้ — บีบให้เป็น Record<string, unknown>
// จะทำให้ส่ง interface ที่ประกาศ field ไว้ครบเข้ามาไม่ได้เลย
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BreakdownDialog<T extends Record<string, any>>({
  open, onClose, token, title, subtitle, columns, data,
}: {
  open: boolean;
  onClose: () => void;
  token: Token;
  title: string;
  subtitle: string;
  columns: Column<T>[];
  data: T[];
}) {
  // Base UI โฟกัสปุ่มแรกที่เจอเมื่อเปิดกล่อง ซึ่งในตารางที่มีหลายหน้าคือปุ่มแบ่งหน้าที่อยู่ล่างสุด —
  // เบราว์เซอร์เลื่อนมันเข้ามาในจอ แล้วกล่องก็เปิดขึ้นมาโดยหัวตารางกับแถวอันดับหนึ่งถูกเลื่อนพ้นจอ
  // ไปแล้ว. ชี้โฟกัสไปที่ตัวพื้นที่เลื่อนแทน กล่องจึงเปิดที่บนสุดเสมอ.
  const bodyRef = useRef<HTMLDivElement>(null);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {/* กว้างกว่ากล่องปกติ เพราะข้างในเป็นตารางห้าหกคอลัมน์ ไม่ใช่ย่อหน้า */}
      <DialogContent
        initialFocus={bodyRef}
        className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 sm:max-w-[900px]"
      >
        <div className={DIALOG_SHELL}>
          <DialogHeader
            className="shrink-0 border-b border-border px-5 py-4 pr-14"
            style={{ borderBottomColor: `color-mix(in oklab, ${tokenVar[token]} 30%, transparent)` }}
          >
            <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
            <DialogDescription className="text-xs">{subtitle}</DialogDescription>
          </DialogHeader>
          <div ref={bodyRef} tabIndex={-1} className={cn(DIALOG_BODY, "bg-secondary/40 px-5 py-5 outline-none")}>
            <ReportDataTable columns={columns} data={data} pageSize={12} token={token} className="rounded-xl" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
