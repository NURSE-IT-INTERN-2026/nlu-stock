"use client";

import { useEffect, useState, useCallback } from "react";
import { ReportFilters, type FilterValues, type FilterConfig } from "./report-filters";
import { ReportDataTable, type Column } from "./report-data-table";
import { ExportButtons } from "./export-buttons";
import { Badge } from "@/components/ui/badge";

const filterConfig: FilterConfig = {
  dateRange: true,
  statusOptions: [
    { value: "DAMAGED", label: "Damaged" },
    { value: "UNDER_REPAIR", label: "Under Repair" },
    { value: "DISPOSED", label: "Disposed" },
    { value: "LOST", label: "Lost" },
  ],
};

const statusColors: Record<string, "destructive" | "secondary" | "default" | "outline"> = {
  DAMAGED: "destructive",
  UNDER_REPAIR: "secondary",
  DISPOSED: "outline",
  LOST: "destructive",
};

interface Row {
  id: string;
  code: string;
  name: string;
  status: string;
  categoryName: string;
  location: string;
  reason: string;
  changedAt: string;
}

const columns: Column<Row>[] = [
  { key: "code", header: "Code" },
  { key: "name", header: "Item" },
  {
    key: "status",
    header: "Status",
    render: (r) => <Badge variant={statusColors[r.status] ?? "default"}>{r.status.replace(/_/g, " ")}</Badge>,
  },
  { key: "categoryName", header: "Category" },
  { key: "location", header: "Location" },
  { key: "reason", header: "Reason" },
];

export function DamagedAssetsTab() {
  const [data, setData] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterValues>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.status) params.set("status", filters.status);
    const res = await fetch(`/api/reports/damaged-assets?${params.toString()}`);
    const json = await res.json();
    setData(json.items);
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <ReportFilters config={filterConfig} values={filters} onChange={setFilters} />
        <ExportButtons reportType="damaged-assets" filters={filters} />
      </div>
      <ReportDataTable columns={columns} data={data} loading={loading} />
    </div>
  );
}
