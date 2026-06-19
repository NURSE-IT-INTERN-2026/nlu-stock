"use client";

import { useEffect, useState, useCallback } from "react";
import { ReportFilters, type FilterValues, type FilterConfig } from "./report-filters";
import { ReportDataTable, type Column } from "./report-data-table";
import { ExportButtons } from "./export-buttons";
import { StockSummaryChart } from "./charts/stock-summary-chart";
import { TopDispenseChart } from "@/components/dashboard/top-dispense-chart";
import { UsageBySubjectChart } from "@/components/dashboard/usage-by-subject-chart";
import { useTopDispense, useUsageBySubject } from "@/hooks/use-dashboard-queries";
import { getReport } from "@/lib/api";

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

  const topQuery = useTopDispense(filters.categoryId);
  const usageQuery = useUsageBySubject(filters.categoryId);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (filters.categoryId) params.categoryId = filters.categoryId;
    const json = (await getReport("stock-summary", params)) as Row[];
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
      <div className="grid gap-4 md:grid-cols-2">
        <TopDispenseChart data={topQuery.data ?? []} />
        <UsageBySubjectChart data={usageQuery.data ?? []} />
      </div>
      <ReportDataTable columns={columns} data={data} loading={loading} />
    </div>
  );
}
