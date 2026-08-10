"use client";

import { useMemo, useState, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  ReportFilters, defaultDateFilters, periodLabel,
  type FilterValues, type FilterConfig,
} from "./report-filters";
import { ReportDataTable, type Column } from "./report-data-table";
import { ReportSummary, type SummaryStat } from "./report-summary";
import { ExportButtons } from "./export-buttons";
import { fmtDate, TH_DATE, TH_DATETIME } from "@/lib/format";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { getReport } from "@/lib/api";
import { STATUS_LABELS, STATUS_PILLS, type ItemStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Pagination } from "@/components/shared/pagination";
import { PAGE_SIZE } from "@/lib/pagination-constants";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { usePagedList } from "@/hooks/use-paged-list";

type SubTab = "receive" | "in_use" | "return" | "repair";

// ชื่อเดียวกับ tabs ใน /receive เป๊ะ. เดิมหน้านี้เรียกสิ่งเดียวกันว่า "รับซ่อม" ขณะที่หน้าทำงาน
// เรียก "รับคืนจากส่งซ่อม" — คนละความหมายในหัวคนอ่าน ทั้งที่เป็นแถวชุดเดียวกัน.
const SUB_TABS: { value: SubTab; label: string }[] = [
  { value: "receive", label: "นำเข้าคลัง" },
  { value: "in_use", label: "คืนเข้าคลัง" },
  { value: "return", label: "รับคืนจากใบยืม" },
  { value: "repair", label: "รับคืนจากส่งซ่อม" },
];

function parseSubTab(value: string | null): SubTab {
  return SUB_TABS.some((t) => t.value === value) ? (value as SubTab) : "receive";
}

function StatusPill({ status }: { status: ItemStatus }) {
  return (
    <Badge variant="outline" className={cn("text-[10px]", STATUS_PILLS[status] ?? "")}>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function ReceiveHistoryTab() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // ?sub= อยู่ใน URL เหมือน ?tab= และ ?kind= — refresh หรือส่งลิงก์ให้คนอื่นแล้วยังอยู่ segment เดิม.
  // ชื่อ param แยกจาก ?kind= ของออกจากคลัง เพราะทั้งสอง tab ถูก mount พร้อมกัน (หน้า reports
  // ซ่อนด้วย CSS ไม่ได้ unmount) — param ชื่อเดียวกันจะแย่งกันเขียน.
  const sub = parseSubTab(searchParams.get("sub"));

  const selectSub = (next: SubTab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sub", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Segment picker sits above the filter card, same as ออกจากคลัง — it chooses WHICH ledger is
  // on screen, so it is not one of that ledger's filters and does not belong inside their box.
  return (
    <div className="space-y-4">
      <Tabs value={sub} onValueChange={(v) => selectSub(v as SubTab)}>
        <TabsList className="w-full min-w-0 sm:w-auto">
          {SUB_TABS.map(({ value, label }) => (
            <TabsTrigger key={value} value={value} className="min-w-0 px-3.5">
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {sub === "receive" ? (
        <ReceiveLogTable />
      ) : sub === "in_use" ? (
        <StatusLogTable from="IN_USE" to="AVAILABLE" noun="คืนเข้าคลัง" />
      ) : sub === "return" ? (
        <StatusLogTable from="ON_LOAN" noun="รับคืนจากใบยืม" />
      ) : (
        <StatusLogTable from="UNDER_REPAIR" to="AVAILABLE" noun="รับคืนจากส่งซ่อม" />
      )}
    </div>
  );
}

// ── Generic report table: filter + summary + data + pagination, shared by all sub-tabs ──
interface ReportTableProps<T extends { id: string }> {
  path: string;
  columns: Column<T>[];
  filterConfig: FilterConfig;
  exportType: string;
  exportFilters?: FilterValues; // extra params merged into export URL (from/to)
  extraParams?: Record<string, string | undefined>; // extra fetch params (from/to)
  /** summary numbers → cards; runs on whatever shape the route returns */
  statsFor: (s: Record<string, number>, values: FilterValues) => SummaryStat[];
  emptyMessage: string;
}

function ReportTable<T extends { id: string }>({
  path,
  columns,
  filterConfig,
  exportType,
  exportFilters,
  extraParams,
  statsFor,
  emptyMessage,
}: ReportTableProps<T>) {
  const isMobile = useIsMobile();
  const [filters, setFilters] = useState<FilterValues>(defaultDateFilters);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const perPage = PAGE_SIZE.DEFAULT;

  const fetchPage = useCallback(async (p: number) => {
    const params: Record<string, string> = {
      page: String(p),
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
    const json = (await getReport(path, params)) as {
      records: T[]; total: number; summary: Record<string, number>;
    };
    setSummary(json.summary);
    return { items: json.records, total: json.total };
  }, [filters, perPage, path, extraParams]);

  const {
    items: data, total, page, totalPages, loading, isLoadingMore, hasNext, loadMore, setPage,
  } = usePagedList<T>({ fetchPage, pageSize: perPage, isMobile });

  return (
    <div className="space-y-4 pb-2">
      <ReportFilters
        config={filterConfig}
        values={filters}
        onChange={setFilters}
        actions={<ExportButtons reportType={exportType} filters={{ ...filters, ...exportFilters }} />}
      />
      {summary && <ReportSummary stats={statsFor(summary, filters)} />}
      <ReportDataTable
        columns={columns}
        data={data}
        loading={loading}
        pageSize={isMobile ? Math.max(1, data.length) : perPage}
        emptyMessage={emptyMessage}
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
            หน้า {page} จาก {totalPages} ({total} รายการ)
          </p>
          <Pagination page={page} total={total} pageSize={perPage} onChange={setPage} />
        </>
      )}
    </div>
  );
}

const COMMON_FILTERS: FilterConfig = { dateRange: true, staff: true, categories: true };

// ── นำเข้าคลัง: ReceiveRecord ──
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
  { key: "receivedAt", header: "วันที่", render: (r) => fmtDate(new Date(r.receivedAt), TH_DATETIME) },
  { key: "itemCode", header: "รหัสพัสดุ" },
  { key: "itemName", header: "รายการพัสดุ" },
  { key: "category", header: "หมวดหมู่" },
  { key: "lotNumber", header: "ล็อต" },
  { key: "quantity", header: "จำนวน" },
  { key: "expiryDate", header: "วันหมดอายุ", render: (r) => (r.expiryDate ? fmtDate(new Date(r.expiryDate), TH_DATE) : "—") },
  { key: "receiverName", header: "ผู้รับเข้า" },
];

function ReceiveLogTable() {
  return (
    <ReportTable<ReceiveRow>
      path="receive-history"
      columns={receiveColumns}
      filterConfig={COMMON_FILTERS}
      exportType="receive-history"
      emptyMessage="ไม่มีการนำเข้าคลังในช่วงนี้"
      statsFor={(s, v) => [
        { label: "ครั้งที่นำเข้า", value: s.records.toLocaleString(), hint: periodLabel(v) },
        { label: "จำนวนหน่วยรวม", value: s.units.toLocaleString(), hint: "รวมทุกล็อตในช่วงนี้" },
        { label: "รายการพัสดุ", value: s.items.toLocaleString(), hint: "นับพัสดุที่ต่างกัน ไม่ใช่จำนวนครั้ง" },
      ]}
    />
  );
}

// ── คืนเข้าคลัง / รับคืนจากใบยืม / รับคืนจากส่งซ่อม: ItemStatusLog ──
interface StatusRow {
  id: string;
  itemCode: string;
  itemName: string;
  category: string;
  subCode: string | null;
  previousStatus: ItemStatus;
  newStatus: ItemStatus;
  reason: string;
  changerName: string;
  changedAt: string;
}

const statusColumns: Column<StatusRow>[] = [
  { key: "changedAt", header: "วันที่", render: (r) => fmtDate(new Date(r.changedAt), TH_DATETIME) },
  { key: "itemCode", header: "รหัสพัสดุ" },
  { key: "itemName", header: "รายการพัสดุ" },
  { key: "subCode", header: "รหัสชิ้น", render: (r) => r.subCode ?? "—" },
  { key: "previousStatus", header: "จากสถานะ", render: (r) => <StatusPill status={r.previousStatus} /> },
  { key: "newStatus", header: "เป็นสถานะ", render: (r) => <StatusPill status={r.newStatus} /> },
  { key: "reason", header: "เหตุผล" },
  { key: "changerName", header: "ผู้บันทึก" },
];

function StatusLogTable({ from, to, noun }: { from: string; to?: string; noun: string }) {
  // Memoized so identity is stable across re-renders — otherwise ReportTable's
  // fetchPage (useCallback deps on extraParams) would change every render,
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
      emptyMessage={`ไม่มีการ${noun}ในช่วงนี้`}
      statsFor={(s, v) => [
        { label: `ครั้งที่${noun}`, value: s.records.toLocaleString(), hint: periodLabel(v) },
        { label: "รายการพัสดุ", value: s.items.toLocaleString(), hint: "นับพัสดุที่ต่างกัน ไม่ใช่จำนวนครั้ง" },
      ]}
    />
  );
}
