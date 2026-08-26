"use client";

import { useMemo, useState, useCallback, type ReactNode } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  ReportFilters, defaultDateFilters, periodLabel,
  type FilterValues, type FilterConfig,
} from "./report-filters";
import { ReportDataTable, type Column } from "./report-data-table";
import { ReportSummary, type SummaryStat } from "./report-summary";
import { ExportButtons } from "./export-buttons";
import { fmtDate, TH_DATE, TH_DATETIME } from "@/lib/format";
import { Tabs, TabsList, TabsTrigger, TabsIndicator } from "@/components/ui/tabs";
import { segmentStyle, type Token } from "./report-kit";
import { Badge } from "@/components/ui/badge";
import { getReport, updateReceiveUnitCost } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { useSession } from "@/components/layout/auth-guard";
import { canManageStock } from "@/lib/roles";
import { STATUS_LABELS, STATUS_PILLS, type ItemStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Pagination } from "@/components/shared/pagination";
import { PAGE_SIZE } from "@/lib/pagination-constants";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { usePagedList } from "@/hooks/use-paged-list";

type SubTab = "receive" | "in_use" | "return" | "repair";

// ชื่อเดียวกับ tabs ใน /receive เป๊ะ. เดิมหน้านี้เรียกสิ่งเดียวกันว่า "รับซ่อม" ขณะที่หน้าทำงาน
// เรียก "รับคืนจากส่งซ่อม" — คนละความหมายในหัวคนอ่าน ทั้งที่เป็นแถวชุดเดียวกัน.
//
// สี่ sub-tab นี้คือ "ของกลับเข้าคลัง" เหมือนกันหมด แต่มาจากคนละที่ — token จึงเป็นสีของ
// ต้นทาง (ยืม / นำไปใช้งาน / ส่งซ่อม) ไม่ใช่สีของปลายทาง ไม่งั้นทั้ง 4 อันเขียวเหมือนกันหมด.
const SUB_TABS: { value: SubTab; label: string; token: Token }[] = [
  {
    value: "receive", label: "นำเข้าคลัง", token: "stockin",
  },
  {
    value: "in_use", label: "คืนเข้าคลัง", token: "inuse",
  },
  {
    value: "return", label: "รับคืนจากใบยืม", token: "borrow",
  },
  {
    value: "repair", label: "รับคืนจากส่งซ่อม", token: "repair",
  },
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
  const spec = SUB_TABS.find((t) => t.value === sub)!;

  const selectSub = (next: SubTab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sub", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // ตารางลูกเป็นคนวาดการ์ดตัวกรอง chip จึงต้องส่งลงไปเป็น leading ไม่ใช่วาดที่นี่ —
  // ไม่งั้นมันลอยอยู่นอกการ์ดคนเดียวทั้งหน้า
  const chips = (
    <Tabs value={sub} onValueChange={(v) => selectSub(v as SubTab)}>
      <TabsList variant="segment" className="w-full min-w-0" style={segmentStyle(spec.token)}>
        <TabsIndicator />
        {SUB_TABS.map(({ value, label }) => (
          <TabsTrigger key={value} value={value}>
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );

  return (
    <div className="space-y-4">
      {/* chip เลือก sub-tab อยู่แถวบนสุดของการ์ดตัวกรอง ซึ่งเป็นของตารางลูก — มันคือตัวกรอง
          อย่างหนึ่ง ปล่อยลอยนอกการ์ดแล้วอ่านเป็นหัวเรื่องที่ไม่มีบ้าน */}
      {sub === "receive" ? (
        <ReceiveLogTable token={spec.token} leading={chips} />
      ) : sub === "in_use" ? (
        <StatusLogTable from="IN_USE" to="AVAILABLE" noun="คืนเข้าคลัง" token={spec.token} leading={chips} />
      ) : sub === "return" ? (
        <StatusLogTable from="ON_LOAN" noun="รับคืนจากใบยืม" token={spec.token} leading={chips} />
      ) : (
        <StatusLogTable from="UNDER_REPAIR" to="AVAILABLE" noun="รับคืนจากส่งซ่อม" token={spec.token} leading={chips} />
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
  token: Token;
  /** แถวบนสุดของการ์ดตัวกรอง — sub-tab chip ของหน้านี้ */
  leading?: ReactNode;
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
  token,
  leading,
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
    items: data, total, page, loading, isLoadingMore, hasNext, loadMore, setPage,
  } = usePagedList<T>({ fetchPage, pageSize: perPage, isMobile });

  return (
    <div className="space-y-4 pb-2">
      <ReportFilters
        leading={leading}
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
        token={token}
        footer={
          isMobile ? (
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
            <Pagination page={page} total={total} pageSize={perPage} onChange={setPage} />
          )
        }
      />
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
  unitCost: number | null;
  lotNumber: string;
  expiryDate: string | null;
  receiverName: string;
  receivedAt: string;
}

/**
 * ช่องราคาที่แก้ได้ในบรรทัด — ตารางนี้คือที่เดียวที่เห็นใบรับเข้าทีละใบ และราคาส่วนใหญ่ใน
 * ประวัติยังว่าง (เพิ่งเริ่มถามราคาของคงทนเมื่อ 2026-08-19) ทั้งที่ค่าใช้จ่ายรายปีบวกจากช่องนี้.
 *
 * เป็น input ตลอดเวลา ไม่ใช่กดแล้วค่อยแก้: งานจริงคือไล่กรอกทีละสิบๆ แถว การต้องกดก่อนพิมพ์
 * ทุกแถวคือการกดเปล่าอีกเท่าตัว. บันทึกตอน blur เฉพาะเมื่อค่าเปลี่ยน — ไล่ Tab ผ่านแถวที่กรอก
 * แล้วจึงไม่ยิง request.
 */
function UnitCostCell({ row, editable }: { row: ReceiveRow; editable: boolean }) {
  // saved = ค่าที่บันทึกไว้จริงล่าสุด ไม่ใช่ค่าใน row ตอน render — เก็บแยกไว้เพราะรายการที่ fetch
  // มาไม่ได้ refetch หลังบันทึก การเทียบกับ row.unitCost จะยิง PATCH ซ้ำทุกครั้งที่ blur.
  const [saved, setSaved] = useState(row.unitCost);
  const [value, setValue] = useState(row.unitCost != null ? String(row.unitCost) : "");
  const [saving, setSaving] = useState(false);

  if (!editable) {
    return <span>{row.unitCost != null ? row.unitCost.toLocaleString() : "—"}</span>;
  }

  const revert = () => setValue(saved != null ? String(saved) : "");

  const save = async () => {
    const trimmed = value.trim();
    // ว่าง = ไม่ทราบราคา (null) ซึ่งต่างจาก 0 ที่แปลว่าได้มาฟรี — รายงานนับคนละแบบ
    const next = trimmed === "" ? null : Number(trimmed);
    if (next != null && (!Number.isFinite(next) || next < 0)) {
      toast.error("ราคาต้องเป็นตัวเลขไม่ติดลบ");
      revert();
      return;
    }
    if (next === saved) return;
    setSaving(true);
    try {
      await updateReceiveUnitCost(row.id, next);
      setSaved(next);
      toast.success("บันทึกราคาแล้ว");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "บันทึกราคาไม่สำเร็จ");
      revert();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Input
      type="number"
      min="0"
      step="0.01"
      inputMode="decimal"
      placeholder="—"
      disabled={saving}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className="h-8 w-24 text-sm text-right"
    />
  );
}

function receiveColumns(editable: boolean): Column<ReceiveRow>[] {
  return [
    { key: "receivedAt", header: "วันที่", render: (r) => fmtDate(new Date(r.receivedAt), TH_DATETIME) },
    { key: "itemCode", header: "รหัสพัสดุ" },
    { key: "itemName", header: "รายการพัสดุ" },
    { key: "category", header: "หมวดหมู่" },
    { key: "lotNumber", header: "ล็อต" },
    { key: "quantity", header: "จำนวน" },
    {
      key: "unitCost", header: "ราคา/หน่วย", className: "text-right",
      render: (r) => <UnitCostCell row={r} editable={editable} />,
    },
    { key: "expiryDate", header: "วันหมดอายุ", render: (r) => (r.expiryDate ? fmtDate(new Date(r.expiryDate), TH_DATE) : "—") },
    { key: "receiverName", header: "ผู้รับเข้า" },
  ];
}

function ReceiveLogTable({ token, leading }: { token: Token; leading?: ReactNode }) {
  const { user } = useSession();
  const editable = canManageStock(user?.role ?? "");
  const columns = useMemo(() => receiveColumns(editable), [editable]);
  return (
    <ReportTable<ReceiveRow>
      token={token}
      leading={leading}
      path="receive-history"
      columns={columns}
      filterConfig={COMMON_FILTERS}
      exportType="receive-history"
      emptyMessage="ไม่มีการนำเข้าคลังในช่วงนี้"
      statsFor={(s, v) => [
        { label: "ครั้งที่นำเข้า", value: s.records.toLocaleString(), hint: periodLabel(v), token: "stockin" },
        { label: "จำนวนหน่วยรวม", value: s.units.toLocaleString(), hint: "รวมทุกล็อตในช่วงนี้", token: "stockin" },
        {
          // ค่าใช้จ่ายรายปีบวกจากช่องราคาของแถวพวกนี้ — 0 ที่แปลว่า "ยังไม่ได้กรอก" ต้องอ่านออก
          // ว่าไม่ใช่ 0 ที่แปลว่า "ไม่ได้ซื้อ" และบอกด้วยว่าเหลือให้ไล่กรอกอีกกี่ใบ
          label: "ยังไม่ได้กรอกราคา",
          value: s.unpriced.toLocaleString(),
          hint: editable ? "แก้ได้ที่ช่องราคาในตาราง" : "ค่าใช้จ่ายรายปีไม่นับใบที่ไม่มีราคา",
          tone: s.unpriced > 0 ? "warning" : "default",
          token: "stockin",
        },
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

function StatusLogTable({ from, to, noun, token, leading }: { from: string; to?: string; noun: string; token: Token; leading?: ReactNode }) {
  // Memoized so identity is stable across re-renders — otherwise ReportTable's
  // fetchPage (useCallback deps on extraParams) would change every render,
  // re-triggering its effect and refetching in an unbounded loop.
  const extraParams = useMemo(() => ({ from, to }), [from, to]);
  const exportFilters = useMemo(() => ({ from, to }), [from, to]);
  return (
    <ReportTable<StatusRow>
      token={token}
      leading={leading}
      path="status-log"
      columns={statusColumns}
      filterConfig={COMMON_FILTERS}
      exportType="status-log"
      extraParams={extraParams}
      exportFilters={exportFilters}
      emptyMessage={`ไม่มีการ${noun}ในช่วงนี้`}
      statsFor={(s, v) => [
        { label: `ครั้งที่${noun}`, value: s.records.toLocaleString(), hint: periodLabel(v), token },
        { label: "รายการพัสดุ", value: s.items.toLocaleString(), hint: "นับพัสดุที่ต่างกัน ไม่ใช่จำนวนครั้ง", token },
      ]}
    />
  );
}
