"use client";

import { useState, useCallback, useMemo } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReportFilters, type FilterValues, type FilterConfig } from "./report-filters";
import { ReportDataTable, type Column } from "./report-data-table";
import { ReportSummary } from "./report-summary";
import { ExportButtons } from "./export-buttons";
import { StockSummaryChart } from "./charts/stock-summary-chart";
import { Boxes } from "lucide-react";
import { SectionTitle, chipStyle } from "./report-kit";
import { getReport } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";

const filterConfig: FilterConfig = { profiles: true, categories: true };

interface Row {
  code: string;
  dispenseType: "CONSUMABLE" | "COUNT" | "ITEM";
  name: string;
  categoryName: string;
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

const baht = (n: number) => `฿${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

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
  },
  durable: {
    label: "คงทน + ครุภัณฑ์",
    token: "value" as const,
    empty: "ไม่พบพัสดุคงทนตามตัวกรอง",
    // คงทนที่ออกจากคลังถาวรคือของที่เสียไปจริง — ชำรุดไม่นับ ของที่ยังพังอยู่ยังไม่ได้หายไปไหน
    usedQtyHeader: "ตัดจำหน่าย/สูญหาย",
    usedValueHeader: "มูลค่าที่เสียไป",
    usedCardLabel: "ตัดจำหน่าย/สูญหาย",
    usedCardToken: "repair" as const,
    usedUnit: "ชิ้น",
  },
};
type Side = keyof typeof SIDES;

const buildColumns = (spec: (typeof SIDES)[Side]): Column<Row>[] => [
  { key: "code", header: "รหัสพัสดุ" },
  { key: "name", header: "รายการพัสดุ" },
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

export function StockBalanceTab() {
  const [filters, setFilters] = useState<FilterValues>({});
  const [side, setSide] = useState<Side>("consumable");
  const spec = SIDES[side];

  const fetcher = useCallback(async () => {
    const params: Record<string, string> = {};
    if (filters.categoryId) params.categoryId = filters.categoryId;
    else if (filters.profileId) params.profileId = filters.profileId;
    return (await getReport("stock-balance", params)) as { rows: Row[] };
  }, [filters]);

  const { data: result, isFetching: loading } = useAsync(fetcher, [fetcher]);
  const allRows = useMemo(() => result?.rows ?? [], [result]);

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

  // The สรุปสต็อก tab used to be a second route and a second table answering "ยอดรายหมวด"
  // off the same items. It is a fold over the rows already on screen, so it is one now —
  // one fetch, and the chart can never disagree with the table under it.
  const byCategory = useMemo(() => {
    const map = new Map<string, { categoryName: string; totalItems: number; totalQty: number; availableQty: number }>();
    for (const r of data) {
      const e = map.get(r.categoryName) ?? { categoryName: r.categoryName, totalItems: 0, totalQty: 0, availableQty: 0 };
      e.totalItems += 1;
      e.totalQty += r.totalQty;
      e.availableQty += r.availableQty;
      map.set(r.categoryName, e);
    }
    return [...map.values()].sort((a, b) => b.availableQty - a.availableQty);
  }, [data]);

  const priced = summary.pricedInStock;
  const columns = useMemo(() => buildColumns(spec), [spec]);
  const usedPricedQty = summary.usedQty - summary.usedUnpricedQty;

  return (
    <div className="space-y-4">
      <SectionTitle
        token={spec.token}
        icon={Boxes}
        title="มูลค่าคงคลัง"
        subtitle="ของที่เหลืออยู่กับของที่ออกไปแล้วคิดเป็นเงินเท่าไร แยกสิ้นเปลืองกับคงทน — และยังขาดราคาอีกกี่รายการ"
      />

      {/* ฝั่งเป็น state ในหน้านี้เอง ไม่ขึ้น URL: ?kind= ถูก tab ออกจากคลังจองไว้แล้ว และทุก tab
          ของหน้ารายงานถูก mount พร้อมกัน — ใช้ชื่อซ้ำจะเด้งข้ามกัน */}
      <Tabs value={side} onValueChange={(v) => setSide(v as Side)}>
        <TabsList variant="chip" className="w-full min-w-0 sm:w-auto">
          {(Object.keys(SIDES) as Side[]).map((k) => (
            <TabsTrigger key={k} value={k} className="min-w-0" style={chipStyle(SIDES[k].token)}>
              {SIDES[k].label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* side ถูกส่งไปกับ export ด้วย — ไฟล์ที่โหลดออกไปต้องเป็นฝั่งเดียวกับที่เห็นอยู่บนจอ ไม่ใช่ทั้งคลัง */}
      <ReportFilters
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
                  ? `คิดจาก ${usedPricedQty.toLocaleString()} จาก ${summary.usedQty.toLocaleString()} ${spec.usedUnit}`
                  : `ยังไม่รู้ราคาสักหน่วย (0 จาก ${summary.usedQty.toLocaleString()} ${spec.usedUnit})`,
          },
          {
            label: "ยังไม่ระบุราคา",
            value: summary.itemsWithoutCost.toLocaleString(),
            hint: "กรอกราคาตอนรับเข้าเพื่อให้มูลค่าครบ",
            token: summary.itemsWithoutCost > 0 ? "repair" : undefined,
          },
        ]}
      />
      <StockSummaryChart data={byCategory} />
      <ReportDataTable
        columns={columns}
        data={data}
        loading={loading}
        emptyMessage={spec.empty}
        token={spec.token}
      />
    </div>
  );
}
