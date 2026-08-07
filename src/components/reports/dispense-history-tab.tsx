"use client";

import { useState, useCallback, useMemo } from "react";
import { ReportFilters, type FilterValues, type FilterConfig } from "./report-filters";
import { ReportDataTable, type Column } from "./report-data-table";
import { ExportButtons } from "./export-buttons";
import { fmtDate, TH_DATE, TH_DATETIME } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { getReport } from "@/lib/api";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Pagination } from "@/components/shared/pagination";
import { PAGE_SIZE } from "@/lib/pagination-constants";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { usePagedList } from "@/hooks/use-paged-list";

const filterConfig: FilterConfig = {
  dateRange: true,
  staff: true,
  usageTypes: true,
};

interface Row {
  id: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  resolvedQty: number;
  staffName: string;
  usageTypeLabel: string;
  lotNumber: string;
  dispensedAt: string;
  returnedAt: string | null;
  returnCondition: "AVAILABLE" | "DAMAGED" | "LOST" | null;
  notes: string;
  loanGroupId: string | null;
  recipient: string | null;
  isLoanable: boolean;
}

interface LoanGroup {
  key: string;
  records: Row[];
}

const RETURN_COND: Record<"AVAILABLE" | "DAMAGED" | "LOST", { label: string; cls: string }> = {
  AVAILABLE: { label: "คืน-ปกติ", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  DAMAGED: { label: "คืน-ชำรุด", cls: "bg-red-100 text-red-800 border-red-200" },
  LOST: { label: "คืน-สูญหาย", cls: "bg-slate-200 text-slate-700 border-slate-300" },
};

function StatusBadge({ r }: { r: Row }) {
  if (!r.returnedAt) return <Badge>เบิกแล้ว</Badge>;
  if (r.returnCondition && RETURN_COND[r.returnCondition]) {
    const c = RETURN_COND[r.returnCondition];
    return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${c.cls}`}>{c.label}</span>;
  }
  return <Badge variant="secondary">คืนแล้ว</Badge>;
}

const columns: Column<Row>[] = [
  {
    key: "dispensedAt",
    header: "Date",
    render: (r) => fmtDate(new Date(r.dispensedAt), TH_DATETIME),
  },
  { key: "itemCode", header: "Code" },
  { key: "itemName", header: "Item" },
  { key: "quantity", header: "Qty" },
  { key: "staffName", header: "Staff" },
  { key: "usageTypeLabel", header: "Usage" },
  { key: "returnedAt", header: "Status", render: (r) => <StatusBadge r={r} /> },
];

// Grouping stays on the client, but the page it runs over is now a page of whole loan
// events (api/reports/dispense-history pages by group, not by row), so a card can no longer
// be built from half a loan and report half its totals as the whole.
// Only borrowable (COUNT/ITEM) records group into a loan card with due/return
// status — CONSUMABLE dispenses never come back, so they list flat instead.
function groupRecords(records: Row[]): LoanGroup[] {
  const map = new Map<string, LoanGroup>();
  for (const r of records) {
    if (!r.isLoanable) continue;
    const key = r.loanGroupId ?? r.id;
    const g = map.get(key);
    if (g) g.records.push(r);
    else map.set(key, { key, records: [r] });
  }
  return [...map.values()];
}

function loanStatus(g: LoanGroup): { label: string; cls: string } {
  const total = g.records.reduce((s, r) => s + r.quantity, 0);
  const resolved = g.records.reduce((s, r) => s + r.resolvedQty, 0);
  if (resolved >= total) return { label: "คืนครบ", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" };
  if (resolved > 0) return { label: `คืนบางส่วน ${resolved}/${total}`, cls: "bg-amber-100 text-amber-800 border-amber-200" };
  return { label: "ยังไม่คืน", cls: "bg-slate-100 text-slate-700 border-slate-200" };
}

function LoanGroups({ groups }: { groups: LoanGroup[] }) {
  return (
    <div className="space-y-2">
      {groups.map((g) => {
        const head = g.records[0];
        const itemCount = g.records.length;
        const totalQty = g.records.reduce((s, r) => s + r.quantity, 0);
        const status = loanStatus(g);
        return (
          <details key={g.key} className="group rounded-lg border bg-card overflow-hidden">
            <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm list-none [&::-webkit-details-marker]:hidden hover:bg-muted/50">
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              <span className="font-medium">{fmtDate(new Date(head.dispensedAt), TH_DATETIME)}</span>
              <span className={cn("ml-auto inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", status.cls)}>
                {status.label}
              </span>
              <span className="w-full text-xs text-muted-foreground break-words">
                {head.recipient ?? "ไม่ระบุผู้ยืม"} · {head.staffName} · {itemCount} รายการ · {totalQty} หน่วย
              </span>
            </summary>
            <div className="border-t">
              <ReportDataTable columns={columns} data={g.records} pageSize={g.records.length} />
            </div>
          </details>
        );
      })}
    </div>
  );
}

export function DispenseHistoryTab() {
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
    if (filters.staffId) params.staffId = filters.staffId;
    if (filters.usageType) params.usageType = filters.usageType;
    const json = (await getReport("dispense-history", params)) as { records: Row[]; total: number };
    return { items: json.records, total: json.total };
  }, [filters, perPage]);

  const {
    items: data, total, page, totalPages, loading, isLoadingMore, hasNext, loadMore, setPage,
  } = usePagedList<Row>({ fetchPage, pageSize: perPage, isMobile });

  const groups = useMemo(() => groupRecords(data), [data]);
  const flatRows = useMemo(() => data.filter((r) => !r.isLoanable), [data]);
  // `total` from the API counts loan events, so the "shown" half of the mobile counter has
  // to be events too — data.length is rows, and a page of 20 loans is far more than 20 rows.
  const shownEvents = useMemo(
    () => new Set(data.map((r) => r.loanGroupId ?? r.id)).size,
    [data],
  );

  return (
    <div className="space-y-4 pb-2">
      <ReportFilters
        config={filterConfig}
        values={filters}
        onChange={setFilters}
        actions={<ExportButtons reportType="dispense-history" filters={filters} />}
      />
      {loading ? (
        <ReportDataTable columns={columns} data={[]} loading pageSize={perPage} />
      ) : groups.length === 0 && flatRows.length === 0 ? (
        <ReportDataTable columns={columns} data={[]} pageSize={perPage} />
      ) : (
        <div className="space-y-4">
          {groups.length > 0 && <LoanGroups groups={groups} />}
          {flatRows.length > 0 && (
            <ReportDataTable columns={columns} data={flatRows} pageSize={flatRows.length} />
          )}
        </div>
      )}
      {isMobile ? (
        data.length > 0 && (
          <Pagination
            mode="loadMore"
            shown={shownEvents}
            total={total}
            hasMore={hasNext}
            isLoading={isLoadingMore}
            onLoadMore={loadMore}
          />
        )
      ) : (
        <>
          <p className="text-xs text-muted-foreground py-1">
            หน้า {page} จาก {totalPages} ({total} ครั้งการเบิก)
          </p>
          <Pagination page={page} total={total} pageSize={perPage} onChange={setPage} />
        </>
      )}
    </div>
  );
}
