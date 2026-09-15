"use client";

import { useState, useCallback, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { ReportFilters, defaultDateFilters, periodLabel, type FilterValues, type FilterConfig } from "./report-filters";
import { ReportDataTable, wrapText, type Column } from "./report-data-table";
import { ReportSummary, type SummaryStat } from "./report-summary";
import { ExportButtons } from "./export-buttons";
import { DispenseEventDialog } from "./dispense-event-dialog";
import { Tabs, TabsList, TabsTrigger, TabsIndicator } from "@/components/ui/tabs";
import { Pill, segmentStyle, type Token } from "./report-kit";
import { fmtDate, TH_DATE, TH_DATETIME } from "@/lib/format";
import { getReport } from "@/lib/api";
import { Pagination } from "@/components/shared/pagination";
import { PAGE_SIZE } from "@/lib/pagination-constants";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { usePagedList } from "@/hooks/use-paged-list";
import { DISPENSE_KINDS, DISPENSE_KIND_LABELS, parseDispenseKind, type DispenseKind } from "@/lib/dispense-kind";

// ออกจากคลังคือเหตุการณ์คนละเรื่องสามอย่างในตารางเดียว (lib/dispense-kind) — ห้ามปนใน list เดียว
// ไม่งั้นแถวเบิกใช้จะขึ้น "ยังไม่คืน" ตลอดกาล. หนึ่ง segment = หนึ่งคำถาม จึงมีคอลัมน์ ตัวเลข และตัวกรองของตัวเอง.
export interface StockOutRow {
  id: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  resolvedQty: number;
  staffName: string;
  usageTypeLabel: string;
  courseCode: string | null;
  usageNote: string | null;
  lotNumber: string;
  dispensedAt: string;
  dueAt: string | null;
  returnedAt: string | null;
  returnCondition: "AVAILABLE" | "DAMAGED" | "LOST" | null;
  notes: string;
  loanGroupId: string | null;
  recipient: string | null;
  location: string | null;
}

/**
 * หนึ่งแถว = การกดเบิกหนึ่งครั้ง, ซึ่งเป็นหน่วยเดียวกับที่ API แบ่งหน้าอยู่แล้ว.
 * ใบหนึ่งอ่านจบในบรรทัดเดียว (ใครรับ · เมื่อไหร่ · ใครจ่าย · กี่รายการ · กี่หน่วย)
 * รายละเอียดอยู่ในป็อปอัพที่กดจากแถว.
 */
export interface DispenseEvent {
  key: string;
  head: StockOutRow;
  records: StockOutRow[];
  itemCount: number;
  totalQty: number;
  /** หน่วยที่ยังไม่กลับเข้าคลัง — 0 แปลว่าปิดใบแล้ว */
  outstanding: number;
}

interface Summary {
  events: number;
  units: number;
  openEvents: number;
  openUnits: number;
  overdueEvents: number;
  overdueUnits: number;
}

function loanStatus(e: DispenseEvent): { label: string; token?: Token } {
  const resolved = e.totalQty - e.outstanding;
  if (e.outstanding <= 0) return { label: "คืนครบ", token: "ready" };
  if (resolved > 0) return { label: `คืนบางส่วน ${resolved}/${e.totalQty}`, token: "repair" };
  // ยังไม่คืน ที่ยังไม่ถึงกำหนดไม่ใช่ปัญหา — ปล่อยเป็นสีเทา ให้สีไปอยู่กับแถวที่ต้องตามจริง
  return { label: "ยังไม่คืน" };
}

// กำหนดคืน — เกินกำหนด / ใกล้ครบ (≤3 วัน). เดิมอยู่แต่ใน tab ยืมค้าง ทำให้การ์ดใบเดียวกัน
// บอกว่าเลยกำหนดใน tab หนึ่งแต่เงียบในอีก tab หนึ่ง.
function dueAlert(dueAt: string | null, resolved: boolean): { label: string; token: Token } | null {
  if (!dueAt || resolved) return null;
  const days = (new Date(dueAt).getTime() - Date.now()) / 86_400_000;
  if (days < 0) return { label: "เกินกำหนดคืน", token: "damage" };
  if (days <= 3) return { label: "ใกล้ครบกำหนด", token: "repair" };
  return null;
}

function LoanStatus({ e }: { e: DispenseEvent }) {
  const status = loanStatus(e);
  const alert = dueAlert(e.head.dueAt, e.outstanding === 0);
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {alert && <Pill token={alert.token}>{alert.label}</Pill>}
      {/* "เกินกำหนดคืน" already says it is not back; the plain "ยังไม่คืน" beside it
          is the same fact twice. คืนบางส่วน n/m still earns its place. */}
      {!(alert && status.label === "ยังไม่คืน") && (
        <Pill token={status.token}>{status.label}</Pill>
      )}
    </span>
  );
}

// นำไปใช้งานไม่มีใครต้องตามคืน — มันกลับเข้าคลังทางหน้าคืนเข้าคลัง. สถานะที่ตอบคำถามจริงคือ
// "ตอนนี้ของยังอยู่ที่ห้องนั้นไหม" ไม่ใช่ "คืนหรือยัง".
function InUseStatus({ e }: { e: DispenseEvent }) {
  if (e.outstanding <= 0) {
    return <Pill token="stockin">กลับเข้าคลังแล้ว</Pill>;
  }
  return (
    <Pill token="inuse">
      {e.outstanding < e.totalQty ? `อยู่ที่ห้อง ${e.outstanding}/${e.totalQty}` : "อยู่ที่ห้อง"}
    </Pill>
  );
}

const num = "text-right tabular-nums";

const COL = {
  // เหตุผล — เบิกไปทำอะไร. ไม่ใช่ "ผู้รับ" อีกแล้ว: ค่าที่อยู่ในช่องนี้คือวิชา/กิจกรรม
  // (lib/constants recipientLabel) ไม่ใช่ชื่อคน และคนดูรายงาน monitor จากการใช้งาน ไม่ใช่จากคน.
  reason: {
    key: "recipient", header: "เหตุผล",
    render: (e: DispenseEvent) => e.head.recipient ?? "—",
    className: `font-medium ${wrapText}`,
  },
  location: {
    key: "location", header: "สถานที่",
    render: (e: DispenseEvent) => e.head.location ?? "ไม่ระบุที่ตั้ง",
    className: `font-medium ${wrapText}`,
  },
  date: { key: "dispensedAt", header: "วันเวลา", render: (e: DispenseEvent) => fmtDate(new Date(e.head.dispensedAt), TH_DATETIME) },
  staff: { key: "staffName", header: "ดำเนินโดย", render: (e: DispenseEvent) => e.head.staffName },
  usage: { key: "usage", header: "การใช้งาน", render: (e: DispenseEvent) => e.head.usageTypeLabel },
  itemCount: { key: "itemCount", header: "รายการ", render: (e: DispenseEvent) => e.itemCount.toLocaleString(), className: num },
  qty: { key: "totalQty", header: "หน่วย", render: (e: DispenseEvent) => e.totalQty.toLocaleString(), className: num },
  due: {
    key: "dueAt", header: "กำหนดคืน",
    render: (e: DispenseEvent) => (e.head.dueAt ? fmtDate(new Date(e.head.dueAt), TH_DATE) : "—"),
  },
} satisfies Record<string, Column<DispenseEvent>>;

interface KindSpec {
  /** สีประจำ segment — chip, หัวตาราง และการ์ดตัวเลขใช้ตัวเดียวกันหมด */
  token: Token;
  columns: Column<DispenseEvent>[];
  filters: FilterConfig;
  /** ป้ายของคอลัมน์ที่ตั้งชื่อแถว — ป็อปอัพใช้คำเดียวกันเพื่อไม่ให้ตารางกับหัวป็อปอัพเรียกคนละอย่าง */
  headerLabel: string;
  status?: (e: DispenseEvent) => React.ReactNode;
  stats: (s: Summary, f: FilterValues) => SummaryStat[];
  emptyMessage: string;
  /** ยืม + กรองค้างคืน ต้องการใบตามของ ไม่ใช่ ledger — คนละ export type. */
  exportType: (f: FilterValues) => string;
}

const baseFilters: FilterConfig = { dateRange: true, staffSearch: "ค้นหาผู้ดำเนินการ", usageTypes: true };

// การใช้งาน ก่อน เหตุผล ทุก segment: คนอ่านรายงาน monitor จาก "ของถูกเอาไปใช้ทำอะไร" ก่อนเสมอ
// แล้วค่อยเจาะว่าอันไหน — ประเภทกว้างๆ 3 ค่าจึงมาก่อน ตามด้วยบรรทัดที่ระบุตัวจริง.
const KINDS: Record<DispenseKind, KindSpec> = {
  consume: {
    token: "issue",
    headerLabel: "เหตุผล",
    columns: [COL.usage, COL.reason, COL.date, COL.staff, COL.itemCount, COL.qty],
    filters: { ...baseFilters, recipientSearch: "ค้นหาวิชา / กิจกรรม / เหตุผล" },
    emptyMessage: "ไม่มีการเบิกใช้ในช่วงนี้",
    exportType: () => "dispense-history",
    stats: (s, f) => [
      { label: "ใบเบิกในช่วงนี้", value: s.events.toLocaleString(), hint: `${periodLabel(f)} · นับเป็นครั้ง ไม่ใช่รายบรรทัด`, token: "issue" },
      { label: "จ่ายออกทั้งหมด", value: s.units.toLocaleString(), hint: "รวมทุกรายการ นับเป็นหน่วย", token: "issue" },
    ],
  },
  borrow: {
    token: "borrow",
    headerLabel: "เหตุผล",
    columns: [COL.usage, COL.reason, COL.date, COL.staff, COL.itemCount, COL.qty, COL.due,
      { key: "status", header: "สถานะ", render: (e) => <LoanStatus e={e} /> }],
    status: (e) => <LoanStatus e={e} />,
    filters: {
      ...baseFilters,
      recipientSearch: "ค้นหาวิชา / กิจกรรม / เหตุผล",
      statusOptions: [
        { value: "open", label: "ยังไม่คืน" },
        { value: "overdue", label: "เกินกำหนดคืน" },
      ],
    },
    emptyMessage: "ไม่มีการยืมในช่วงนี้",
    exportType: (f) => (f.status ? "outstanding-loans" : "dispense-history"),
    stats: (s, f) => [
      { label: "การยืมในช่วงนี้", value: s.events.toLocaleString(), hint: `${periodLabel(f)} · นับเป็นครั้ง ไม่ใช่รายบรรทัด`, token: "borrow" },
      // ศูนย์คือข่าวดี — การ์ดที่ไม่มีอะไรค้างจึงไม่ต้องย้อมสี ให้สีเหลือไว้กับตัวเลขที่ต้องทำอะไรต่อ
      { label: "ยังไม่คืน", value: s.openEvents.toLocaleString(), hint: `ค้าง ${s.openUnits.toLocaleString()} หน่วย`, token: s.openEvents > 0 ? "repair" : undefined },
      { label: "เกินกำหนดคืน", value: s.overdueEvents.toLocaleString(), hint: `ค้าง ${s.overdueUnits.toLocaleString()} หน่วย`, token: s.overdueEvents > 0 ? "damage" : undefined },
    ],
  },
  inuse: {
    token: "inuse",
    headerLabel: "สถานที่",
    // ไม่มีคอลัมน์การใช้งาน: นำไปใช้งานไม่เคยบันทึก usageType (station-in-room-dialog ไม่ส่ง)
    // ทุกแถวจึงเป็น "—" เหมือนกันหมด — และตัว action เองก็บอกอยู่แล้วว่าเอาไปตั้งใช้ที่ห้อง.
    // เหตุผล ยังมี: มันคือช่องในไดอะล็อก ซึ่งตกมาทาง notes (lib/constants recipientLabel).
    // และไม่มีคอลัมน์ "รายการ": dialog ส่งทีละชิ้น ค่าเป็น 1 ตลอด.
    columns: [COL.location, COL.reason, COL.date, COL.staff, COL.qty,
      { key: "status", header: "สถานะ", render: (e) => <InUseStatus e={e} /> }],
    status: (e) => <InUseStatus e={e} />,
    // ponytail: ไม่มีช่องค้นหา — คอลัมน์แรกของ segment นี้คือ location ไม่ใช่ recipient
    // (station-in-room-dialog ไม่เคยเขียน recipient) ค้นด้วย recipient จึงหาไม่เจอสักแถว
    filters: {
      dateRange: true,
      staffSearch: "ค้นหาผู้ดำเนินการ",
      statusOptions: [{ value: "open", label: "ยังอยู่ข้างนอก" }],
    },
    emptyMessage: "ไม่มีการนำไปใช้งานในช่วงนี้",
    exportType: () => "dispense-history",
    stats: (s, f) => [
      { label: "นำไปใช้งานในช่วงนี้", value: s.events.toLocaleString(), hint: periodLabel(f), token: "inuse" },
      { label: "ยังอยู่ข้างนอก", value: s.openEvents.toLocaleString(), hint: `${s.openUnits.toLocaleString()} หน่วยยังไม่กลับเข้าคลัง`, token: s.openEvents > 0 ? "inuse" : undefined },
    ],
  },
};

function groupEvents(records: StockOutRow[]): DispenseEvent[] {
  const map = new Map<string, StockOutRow[]>();
  for (const r of records) {
    const key = r.loanGroupId ?? r.id;
    const rows = map.get(key);
    if (rows) rows.push(r);
    else map.set(key, [r]);
  }
  return [...map.entries()].map(([key, rows]) => ({
    key,
    head: rows[0],
    records: rows,
    itemCount: rows.length,
    totalQty: rows.reduce((s, r) => s + r.quantity, 0),
    outstanding: rows.reduce((s, r) => s + (r.returnedAt ? 0 : r.quantity - r.resolvedQty), 0),
  }));
}

export function StockOutTab() {
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const kind = parseDispenseKind(searchParams.get("kind"));
  const spec = KINDS[kind];

  const [filters, setFilters] = useState<FilterValues>(defaultDateFilters);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [openEvent, setOpenEvent] = useState<DispenseEvent | null>(null);
  const perPage = PAGE_SIZE.DEFAULT;

  // ?kind= อยู่ใน URL เหมือน ?tab= — refresh แล้วยังอยู่ segment เดิม. สถานะถูกล้างเพราะตัวเลือก
  // ของแต่ละ segment ไม่เหมือนกัน ("เกินกำหนดคืน" ไม่มีความหมายกับนำไปใช้งาน).
  const selectKind = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("kind", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    // ล้างเฉพาะค่าที่ segment ปลายทางไม่มีช่องให้แก้ — ค่าที่มองไม่เห็นยังกรองผลอยู่ แต่ไม่มีปุ่มถอน
    // (เบิกใช้ ↔ ยืม มีช่องเหมือนกัน จึงพาค่าติดไปด้วยได้)
    const target = KINDS[parseDispenseKind(next)].filters;
    setFilters((f) => ({
      ...f,
      status: undefined,
      recipient: target.recipientSearch ? f.recipient : undefined,
      usageType: target.usageTypes ? f.usageType : undefined,
    }));
    setOpenEvent(null);
  };

  const fetchPage = useCallback(async (p: number) => {
    const params: Record<string, string> = {
      page: String(p),
      perPage: String(perPage),
      kind,
    };
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    if (filters.staff) params.staff = filters.staff;
    if (filters.recipient) params.recipient = filters.recipient;
    if (filters.usageType) params.usageType = filters.usageType;
    if (filters.status) params.loanStatus = filters.status;
    const json = (await getReport("dispense-history", params)) as {
      records: StockOutRow[]; total: number; summary: Summary;
    };
    setSummary(json.summary);
    return { items: json.records, total: json.total };
  }, [filters, perPage, kind]);

  const {
    items: data, total, page, loading, isLoadingMore, hasNext, loadMore, setPage,
  } = usePagedList<StockOutRow>({ fetchPage, pageSize: perPage, isMobile });

  const events = useMemo(() => groupEvents(data), [data]);

  return (
    <div className="space-y-4 pb-2">
      <ReportFilters
        leading={
          <Tabs value={kind} onValueChange={(v) => selectKind(v as string)}>
            {/* สีอยู่บนราง ไม่ใช่บนแต่ละช่อง เพราะตัวที่ทาสีคือแถบที่เลื่อน ไม่ใช่ปุ่ม */}
            <TabsList variant="segment" className="w-full min-w-0" style={segmentStyle(spec.token)}>
              <TabsIndicator />
              {DISPENSE_KINDS.map((k) => (
                <TabsTrigger key={k} value={k}>
                  {DISPENSE_KIND_LABELS[k]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
        config={spec.filters}
        values={filters}
        onChange={setFilters}
        actions={
          <ExportButtons
            reportType={spec.exportType(filters)}
            filters={{ ...filters, kind, loanStatus: filters.status }}
          />
        }
      />

      {summary && <ReportSummary stats={spec.stats(summary, filters)} />}

      <ReportDataTable
        columns={spec.columns}
        data={loading ? [] : events}
        loading={loading}
        // แบ่งหน้าจริงอยู่ที่ server แล้ว — ปิด client paging ในตารางไม่ให้ตัดซ้ำ
        pageSize={Math.max(events.length, 1)}
        emptyMessage={filters.status ? "ไม่มีรายการค้างอยู่ในช่วงนี้" : spec.emptyMessage}
        emptyDescription="ลองขยายช่วงเวลาหรือล้างตัวกรอง"
        onRowClick={setOpenEvent}
        token={spec.token}
        // total > 0 ครอบทั้งก้อน ไม่ใช่แค่ฝั่ง mobile: แถบแบ่งหน้าอยู่ค้างผ่านสถานะกำลังโหลดและ
        // หน้าที่คืนศูนย์แถว (นั่นคือเหตุผลที่มันเป็น footer) แต่ตัวกรองที่ไม่เจออะไรเลยทั้งชุดไม่มี
        // หน้าให้กลับไป — "รายการทั้งหมด 0 ครั้ง" กับปุ่มที่กดไม่ได้สองปุ่มไม่ได้บอกอะไรที่ข้อความ
        // ว่างเปล่าเหนือมันยังไม่ได้บอก
        footer={
          total === 0 ? undefined : isMobile ? (
            events.length > 0 && (
              <Pagination
                mode="loadMore"
                shown={events.length}
                total={total}
                hasMore={hasNext}
                isLoading={isLoadingMore}
                onLoadMore={loadMore}
              />
            )
          ) : (
            <Pagination
              page={page}
              total={total}
              pageSize={perPage}
              onChange={setPage}
              unit="ครั้ง"
            />
          )
        }
      />

      <DispenseEventDialog
        event={openEvent}
        headerLabel={spec.headerLabel}
        status={openEvent && spec.status ? spec.status(openEvent) : null}
        showReturn={kind === "borrow"}
        onClose={() => setOpenEvent(null)}
      />

    </div>
  );
}
