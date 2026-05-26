"use client";

import { useEffect, useState, useCallback } from "react";
import { ReportFilters, type FilterValues, type FilterConfig } from "./report-filters";
import { ReportDataTable, type Column } from "./report-data-table";
import { ExportButtons } from "./export-buttons";
import { StockSummaryChart } from "./charts/stock-summary-chart";

const filterConfig: FilterConfig = { categories: true };

interface Row {
  categoryId: string;
  categoryName: string;
  totalItems: number;
  totalQty: number;
  availableQty: number;
}

const columns: Column<Row>[] = [
  { key: "categoryName", header: "Category" },
  { key: "totalItems", header: "Items" },
  { key: "totalQty", header: "Total Qty" },
  { key: "availableQty", header: "Available" },
];

export function StockSummaryTab() {
  const [data, setData] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterValues>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.categoryId) params.set("categoryId", filters.categoryId);
    const res = await fetch(`/api/reports/stock-summary?${params.toString()}`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <ReportFilters config={filterConfig} values={filters} onChange={setFilters} />
        <ExportButtons reportType="stock-summary" filters={filters} />
      </div>
      <StockSummaryChart data={data} />
      <ReportDataTable columns={columns} data={data} loading={loading} />
    </div>
  );
}
