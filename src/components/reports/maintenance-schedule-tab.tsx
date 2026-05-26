"use client";

import { useEffect, useState, useCallback } from "react";
import { ReportFilters, type FilterValues, type FilterConfig } from "./report-filters";
import { ReportDataTable, type Column } from "./report-data-table";
import { ExportButtons } from "./export-buttons";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

const filterConfig: FilterConfig = { dateRange: true, locations: true };

interface Row {
  id: string;
  code: string;
  name: string;
  serialNumber: string;
  model: string;
  categoryName: string;
  location: string;
  lastMaintenanceDate: string;
  nextMaintenanceDate: string;
  maintenanceCycleMonths: number;
  maintenanceStatus: string;
}

const statusLabel: Record<string, { label: string; variant: "destructive" | "secondary" | "default" }> = {
  overdue: { label: "Overdue", variant: "destructive" },
  "due-soon": { label: "Due Soon", variant: "secondary" },
  normal: { label: "Normal", variant: "default" },
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
    render: (r) => format(new Date(r.nextMaintenanceDate), "dd MMM yyyy"),
  },
  { key: "maintenanceCycleMonths", header: "Cycle (mo)" },
  {
    key: "lastMaintenanceDate",
    header: "Last Done",
    render: (r) => (r.lastMaintenanceDate ? format(new Date(r.lastMaintenanceDate), "dd MMM yyyy") : "—"),
  },
  { key: "location", header: "Location" },
];

export function MaintenanceScheduleTab() {
  const [data, setData] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterValues>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.locationId) params.set("locationId", filters.locationId);
    const res = await fetch(`/api/reports/maintenance-schedule?${params.toString()}`);
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
        <ExportButtons reportType="maintenance-schedule" filters={filters} />
      </div>
      <ReportDataTable columns={columns} data={data} loading={loading} />
    </div>
  );
}
