"use client";

import { useState, useCallback, useMemo } from "react";
import { ReportFilters, type FilterValues, type FilterConfig } from "./report-filters";
import { ReportDataTable, type Column } from "./report-data-table";
import { ReportSummary } from "./report-summary";
import { ExportButtons } from "./export-buttons";
import { StockSummaryChart } from "./charts/stock-summary-chart";
import { getReport } from "@/lib/api";
import { useAsync } from "@/hooks/use-async";

const filterConfig: FilterConfig = { profiles: true, categories: true };

interface Row {
  code: string;
  name: string;
  categoryName: string;
  totalQty: number;
  availableQty: number;
  unitName: string;
  unitCost: number | null;
  value: number;
}

interface Summary {
  totalValue: number;
  totalAvailableItems: number;
  itemsWithoutCost: number;
}

const baht = (n: number) => `฿${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const columns: Column<Row>[] = [
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
];

export function StockBalanceTab() {
  const [filters, setFilters] = useState<FilterValues>({});

  const fetcher = useCallback(async () => {
    const params: Record<string, string> = {};
    if (filters.categoryId) params.categoryId = filters.categoryId;
    else if (filters.profileId) params.profileId = filters.profileId;
    return (await getReport("stock-balance", params)) as { rows: Row[]; summary: Summary };
  }, [filters]);

  const { data: result, isFetching: loading } = useAsync(fetcher, [fetcher]);
  const data = useMemo(() => result?.rows ?? [], [result]);
  const summary = result?.summary ?? null;

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

  // Derived from the rows the table already has — no extra summary field to keep in sync.
  const pricedInStock = data.filter((r) => r.availableQty > 0 && r.unitCost !== null).length;

  return (
    <div className="space-y-4">
      <ReportFilters
        config={filterConfig}
        values={filters}
        onChange={setFilters}
        actions={<ExportButtons reportType="stock-balance" filters={filters} />}
      />
      {summary && (
        <ReportSummary
          stats={[
            {
              label: "มูลค่าคงเหลือรวม",
              value: baht(summary.totalValue),
              /* The sum can only count rows that carry a cost, and most don't — durables need
                 purchasePrice, consumables need unitCost on a lot, both optional. Without this
                 line the headline reads as the value of the whole storeroom when it is the value
                 of the handful of items somebody priced. The ยังไม่ระบุราคา card beside it is
                 the same fact from the other side; this makes the connection explicit. */
              hint: `คิดจาก ${pricedInStock.toLocaleString()} จาก ${summary.totalAvailableItems.toLocaleString()} รายการที่มีสต็อก`,
            },
            {
              label: "รายการที่มีสต็อก",
              value: summary.totalAvailableItems.toLocaleString(),
              hint: `จากทั้งหมด ${data.length.toLocaleString()} รายการ`,
            },
            {
              label: "ยังไม่ระบุราคา",
              value: summary.itemsWithoutCost.toLocaleString(),
              hint: "กรอกราคาตอนรับเข้าเพื่อให้มูลค่าครบ",
              tone: summary.itemsWithoutCost > 0 ? "warning" : "default",
            },
          ]}
        />
      )}
      <StockSummaryChart data={byCategory} />
      <ReportDataTable
        columns={columns}
        data={data}
        loading={loading}
        emptyMessage="ไม่พบพัสดุตามตัวกรอง"
      />
    </div>
  );
}
