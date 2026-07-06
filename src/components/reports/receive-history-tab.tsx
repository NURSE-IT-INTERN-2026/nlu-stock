"use client";

import { useEffect, useMemo, useState, useCallback, type ReactNode } from "react";
import { ReportFilters, type FilterValues, type FilterConfig } from "./report-filters";
import { ReportDataTable, type Column } from "./report-data-table";
import { ExportButtons } from "./export-buttons";
import { fmtDate } from "@/lib/format";
import { motion } from "motion/react";
import { ArrowDownToLine, PackageCheck, Undo2, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getReport } from "@/lib/api";
import { STATUS_LABELS, STATUS_PILLS } from "@/lib/constants";
import { cn } from "@/lib/utils";

type SubTab = "receive" | "in_use" | "return" | "repair";

const SUB_TABS: { value: SubTab; label: string; icon: typeof ArrowDownToLine }[] = [
  { value: "receive", label: "รับเข้าพัสดุ", icon: ArrowDownToLine },
  { value: "in_use", label: "คืนเข้าพัสดุ", icon: PackageCheck },
  { value: "return", label: "รับคืน", icon: Undo2 },
  { value: "repair", label: "รับซ่อม", icon: Wrench },
];

function StatusPill({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("text-[10px]", STATUS_PILLS[status] ?? "")}>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function ReceiveHistoryTab() {
  const [sub, setSub] = useState<SubTab>("receive");

  // Segmented control — lives inside each sub-tab's filter bar via `leading`.
  const subTabsEl = (
    <div className="inline-flex w-full items-center gap-1 overflow-x-auto rounded-lg bg-muted p-1 sm:w-auto">
      {SUB_TABS.map(({ value, label, icon: Icon }) => {
        const isActive = sub === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setSub(value)}
            className={cn(
              "relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {isActive && (
              <motion.span
                layoutId="receive-history-subtab"
                transition={{ type: "spring", stiffness: 450, damping: 35 }}
                className="absolute inset-0 rounded-md bg-background shadow-sm"
              />
            )}
            <Icon className="relative h-4 w-4 shrink-0" />
            <span className="relative">{label}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4">
      {sub === "receive" ? (
        <ReceiveLogTable leading={subTabsEl} />
      ) : sub === "in_use" ? (
        <StatusLogTable from="IN_USE" to="AVAILABLE" leading={subTabsEl} />
      ) : sub === "return" ? (
        <StatusLogTable from="ON_LOAN" leading={subTabsEl} />
      ) : (
        <StatusLogTable from="UNDER_REPAIR" to="AVAILABLE" leading={subTabsEl} />
      )}
    </div>
  );
}

// ── Generic report table: filter + data + pagination, shared by all sub-tabs ──
interface ReportTableProps<T extends { id: string }> {
  path: string;
  columns: Column<T>[];
  filterConfig: FilterConfig;
  exportType: string;
  exportFilters?: FilterValues; // extra params merged into export URL (from/to)
  extraParams?: Record<string, string | undefined>; // extra fetch params (from/to)
  leading?: ReactNode;
}

function ReportTable<T extends { id: string }>({
  path,
  columns,
  filterConfig,
  exportType,
  exportFilters,
  extraParams,
  leading,
}: ReportTableProps<T>) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const perPage = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = {
      page: String(page),
      perPage: String(perPage),
    };
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    if (filters.staffId) params.staffId = filters.staffId;
    if (filters.categoryId) params.categoryId = filters.categoryId;
    if (extraParams) {
      for (const [k, v] of Object.entries(extraParams)) {
        if (v) params[k] = v;
      }
    }
    const json = (await getReport(path, params)) as { records: T[]; total: number };
    setData(json.records);
    setTotal(json.total);
    setLoading(false);
  }, [filters, page, path, extraParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-4">
      <ReportFilters
        config={filterConfig}
        values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
        actions={<ExportButtons reportType={exportType} filters={{ ...filters, ...exportFilters }} />}
        leading={leading}
      />
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

const COMMON_FILTERS: FilterConfig = { dateRange: true, staff: true, categories: true };

// ── รับเข้าพัสดุ: ReceiveRecord ──
interface ReceiveRow {
  id: string;
  itemCode: string;
  itemName: string;
  category: string;
  quantity: number;
  lotNumber: string;
  expiryDate: string | null;
  receiverName: string;
  receivedAt: string;
}

const receiveColumns: Column<ReceiveRow>[] = [
  { key: "receivedAt", header: "Date", render: (r) => fmtDate(new Date(r.receivedAt), "dd MMM yyyy HH:mm") },
  { key: "itemCode", header: "Code" },
  { key: "itemName", header: "Item" },
  { key: "category", header: "Category" },
  { key: "lotNumber", header: "Lot" },
  { key: "quantity", header: "Qty" },
  { key: "expiryDate", header: "Expiry", render: (r) => (r.expiryDate ? fmtDate(new Date(r.expiryDate), "dd MMM yyyy") : "—") },
  { key: "receiverName", header: "Receiver" },
];

function ReceiveLogTable({ leading }: { leading?: ReactNode }) {
  return <ReportTable<ReceiveRow> path="receive-history" columns={receiveColumns} filterConfig={COMMON_FILTERS} exportType="receive-history" leading={leading} />;
}

// ── คืนเข้า / รับคืน / รับซ่อม: ItemStatusLog ──
interface StatusRow {
  id: string;
  itemCode: string;
  itemName: string;
  category: string;
  subCode: string | null;
  previousStatus: string;
  newStatus: string;
  reason: string;
  changerName: string;
  changedAt: string;
}

const statusColumns: Column<StatusRow>[] = [
  { key: "changedAt", header: "Date", render: (r) => fmtDate(new Date(r.changedAt), "dd MMM yyyy HH:mm") },
  { key: "itemCode", header: "Code" },
  { key: "itemName", header: "Item" },
  { key: "subCode", header: "Sub-code", render: (r) => r.subCode ?? "—" },
  { key: "previousStatus", header: "From", render: (r) => <StatusPill status={r.previousStatus} /> },
  { key: "newStatus", header: "To", render: (r) => <StatusPill status={r.newStatus} /> },
  { key: "reason", header: "Reason" },
  { key: "changerName", header: "Changer" },
];

function StatusLogTable({ from, to, leading }: { from: string; to?: string; leading?: ReactNode }) {
  // Memoized so identity is stable across re-renders — otherwise ReportTable's
  // fetchData (useCallback deps on extraParams) would change every render,
  // re-triggering its effect and refetching in an unbounded loop.
  const extraParams = useMemo(() => ({ from, to }), [from, to]);
  const exportFilters = useMemo(() => ({ from, to }), [from, to]);
  return (
    <ReportTable<StatusRow>
      path="status-log"
      columns={statusColumns}
      filterConfig={COMMON_FILTERS}
      exportType="status-log"
      extraParams={extraParams}
      exportFilters={exportFilters}
      leading={leading}
    />
  );
}
