"use client";

import { useEffect, useState, useCallback } from "react";
import { ReportFilters, type FilterValues, type FilterConfig } from "./report-filters";
import { ReportDataTable, type Column } from "./report-data-table";
import { ExportButtons } from "./export-buttons";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

const filterConfig: FilterConfig = { dateRange: true, maintenanceType: true };

interface Row {
  id: string;
  itemCode: string;
  itemName: string;
  categoryName: string;
  type: string;
  result: string;
  issue: string;
  cost: number;
  performer: string;
  performedAt: string;
}

const columns: Column<Row>[] = [
  {
    key: "performedAt",
    header: "Date",
    render: (r) => format(new Date(r.performedAt), "dd MMM yyyy"),
  },
  { key: "itemCode", header: "Code" },
  { key: "itemName", header: "Item" },
  {
    key: "type",
    header: "Type",
    render: (r) => <Badge variant="outline">{r.type}</Badge>,
  },
  {
    key: "result",
    header: "Result",
    render: (r) => <Badge variant="secondary">{r.result.replace(/_/g, " ")}</Badge>,
  },
  { key: "issue", header: "Issue" },
  {
    key: "cost",
    header: "Cost",
    render: (r) => (r.cost > 0 ? `฿${r.cost.toLocaleString()}` : "—"),
  },
  { key: "performer", header: "By" },
];

export function MaintenanceHistoryTab() {
  const [data, setData] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const perPage = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.maintenanceType) params.set("maintenanceType", filters.maintenanceType);
    params.set("page", String(page));
    params.set("perPage", String(perPage));
    const res = await fetch(`/api/reports/maintenance-history?${params.toString()}`);
    const json = await res.json();
    setData(json.records);
    setTotal(json.total);
    setLoading(false);
  }, [filters, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <ReportFilters config={filterConfig} values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
        <ExportButtons reportType="maintenance-history" filters={filters} />
      </div>
      <ReportDataTable columns={columns} data={data} loading={loading} pageSize={perPage} />
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground px-2">
          <span>
            Page {page} of {totalPages} ({total} records)
          </span>
          <div className="flex gap-2">
            <button
              className="px-3 py-1 border rounded disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Prev
            </button>
            <button
              className="px-3 py-1 border rounded disabled:opacity-40"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
