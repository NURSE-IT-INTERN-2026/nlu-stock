"use client";

import { useState, useCallback } from "react";
import { ReportFilters, type FilterValues, type FilterConfig } from "./report-filters";
import { ReportDataTable, type Column } from "./report-data-table";
import { ExportButtons } from "./export-buttons";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/format";
import { getReport } from "@/lib/api";
import { Pagination } from "@/components/shared/pagination";
import { PAGE_SIZE } from "@/lib/pagination-constants";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { usePagedList } from "@/hooks/use-paged-list";
import { MAINT_TYPE_LABELS, MAINT_RESULT_LABELS, labelFor, type MaintenanceType, type MaintenanceResult } from "@/lib/constants";

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
  repairVenue: "INTERNAL" | "EXTERNAL" | null;
  performer: string;
  performedAt: string;
}

const columns: Column<Row>[] = [
  {
    key: "performedAt",
    header: "Date",
    render: (r) => fmtDate(new Date(r.performedAt), "dd MMM yyyy"),
  },
  { key: "itemCode", header: "Code" },
  { key: "itemName", header: "Item" },
  {
    key: "type",
    header: "Type",
    render: (r) => <Badge variant="outline">{labelFor(MAINT_TYPE_LABELS, r.type as MaintenanceType)}</Badge>,
  },
  {
    key: "result",
    header: "Result",
    render: (r) => <Badge variant="secondary">{labelFor(MAINT_RESULT_LABELS, r.result as MaintenanceResult)}</Badge>,
  },
  { key: "issue", header: "Issue" },
  {
    key: "cost",
    header: "Cost",
    render: (r) => (r.cost > 0 ? `฿${r.cost.toLocaleString()}` : "—"),
  },
  { key: "repairVenue", header: "ประเภทซ่อม", render: (r) => (r.repairVenue ? (r.repairVenue === "EXTERNAL" ? "ภายนอก" : "ภายใน") : "—") },
  { key: "performer", header: "By" },
];

export function MaintenanceHistoryTab() {
  const isMobile = useIsMobile();
  const [filters, setFilters] = useState<FilterValues>({});
  const perPage = PAGE_SIZE.DEFAULT;

  const fetchPage = useCallback(async (p: number) => {
    const params: Record<string, string> = {
      page: String(p),
      perPage: String(perPage),
    };
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    if (filters.maintenanceType) params.maintenanceType = filters.maintenanceType;
    const json = (await getReport("maintenance-history", params)) as { records: Row[]; total: number };
    return { items: json.records, total: json.total };
  }, [filters, perPage]);

  const {
    items: data, total, page, totalPages, loading, isLoadingMore, hasNext, loadMore, setPage,
  } = usePagedList<Row>({ fetchPage, pageSize: perPage, isMobile });

  return (
    <div className="space-y-4 pb-2">
      <ReportFilters
        config={filterConfig}
        values={filters}
        onChange={setFilters}
        actions={<ExportButtons reportType="maintenance-history" filters={filters} />}
      />
      <ReportDataTable
        columns={columns}
        data={data}
        loading={loading}
        pageSize={isMobile ? Math.max(1, data.length) : perPage}
      />
      {isMobile ? (
        data.length > 0 && (
          <Pagination
            mode="loadMore"
            shown={data.length}
            total={total}
            hasMore={hasNext}
            isLoading={isLoadingMore}
            onLoadMore={loadMore}
          />
        )
      ) : (
        <>
          <p className="text-xs text-muted-foreground py-1">
            Page {page} of {totalPages} ({total} records)
          </p>
          <Pagination page={page} total={total} pageSize={perPage} onChange={setPage} />
        </>
      )}
    </div>
  );
}
