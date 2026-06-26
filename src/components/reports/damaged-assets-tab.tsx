"use client";

import { useEffect, useState, useCallback } from "react";
import { ReportFilters, type FilterValues, type FilterConfig } from "./report-filters";
import { ReportDataTable, type Column } from "./report-data-table";
import { ExportButtons } from "./export-buttons";
import { Badge } from "@/components/ui/badge";
import { getReport } from "@/lib/api";
import { STATUS_LABELS, STATUS_VARIANTS } from "@/lib/constants";

const filterConfig: FilterConfig = {
  dateRange: true,
  statusOptions: [
    { value: "DAMAGED", label: "ชำรุด" },
    { value: "UNDER_REPAIR", label: "ซ่อมบำรุง" },
    { value: "DISPOSED", label: "จำหน่าย" },
    { value: "LOST", label: "สูญหาย" },
  ],
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
    render: (r) => <Badge variant={STATUS_VARIANTS[r.status] ?? "default"}>{STATUS_LABELS[r.status] ?? r.status.replace(/_/g, " ")}</Badge>,
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
    const params: Record<string, string> = {};
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    if (filters.status) params.status = filters.status;
    const json = (await getReport("damaged-assets", params)) as { items: Row[] };
    setData(json.items);
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
        actions={<ExportButtons reportType="damaged-assets" filters={filters} />}
      />
      <ReportDataTable columns={columns} data={data} loading={loading} />
    </div>
  );
}
