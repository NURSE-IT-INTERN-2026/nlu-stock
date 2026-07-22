"use client";

import { useEffect, useState, useCallback } from "react";
import { ReportFilters, type FilterValues, type FilterConfig } from "./report-filters";
import { ReportDataTable, type Column } from "./report-data-table";
import { ExportButtons } from "./export-buttons";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/format";
import { getReport } from "@/lib/api";

const filterConfig: FilterConfig = { dateRange: true, locations: true };

interface Row {
  id: string;
  code: string;
  name: string;
  model: string;
  categoryName: string;
  location: string;
  lastMaintenanceDate: string;
  nextMaintenanceDate: string;
  maintenanceCycleMonths: number;
  maintenanceStatus: string;
}

const statusLabel: Record<string, { label: string; variant: "destructive" | "secondary" | "default" }> = {
  overdue: { label: "เลยรอบ", variant: "destructive" },
  "due-soon": { label: "ใกล้ถึงรอบ", variant: "secondary" },
  normal: { label: "ปกติ", variant: "default" },
};

const columns: Column<Row>[] = [
  { key: "code", header: "Code" },
  { key: "name", header: "Item" },
  {
    key: "maintenanceStatus",
    header: "Status",
    render: (r) => {
      const s = statusLabel[r.maintenanceStatus] ?? { label: r.maintenanceStatus, variant: "default" as const };
      return <Badge variant={s.variant}>{s.label}</Badge>;
    },
  },
  {
    key: "nextMaintenanceDate",
    header: "Next Maintenance",
    render: (r) => fmtDate(new Date(r.nextMaintenanceDate), "dd MMM yyyy"),
  },
  { key: "maintenanceCycleMonths", header: "Cycle (mo)" },
  {
    key: "lastMaintenanceDate",
    header: "Last Done",
    render: (r) => (r.lastMaintenanceDate ? fmtDate(new Date(r.lastMaintenanceDate), "dd MMM yyyy") : "—"),
  },
  { key: "location", header: "Location" },
];

export function MaintenanceScheduleTab() {
  const [data, setData] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterValues>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    if (filters.locationId) params.locationId = filters.locationId;
    const json = (await getReport("maintenance-schedule", params)) as { items: Row[] };
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
        actions={<ExportButtons reportType="maintenance-schedule" filters={filters} />}
      />
      <ReportDataTable columns={columns} data={data} loading={loading} />
    </div>
  );
}
