"use client";

import { useMemo, useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  ReportFilters, defaultDateFilters, periodLabel,
  type FilterValues, type FilterConfig,
} from "./report-filters";
import { ReportDataTable, type Column } from "./report-data-table";
import { autoLotNumber } from "@/lib/lot-code";
import { ReportSummary, type SummaryStat } from "./report-summary";
import { ExportButtons } from "./export-buttons";
import { fmtDate, TH_DATE, TH_DATETIME } from "@/lib/format";
import { Tabs, TabsList, TabsTrigger, TabsIndicator } from "@/components/ui/tabs";
import { segmentStyle, type Token } from "./report-kit";
import { Badge } from "@/components/ui/badge";
import { Pencil } from "lucide-react";
import { getReport, updateReceiveRecord } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  DIALOG_SHELL_FIT, DIALOG_BODY,
} from "@/components/ui/dialog";
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
      <TabsList variant="segment" className="w-full min-w-0 sm:w-fit" style={segmentStyle(spec.token)}>
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
  /** กดแถวแล้วเปิดอะไรสักอย่าง. รับ refetch มาด้วยเพราะตารางนี้ไม่ refetch เองหลังแก้ */
  onRowClick?: (row: T, refetch: () => void) => void;
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
  onRowClick,
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
    if (filters.categoryId) params.categoryId = filters.categoryId;
    else if (filters.profileId) params.profileId = filters.profileId;
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
    items: data, total, page, loading, isLoadingMore, hasNext, loadMore, setPage, refetch,
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
        onRowClick={onRowClick ? (row) => onRowClick(row, refetch) : undefined}
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

// ไม่มีช่องกรองคน: ผู้รับเข้า/ผู้บันทึกของคลังมีไม่กี่คน กรองแล้วได้ผลเท่าเดิม และคำถามของ
// รายงานฝั่งนี้คือของเข้ามาเท่าไร ราคาเท่าไร — ใครกดบันทึกอ่านจากคอลัมน์รายแถวได้อยู่แล้ว
const COMMON_FILTERS: FilterConfig = { dateRange: true, categories: true };

// ── นำเข้าคลัง: ReceiveRecord ──
interface ReceiveRow {
  id: string;
  itemCode: string;
  itemName: string;
  category: string;
  quantity: number;
  unitCost: number | null;
  /** null = ใบนี้ไม่ได้แยกล็อต — ชื่องวดของมันไปอยู่ที่ batchRef แทน */
  lotNumber: string | null;
  /** ชื่องวดของใบที่ไม่มีล็อต — null = ยังไม่ได้ตั้ง ใช้รหัสจากวันที่รับเข้าไปก่อน */
  batchRef: string | null;
  expiryDate: string | null;
  receiverName: string;
  receivedAt: string;
}

/**
 * แก้ราคาย้อนหลังผ่าน dialog ที่เปิดจากการกดแถว.
 *
 * เดิมเป็น input ในบรรทัด ซึ่งบนมือถือคือ "พิมพ์แล้วต้องกด Enter/แตะที่อื่น" ถึงจะบันทึก และบน
 * หน้ารายงานที่คนเข้ามาอ่านเฉยๆ ช่องพิมพ์กลางตารางก็แก้โดนโดยไม่ตั้งใจได้ง่าย. กดแถว → เด้ง
 * dialog → กดบันทึก ทำให้ทุกการแก้ราคาเป็นเจตนา และมีปุ่มบันทึกจริงให้กดบนจอเล็ก.
 */
function UnitCostDialog({
  row, onClose, onSaved,
}: { row: ReceiveRow | null; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState("");
  const [lot, setLot] = useState("");
  const [saving, setSaving] = useState(false);

  // เปิดแถวไหนก็เริ่มจากค่าของแถวนั้น ไม่ใช่ค่าที่ค้างจากแถวก่อนหน้า
  useEffect(() => {
    if (row) {
      setValue(row.unitCost != null ? String(row.unitCost) : "");
      setLot(row.lotNumber ?? row.batchRef ?? "");
    }
  }, [row]);

  const save = async () => {
    if (!row) return;
    const trimmed = value.trim();
    // ว่าง = ไม่ทราบราคา (null) ซึ่งต่างจาก 0 ที่แปลว่าได้มาฟรี — รายงานนับคนละแบบ
    const nextCost = trimmed === "" ? null : Number(trimmed);
    if (nextCost != null && (!Number.isFinite(nextCost) || nextCost < 0)) {
      toast.error("ราคาต้องเป็นตัวเลขไม่ติดลบ");
      return;
    }
    const nextLot = lot.trim();
    // ล็อตที่มีอยู่ต้องมีเลขเสมอ — ลบเลขทิ้งคือการลบล็อต ซึ่งเป็นการย้ายของ ไม่ใช่แก้ป้าย
    // ใบที่ไม่มีล็อตว่างได้: ว่าง = ยังไม่ตั้งชื่องวด กลับไปใช้รหัสจากวันที่รับเข้า
    if (row.lotNumber != null && nextLot === "") {
      toast.error("เลขล็อตว่างไม่ได้");
      return;
    }

    // ส่งเฉพาะช่องที่ขยับจริง — ไม่งั้นได้รายการ "แก้ราคาต่อหน่วย"/"แก้เลขล็อต" ในประวัติ
    // ทั้งที่กดบันทึกทับค่าเดิม
    const patch: { unitCost?: number | null; lotNumber?: string; batchRef?: string | null } = {};
    if (nextCost !== (row.unitCost ?? null)) patch.unitCost = nextCost;
    // ช่องเดียวบนจอ สองที่เก็บในฐานข้อมูล — ใบที่มีล็อตแก้ชื่อล็อต ใบที่ไม่มีแก้ชื่องวดของตัวเอง
    if (row.lotNumber != null) {
      if (nextLot !== row.lotNumber) patch.lotNumber = nextLot;
    } else if ((nextLot || null) !== row.batchRef) {
      patch.batchRef = nextLot || null;
    }
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      await updateReceiveRecord(row.id, patch);
      toast.success("บันทึกแล้ว");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={row != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn(DIALOG_SHELL_FIT, "sm:max-w-md")}>
        <DialogHeader className="shrink-0">
          <DialogTitle>แก้ใบรับเข้า</DialogTitle>
          <DialogDescription>
            {row ? `${row.itemCode} · ${row.itemName}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className={cn(DIALOG_BODY, "space-y-4 px-1")}>
          {/* บอกว่ากำลังแก้ใบไหน — รหัสพัสดุเดียวกันมีได้หลายใบรับเข้า จำนวน/วันที่คือตัวแยก.
              สองช่องนี้แก้ไม่ได้: ของที่เคลื่อนจริงเท่าไหร่ วันไหน เป็นเรื่องของการปรับสต็อก */}
          {row && (
            <dl className="grid grid-cols-2 gap-y-1 rounded-md bg-muted/40 px-3 py-2 text-sm">
              <dt className="text-muted-foreground">จำนวน</dt>
              <dd className="text-right">{row.quantity.toLocaleString()}</dd>
              <dt className="text-muted-foreground">วันที่รับเข้า</dt>
              <dd className="text-right">{fmtDate(new Date(row.receivedAt), TH_DATE)}</dd>
            </dl>
          )}
          {/* เลขล็อตแก้ได้เฉพาะใบที่มีล็อตอยู่แล้ว — สร้างล็อตให้ใบที่ไม่มีคือการย้ายของเข้าล็อต
              ซึ่งบนของสิ้นเปลืองที่ไม่มีล็อตจะพลิก availableQty ไปนับจาก SUM(lots) ทันที */}
          {row && (
            <div className="space-y-1.5">
              <Label htmlFor="lot-number">{row.lotNumber != null ? "เลขล็อต" : "ชื่องวดรับเข้า"}</Label>
              <Input
                id="lot-number"
                disabled={saving}
                placeholder={row.lotNumber != null ? undefined : autoLotNumber(new Date(row.receivedAt))}
                value={lot}
                onChange={(e) => setLot(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && save()}
              />
              {/* ช่องเดียวกัน แต่ผลของการแก้ต่างกันตามว่าใบนี้แยกล็อตไหม — บอกตรงที่มันเกิด */}
              <p className="text-xs text-muted-foreground">
                {row.lotNumber != null
                  ? "เปลี่ยนป้ายของล็อตนี้ทั้งล็อต — ใบรับเข้าอื่นที่ใช้ล็อตเดียวกันเปลี่ยนตาม"
                  : "เปลี่ยนเฉพาะใบนี้ · เว้นว่าง = ใช้รหัสจากวันที่รับเข้า"}
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="unit-cost">ราคาต่อหน่วย (บาท)</Label>
            <Input
              id="unit-cost"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              autoFocus
              placeholder="เว้นว่าง = ไม่ทราบราคา"
              disabled={saving}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
          </div>
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button onClick={save} disabled={saving}>{saving ? "กำลังบันทึก..." : "บันทึก"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// เซลล์ราคาเป็นตัวเดียวที่บอกว่าแถวนี้กดได้ — กรอบ dashed + ดินสอ อ่านออกว่า "ช่องที่ยังกรอกได้"
// โดยไม่ต้อง hover (มือถือไม่มี hover) และไม่ต้องยัดปุ่มเพิ่มอีกคอลัมน์.
function UnitCostCell({ row, editable }: { row: ReceiveRow; editable: boolean }) {
  const text = row.unitCost != null ? row.unitCost.toLocaleString() : "—";
  if (!editable) return <span className="tabular-nums">{text}</span>;
  return (
    <span className="flex w-full items-center justify-between gap-2 rounded-md border border-dashed border-muted-foreground/40 px-2 py-1">
      <Pencil className="h-3 w-3 shrink-0 text-muted-foreground/60" />
      <span className={cn("tabular-nums", row.unitCost == null && "text-muted-foreground")}>{text}</span>
    </span>
  );
}

function receiveColumns(editable: boolean): Column<ReceiveRow>[] {
  return [
    { key: "receivedAt", header: "วันที่", render: (r) => fmtDate(new Date(r.receivedAt), TH_DATETIME) },
    { key: "itemCode", header: "รหัสพัสดุ" },
    { key: "itemName", header: "รายการพัสดุ" },
    { key: "category", header: "หมวดหมู่" },
    // ใบที่ไม่มีล็อต (ครุภัณฑ์ ADR-0002) ยังต้องบอกได้ว่า "งวดไหน" — วันที่รับเข้าของใบนั้น
    // คือคำตอบ และเป็นรหัสตัวเดียวกับที่ระบบตั้งให้ล็อตอัตโนมัติอยู่แล้ว.
    // พิมพ์เป็นรหัส ไม่แปลเป็น "รับเข้า 2 ก.ย. 2569" — คอลัมน์วันที่อยู่ซ้ายมืออยู่แล้ว
    {
      key: "lotNumber", header: "ล็อต / งวด",
      render: (r) => r.lotNumber ?? r.batchRef ?? autoLotNumber(new Date(r.receivedAt)),
    },
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
  const [editing, setEditing] = useState<ReceiveRow | null>(null);
  // refetch มาพร้อมแถวที่กด ไม่ได้อยู่ใน scope นี้ — เก็บไว้เรียกตอนบันทึกเสร็จเพื่อให้ทั้งตาราง
  // และการ์ด "ยังไม่ได้กรอกราคา" ตรงกับของจริง
  const refetchRef = useRef<() => void>(() => {});
  const columns = useMemo(() => receiveColumns(editable), [editable]);
  return (
    <>
    <ReportTable<ReceiveRow>
      token={token}
      leading={leading}
      path="receive-history"
      columns={columns}
      onRowClick={
        editable
          ? (row, refetch) => {
              refetchRef.current = refetch;
              setEditing(row);
            }
          : undefined
      }
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
          hint: editable ? "กดที่แถวเพื่อแก้ราคา" : "ค่าใช้จ่ายรายปีไม่นับใบที่ไม่มีราคา",
          tone: s.unpriced > 0 ? "warning" : "default",
          token: "stockin",
        },
      ]}
    />
    <UnitCostDialog
      row={editing}
      onClose={() => setEditing(null)}
      onSaved={() => refetchRef.current()}
    />
    </>
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
