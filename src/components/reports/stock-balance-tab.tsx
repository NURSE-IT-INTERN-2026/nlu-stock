"use client";

import { useEffect, useState, useCallback } from "react";
import { ReportFilters, type FilterValues, type FilterConfig } from "./report-filters";
import { ReportDataTable, type Column } from "./report-data-table";
import { ExportButtons } from "./export-buttons";
import { getReport } from "@/lib/api";

const filterConfig: FilterConfig = { profiles: true, categories: true };

interface Row {
  code: string;
  name: string;
  categoryName: string;
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
  { key: "code", header: "รหัส" },
  { key: "name", header: "ชื่อ" },
  { key: "categoryName", header: "หมวด" },
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
  const [data, setData] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterValues>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (filters.categoryId) params.categoryId = filters.categoryId;
    else if (filters.profileId) params.profileId = filters.profileId;
    const res = (await getReport("stock-balance", params)) as { rows: Row[]; summary: Summary };
    setData(res.rows);
    setSummary(res.summary);
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-4">
      <ReportFilters
        config={filterConfig}
        values={filters}
        onChange={setFilters}
        actions={<ExportButtons reportType="stock-balance" filters={filters} />}
      />
      {summary && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">มูลค่าคงเหลือรวม</p>
            <p className="text-lg font-bold">{baht(summary.totalValue)}</p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">รายการที่มีสต็อก</p>
            <p className="text-lg font-bold">{summary.totalAvailableItems.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">ยังไม่ระบุราคา</p>
            <p className="text-lg font-bold">{summary.itemsWithoutCost.toLocaleString()}</p>
          </div>
        </div>
      )}
      <ReportDataTable columns={columns} data={data} loading={loading} />
    </div>
  );
}
