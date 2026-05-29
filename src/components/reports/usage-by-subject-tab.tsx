"use client";

import { useEffect, useState, useCallback } from "react";
import { ReportFilters, type FilterValues, type FilterConfig } from "./report-filters";
import { ReportDataTable, type Column } from "./report-data-table";
import { ExportButtons } from "./export-buttons";
import { UsageBySubjectChart } from "./charts/usage-by-subject-chart";

const filterConfig: FilterConfig = { dateRange: true, categories: true };

interface Row {
  usageType: string | null;
  label: string;
  totalQuantity: number;
}

const columns: Column<Row>[] = [
  { key: "label", header: "Type" },
  { key: "totalQuantity", header: "Total Qty" },
];

export function UsageBySubjectTab() {
  const [data, setData] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterValues>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.categoryId) params.set("categoryId", filters.categoryId);
    const res = await fetch(`/api/reports/usage-by-subject?${params.toString()}`);
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
        <ExportButtons reportType="usage-by-subject" filters={filters} />
      </div>
      <UsageBySubjectChart data={data} />
      <ReportDataTable columns={columns} data={data} loading={loading} />
    </div>
  );
}
