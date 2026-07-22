"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { ReportFilters, type FilterValues, type FilterConfig } from "./report-filters";
import { ReportDataTable, type Column } from "./report-data-table";
import { Pagination } from "@/components/shared/pagination";
import { PAGE_SIZE } from "@/lib/pagination-constants";
import { ExportButtons } from "./export-buttons";
import { fmtDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { getReport } from "@/lib/api";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const filterConfig: FilterConfig = {
  dateRange: true,
  staff: true,
};

interface Row {
  id: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  resolvedQty: number;
  staffName: string;
  dispensedAt: string;
  dueAt: string | null;
  recipient: string | null;
  loanGroupId: string | null;
}

interface LoanGroup {
  key: string;
  records: Row[];
}

const PER_PAGE = PAGE_SIZE.COMPACT;

function outstandingOf(r: Row) {
  return r.quantity - r.resolvedQty;
}

// due status: overdue (past due) / near (≤3 days) / none
function dueAlert(dueAt: string | null): { label: string; cls: string } | null {
  if (!dueAt) return null;
  const days = (new Date(dueAt).getTime() - Date.now()) / 86400000;
  if (days < 0) return { label: "เกินกำหนด", cls: "bg-red-100 text-red-800 border-red-200" };
  if (days <= 3) return { label: "ใกล้ครบกำหนด", cls: "bg-amber-100 text-amber-800 border-amber-200" };
  return null;
}

const columns: Column<Row>[] = [
  { key: "itemCode", header: "Code" },
  { key: "itemName", header: "Item" },
  {
    key: "quantity",
    header: "Qty",
    render: (r) => (
      <span className="tabular-nums">
        {outstandingOf(r)}/{r.quantity}
      </span>
    ),
  },
  { key: "staffName", header: "Staff" },
];

function groupRecords(records: Row[]): LoanGroup[] {
  const map = new Map<string, LoanGroup>();
  for (const r of records) {
    const key = r.loanGroupId ?? r.id;
    const g = map.get(key);
    if (g) g.records.push(r);
    else map.set(key, { key, records: [r] });
  }
  return [...map.values()];
}

function LoanGroups({ groups }: { groups: LoanGroup[] }) {
  return (
    <div className="space-y-2">
      {groups.map((g) => {
        const head = g.records[0];
        const itemCount = g.records.length;
        const outstanding = g.records.reduce((s, r) => s + outstandingOf(r), 0);
        const alert = dueAlert(head.dueAt);
        return (
          <details key={g.key} className="group rounded-lg border bg-card overflow-hidden">
            <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm list-none [&::-webkit-details-marker]:hidden hover:bg-muted/50">
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              <span className="font-medium">{fmtDate(new Date(head.dispensedAt), "dd MMM yyyy HH:mm")}</span>
              {alert ? (
                <span className={cn("ml-auto inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", alert.cls)}>
                  {alert.label}
                </span>
              ) : (
                <Badge variant="secondary" className="ml-auto text-xs">ยังไม่คืน</Badge>
              )}
              <span className="w-full text-xs text-muted-foreground break-words">
                {head.recipient ?? "ไม่ระบุผู้ยืม"} · {head.staffName} · {itemCount} รายการ · ค้าง {outstanding} หน่วย
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

export function OutstandingLoansTab() {
  const [data, setData] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      if (filters.staffId) params.staffId = filters.staffId;
      const json = (await getReport("outstanding-loans", params)) as { records: Row[] };
      setData(json.records);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const groups = useMemo(() => groupRecords(data), [data]);
  const totalPages = Math.max(1, Math.ceil(groups.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pagedGroups = groups.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  return (
    <div className="space-y-4">
      <ReportFilters
        config={filterConfig}
        values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
        actions={<ExportButtons reportType="outstanding-loans" filters={filters} />}
      />
      {loading ? (
        <ReportDataTable columns={columns} data={[]} loading pageSize={PER_PAGE} />
      ) : groups.length === 0 ? (
        <ReportDataTable columns={columns} data={[]} pageSize={PER_PAGE} emptyMessage="ไม่มีรายการยืมค้าง" />
      ) : (
        <LoanGroups groups={pagedGroups} />
      )}
      {totalPages > 1 && (
        <div className="px-2">
          <p className="text-xs text-muted-foreground py-1">
            {groups.length} รายการยืม · {data.reduce((s, r) => s + outstandingOf(r), 0)} หน่วยค้าง
          </p>
          <Pagination page={currentPage} total={groups.length} pageSize={PER_PAGE} onChange={setPage} />
        </div>
      )}
    </div>
  );
}
