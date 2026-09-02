"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { fmtDate, TH_DATE } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShoppingCart, ArrowDownToLine, ArrowUpFromLine, Undo2, Package,
  RefreshCw, Wrench, MapPin, MonitorCog, Flag, ChevronRight, Tag,
  ListFilter, CircleDot, CalendarDays, FilterX, Search, ArrowLeft, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getItemHistory } from "@/lib/api";
import { Pagination } from "@/components/shared/pagination";
import { PAGE_SIZE } from "@/lib/pagination-constants";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { usePagedList } from "@/hooks/use-paged-list";
import { EVENT_TYPE_LABELS, type TimelineEventType } from "@/lib/constants";

import { AttachmentList } from "@/components/shared/attachment-list";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { CaseDetailPane } from "@/components/cases/case-workspace";
import { ExportButtons } from "@/components/reports/export-buttons";
import type { AttachRecordType } from "@/lib/attachments";
import { caseRangeOptions } from "@/lib/case-types";
interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  date: string;
  delta: number | null;
  // How many units the event was about. Equals |delta| on a stock movement; on a ส่งซ่อม it is
  // the only count there is — 47 pieces went to the shop, but the stock left the shelf back at
  // แจ้งชำรุด, so there is no delta to show and the column would otherwise read "—".
  qty: number | null;
  note: string;
  subtitle: string;
  notes: string;
  user: string;
  // Present only on qty-stock movements. Shown in the จำนวน column as `100 → 147`.
  change?: { from: number; to: number } | null;
  // Only on a รับคืนจากซ่อม row, folded in from the repair job that closed the trip.
  cost?: number | null;
  // หลักฐานแนบของกิจกรรมนั้น — dialog only, the table stays text. Grouped by the record that
  // owns the array so the dialog can write back; a รับคืนจากซ่อม row carries two groups.
  attachments?: AttachGroup[];
}

// One เคส, assembled by the API into a single unit — the same case, with the same number, that
// /cases opens. It occupies one slot in the list, so a card is never split across a page.
interface RepairTrip {
  kind: "trip";
  id: string;
  caseType: string;
  code: string;
  statusLabel: string;
  subject: string;
  /** ชิ้นไหน (C01) — null บนของที่ไม่ได้ติดตามรายชิ้น */
  subCode: string | null;
  date: string;
  openedAt: string;
  closedAt: string | null;
  done: boolean;
  qty: number | null;
  cost: number | null;
  attachments: number;
  steps: TimelineEvent[];
}

type Unit = TimelineEvent | RepairTrip;

const isTrip = (u: Unit): u is RepairTrip => "steps" in u;

/** คีย์ของแถวหนึ่งแถวในรายการ. ต้องมี prefix: ไอดีของเคสคือไอดีของแถวต้นทาง ซึ่งบางเคส (ชิ้นที่
 *  ติดตามรายชิ้น) ใช้ไอดีเดียวกับ event ที่เปิดมัน — ไม่มี prefix แล้วสองแถวจะเป็นแถวเดียวกัน. */
const unitKey = (u: Unit) => (isTrip(u) ? `case:${u.id}` : `ev:${u.id}`);

// Movement types lead with colour (stock left / stock came back); the three that don't touch
// stock share one quiet muted badge, so the eye separates "ของขยับ" from "เหตุการณ์อื่น" before
// reading a single word. `rail` is the left accent that fades in on row hover.
// The -700 steps are picked for light cards and only reach ~2.8:1 on a dark one, so every
// coloured label carries a lighter dark-mode step — badge text is 11px and gets no AA discount.
const TYPE_META: Record<TimelineEventType, { icon: typeof Package; chip: string; rail: string }> = {
  DISPENSE: { icon: ShoppingCart, chip: "bg-destructive/10 text-destructive dark:text-danger-400", rail: "bg-destructive" },
  BORROW: { icon: ArrowUpFromLine, chip: "bg-warning/15 text-warning-700 dark:text-warning-200", rail: "bg-warning" },
  INUSE: { icon: MonitorCog, chip: "bg-primary/10 text-primary", rail: "bg-primary" },
  RETURN: { icon: Undo2, chip: "bg-success/10 text-success-700 dark:text-success-200", rail: "bg-success" },
  RECEIVE: { icon: ArrowDownToLine, chip: "bg-success/10 text-success-700 dark:text-success-200", rail: "bg-success" },
  ADJUSTMENT: { icon: Package, chip: "bg-foreground/5 text-foreground", rail: "bg-foreground/40" },
  // แจ้งชำรุด opens the loop the repair pair closes — flagged, and red like the other row that
  // takes stock off the shelf.
  DAMAGE_REPORT: { icon: Flag, chip: "bg-destructive/10 text-destructive dark:text-danger-400", rail: "bg-destructive" },
  // The repair pair shares the ประแจ with บำรุงรักษา but carries colour, because going out and
  // coming back are the two ends of an open loop somebody is waiting on.
  REPAIR_SENT: { icon: Wrench, chip: "bg-warning/15 text-warning-700 dark:text-warning-200", rail: "bg-warning" },
  REPAIR_RETURN: { icon: Wrench, chip: "bg-success/10 text-success-700 dark:text-success-200", rail: "bg-success" },
  STATUS_CHANGE: { icon: RefreshCw, chip: "bg-muted text-muted-foreground", rail: "bg-muted-foreground" },
  MAINTENANCE: { icon: Wrench, chip: "bg-muted text-muted-foreground", rail: "bg-muted-foreground" },
  LOCATION_CHANGE: { icon: MapPin, chip: "bg-muted text-muted-foreground", rail: "bg-muted-foreground" },
  // แก้ราคาไม่ได้ทำให้ของขยับ — เงียบเหมือนย้ายที่ตั้งกับเปลี่ยนสถานะ
  PRICE_CHANGE: { icon: Tag, chip: "bg-muted text-muted-foreground", rail: "bg-muted-foreground" },
};

/**
 * ตัวเลือกของช่อง "ประเภท" — ชุดเดียว ไม่ใช่สองระบบซ้อนกัน.
 *
 * เดิมเป็นชิป 12 ใบเรียงตามชนิดเหตุการณ์ ซึ่งบังคับให้คนอ่านรู้ล่วงหน้าว่างานซ่อมหนึ่งงานกระจายอยู่
 * ในสามใบ (แจ้งชำรุด / ส่งซ่อม / รับคืนจากซ่อม) แล้วต้องเลือกให้ถูกใบ. ที่นี่ "ซ่อมแซม" คือหนึ่ง
 * ตัวเลือกที่ครอบทั้งสาม แล้วฝั่ง server เก็บเคสไว้ทั้งใบ — ตัวกรองพูดภาษาเดียวกับการ์ดที่มันกรอง.
 *
 * สูญหายไม่มีในนี้: ในไทม์ไลน์ของหายมาในรูปการเปลี่ยนสถานะหรือปรับสต๊อก ไม่ได้เป็นชนิดของตัวเอง —
 * ตัวเลือกที่แมปกับข้อมูลไม่ได้คือตัวเลือกที่กดแล้วว่าง.
 */
const TYPE_GROUPS: { value: string; label: string; types: TimelineEventType[] }[] = [
  { value: "REPAIR", label: "ซ่อมแซม", types: ["DAMAGE_REPORT", "REPAIR_SENT", "REPAIR_RETURN"] },
  { value: "MAINTENANCE", label: "บำรุงรักษา", types: ["MAINTENANCE"] },
  { value: "BORROW", label: "ยืมพัสดุ", types: ["BORROW"] },
  { value: "INUSE", label: "ตั้งใช้ในห้อง", types: ["INUSE"] },
  { value: "DISPENSE", label: "เบิกใช้", types: ["DISPENSE"] },
  { value: "RETURN", label: "รับคืน", types: ["RETURN"] },
  { value: "RECEIVE", label: "รับเข้า", types: ["RECEIVE"] },
  { value: "ADJUSTMENT", label: "ปรับสต๊อก", types: ["ADJUSTMENT"] },
  { value: "STATUS_CHANGE", label: "เปลี่ยนสถานะ", types: ["STATUS_CHANGE"] },
  { value: "LOCATION_CHANGE", label: "ย้ายที่ตั้ง", types: ["LOCATION_CHANGE"] },
  { value: "PRICE_CHANGE", label: "แก้ราคา", types: ["PRICE_CHANGE"] },
];

/** ตัวเลือกหนึ่งค่า → ชนิดเหตุการณ์ที่มันครอบ, ส่งไปเป็น list ให้ `?type=` ที่รับ comma อยู่แล้ว. */
const typeOf = (value: string) => TYPE_GROUPS.find((g) => g.value === value)?.types ?? [];

const STATE_OPTIONS = [
  { value: "all", label: "ทั้งหมด" },
  { value: "OPEN", label: "กำลังดำเนินการ" },
  { value: "DONE", label: "เสร็จสิ้น" },
  { value: "CANCELLED", label: "ยกเลิก" },
];
const RANGE_OPTIONS = caseRangeOptions();

/** n = how many rows of that type; qty = how many units they moved (null = type never moves stock). */
type Counts = Partial<Record<TimelineEventType, { n: number; qty: number | null }>>;

type AttachGroup = { recordType: AttachRecordType; recordId: string; urls: string[] };

interface Props {
  itemId: string;
  /** Scope to one tracked copy. Item-level events (รับเข้า/ปรับสต๊อก/ย้ายที่ตั้ง) drop out. */
  subItemId?: string;
  /** ADMIN/SUPERADMIN — whether the detail dialog may แนบเพิ่ม/ลบ หลักฐาน on a past event. */
  canEdit?: boolean;
}

export function ItemDetailHistory({ itemId, subItemId, canEdit = false }: Props) {
  const isMobile = useIsMobile();
  const [typeFilter, setTypeFilter] = useState("all");
  const [state, setState] = useState("all");
  const [range, setRange] = useState("all");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState<Counts>({});
  const [unit, setUnit] = useState("");
  // แถวที่เลือกอยู่ — เคสหรือกิจกรรมก็คีย์เดียวกัน เพราะทั้งคู่ยึดช่องรายละเอียดช่องเดียวกัน
  const [selected, setSelected] = useState<string | null>(null);
  // เคสของ**พัสดุตัวอื่น** ที่กดข้ามมาจากในเคสที่เปิดอยู่ — บรรทัดอื่นของใบเบิกใบเดียวกัน หรือ
  // งานซ่อมที่การคืนครั้งนั้นเปิดไว้. เลือกในลิสต์ซ้ายไม่ได้เพราะแก้วน้ำไม่มีอยู่ในประวัติของ
  // ชามรูปไตตั้งแต่แรก จึงต้องมีที่ของมันเอง.
  const [peek, setPeek] = useState<string | null>(null);
  const perPage = PAGE_SIZE.DEFAULT;

  // A keystroke per request would put one full history build behind every letter.
  useEffect(() => {
    const t = setTimeout(() => setSearch(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const fetchPage = useCallback(
    async (p: number) => {
      const qs = new URLSearchParams({ page: String(p), perPage: String(perPage) });
      if (typeFilter !== "all") qs.set("type", typeOf(typeFilter).join(","));
      if (state !== "all") qs.set("state", state);
      if (range !== "all") qs.set("range", range);
      if (search) qs.set("q", search);
      if (subItemId) qs.set("subItemId", subItemId);
      const data = (await getItemHistory(itemId, qs.toString())) as Record<string, unknown>;
      // Filter-independent, so the chips stay complete while one type is selected.
      setCounts((data.counts as Counts) ?? {});
      setUnit((data.unit as string) ?? "");
      return {
        items: (data.events || []) as Unit[],
        total: (data.total as number) || 0,
      };
    },
    [itemId, subItemId, perPage, typeFilter, state, range, search],
  );

  const {
    items: events, total, page, loading, isLoadingMore, hasNext, loadMore, setPage,
  } = usePagedList<Unit>({ fetchPage, pageSize: perPage, isMobile });

  // แนบเพิ่ม/ลบ answers with the record's array as it now stands. Keeping those answers here —
  // keyed by the record, not by the timeline row — means they survive closing the dialog, paging,
  // and filtering, without a refetch of seven tables to repaint one thumbnail.
  const [attachOverride, setAttachOverride] = useState<Record<string, string[]>>({});

  // How many lines the table actually draws — a case is one รายการ but several rows.
  const rowCount = events.reduce((n, u) => n + (isTrip(u) ? u.steps.length + 1 : 1), 0);
  // ตัวเลือกที่ไม่มีข้อมูลเลยไม่ต้องมี — เมนูที่ยาวด้วยบรรทัดที่กดแล้วว่างคือเมนูที่อ่านช้าลงเปล่าๆ.
  // จำนวนนับเป็นเหตุการณ์ ไม่ใช่เคส: หนึ่งงานซ่อมมีสามเหตุการณ์ และช่องนี้กรองด้วยเหตุการณ์.
  const nOf = (g: (typeof TYPE_GROUPS)[number]) => g.types.reduce((n, t) => n + (counts[t]?.n ?? 0), 0);
  const typeOptions = [
    { value: "all", label: "ทั้งหมด" },
    ...TYPE_GROUPS.filter((g) => nOf(g) > 0).map((g) => ({ value: g.value, label: `${g.label} (${nOf(g)})` })),
  ];
  const dirty = typeFilter !== "all" || state !== "all" || range !== "all" || !!search;
  const clear = () => { setTypeFilter("all"); setState("all"); setRange("all"); setQ(""); };

  // Derived, not stored — เหมือนเวิร์กสเปซเคส: แถวที่เลือกไว้แล้วตัวกรองใหม่คัดออก ต้องไม่ค้างอยู่
  // เป็น state ที่คนกดกลับไปหาไม่ได้. บนจอใหญ่ตกมาที่แถวแรกเพื่อไม่ให้ช่องขวาว่างเปล่าตั้งแต่เปิด.
  const active = useMemo(() => {
    const found = events.find((u) => unitKey(u) === selected);
    if (found) return found;
    if (isMobile) return null;
    return events[0] ?? null;
  }, [events, selected, isMobile]);
  // ตัวกรองชุดเดียวกับที่ fetchPage ยิงไป ลบ `page`/`perPage` ทิ้ง — การแบ่งหน้าเป็นเรื่องของจอ
  // ไฟล์ส่งออกทั้งชุดที่กรองไว้เสมอ.
  const exportFilters = (): Record<string, string | undefined> => ({
    itemId,
    subItemId,
    // `type` ถูกจองไว้เป็นชนิดรายงานแล้วใน /api/reports/export ประเภทกิจกรรมจึงเดินทางในชื่อ kind
    // — ส่งไปในชื่อ type เมื่อไหร่ มันจะเขียนทับ type=item-history แล้วไฟล์จะออกมาผิดรายงาน
    ...(typeFilter !== "all" ? { kind: typeOf(typeFilter).join(",") } : {}),
    ...(state !== "all" ? { state } : {}),
    ...(range !== "all" ? { range } : {}),
    ...(search ? { q: search } : {}),
  });

  const filters = (
    // แถบตัวกรองเต็มความกว้าง เหนือสองคอลัมน์ — เหมือนเวิร์กสเปซเคส. อยู่ในการ์ดรายการไม่ได้แล้ว
    // เพราะมันกรองทั้งสองฝั่ง ไม่ใช่แค่ฝั่งซ้าย.
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">กิจกรรม</p>
          <h2 className="mt-1.5 text-lg font-semibold leading-tight tracking-tight">ประวัติ</h2>
        </div>
        {/* ไฟล์ได้ชุดเดียวกับที่กรองอยู่บนจอ ไม่ใช่ทั้งประวัติเสมอ — ปุ่มส่งออกที่ไม่ฟังตัวกรอง
            คือไฟล์ที่ต้องมาเถียงกันทีหลังว่าทำไมเลขไม่ตรงกับหน้าจอ. */}
        <ExportButtons reportType="item-history" filters={exportFilters()} />
      </div>
      {/* "ประเภท" เป็นช่องเดียว ไม่ใช่ชิปชนิดเหตุการณ์ 12 ใบซ้อนกับ dropdown ประเภทเคสอีกอัน —
          สองระบบที่ทับกันบนจอเดียวคือตัวกรองที่เถียงกันเอง (เลือกซ่อมแซม + ชิปรับเข้า = ว่างเสมอ). */}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="ประเภท">
          <FilterSelect icon={ListFilter} value={typeFilter} onValueChange={setTypeFilter} options={typeOptions} />
        </Field>
        {/* สถานะเป็นคำถามของงาน ไม่ใช่ของของ — เลือกแล้วแถวรับเข้า/ย้ายที่ตั้งหายไปโดยตั้งใจ */}
        <Field label="สถานะงาน">
          <FilterSelect icon={CircleDot} value={state} onValueChange={setState} options={STATE_OPTIONS} />
        </Field>
        <Field label="ช่วงเวลา">
          <FilterSelect icon={CalendarDays} value={range} onValueChange={setRange} options={RANGE_OPTIONS} />
        </Field>
        <div className="min-w-[180px] flex-1">
          <p className="mb-1.5 text-[11px] text-muted-foreground">ค้นหา</p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="เลขเคส, เรื่อง, ผู้ทำรายการ"
              className="h-8 pl-8"
            />
          </div>
        </div>
        {dirty && (
          <Button variant="outline" className="gap-1.5" onClick={clear}>
            <FilterX className="size-4" /> ล้างตัวกรอง
          </Button>
        )}
      </div>
    </div>
  );

  const list = (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      {loading ? (
        <div className="space-y-2 p-4 sm:p-6">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      ) : events.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          {dirty ? "ไม่มีรายการที่ตรงกับตัวกรอง" : "ยังไม่มีประวัติของพัสดุนี้"}
        </p>
      ) : (
        <ol className="p-4 sm:p-5">
          {events.map((u, i) => {
            const key = unitKey(u);
            const on = active != null && unitKey(active) === key;
            return <TimelineRow key={key} u={u} unit={unit} selected={on} onSelect={() => setSelected(key)} last={i === events.length - 1} />;
          })}
        </ol>
      )}

      {!loading && events.length > 0 && (isMobile ? (
        <Pagination
          mode="loadMore"
          shown={events.length}
          total={total}
          hasMore={hasNext}
          isLoading={isLoadingMore}
          onLoadMore={loadMore}
        />
      ) : (
        // A case counts as one รายการ but prints several rows. Saying "4 รายการ" over a table
        // of ten lines reads like a bug unless the rows are named too.
        <Pagination
          page={page}
          total={total}
          pageSize={perPage}
          onChange={setPage}
          unit={rowCount !== events.length ? `รายการ · ${rowCount} เหตุการณ์` : "รายการ"}
        />
      ))}
    </section>
  );

  // เคสใช้ CaseDetailPane ตัวเดียวกับหน้ารายการสิ่งที่ต้องทำ; กิจกรรมที่ไม่ใช่เคส (รับเข้า, ปรับสต๊อก,
  // ย้ายที่ตั้ง) ไม่มีเคสให้เปิด จึงมีช่องของตัวเองที่ยึดที่เดียวกัน — ช่องขวาตอบแถวที่เลือกไว้เสมอ
  // ไม่ว่าแถวนั้นจะเป็นงานหรือเป็นแค่ของที่ขยับ.
  const detail = !active ? <EmptyPane /> : isTrip(active) ? (
    <CaseDetailPane caseId={caseIdOf(active)} onOpenCase={setPeek} canEdit={canEdit} />
  ) : (
    <EventDetailPane
      event={active}
      unit={unit}
      canEdit={canEdit}
      attachOverride={attachOverride}
      onAttachChange={(key, urls) => setAttachOverride((m) => ({ ...m, [key]: urls }))}
    />
  );

  /**
   * เคสที่กดข้ามมา. แผงเดียวกับที่หน้า /cases ใช้บนมือถือ — แผงลอยไม่ใช่หน้าใหม่ เพราะคนที่กด
   * มาดูแก้วน้ำกำลังอ่านประวัติของชามรูปไตค้างไว้ ทั้งตัวกรองและหน้าที่เปิดอยู่. พาออกไปอีกหน้า
   * แล้วกดกลับ = เริ่มอ่านใหม่ตั้งแต่ต้น.
   *
   * `onOpenCase` ของแผงชี้กลับมาที่ตัวเอง: จากใบเบิกใบเดียวกันข้ามไปได้อีกทอด โดยไม่ซ้อนแผงเพิ่ม
   * — มันคือ state ตัวเดียวที่เปลี่ยนค่า.
   */
  const peekSheet = (
    <Sheet open={!!peek} onOpenChange={(o) => { if (!o) setPeek(null); }}>
      {/* ความกว้างชุดเดียวกับหน้า /cases — หัวเคสสองบรรทัด + ป้ายสองอัน + แท็บสี่อัน ไม่พอที่ 384 */}
      <SheetContent
        side="right"
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[520px]"
        showCloseButton={false}
      >
        {/* ปุ่มปิดสำเร็จรูปของ Sheet เป็น absolute top-3 right-3 ซึ่งตกทับปุ่มลงมือบนหัวเคสพอดี */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
          <SheetTitle className="text-sm font-semibold">รายละเอียดเคส</SheetTitle>
          <SheetClose render={<Button variant="ghost" size="icon-sm" />}>
            <X className="size-4" />
            <span className="sr-only">ปิด</span>
          </SheetClose>
        </div>
        <SheetDescription className="sr-only">ไทม์ไลน์ รายละเอียด หลักฐาน และเคสที่เกี่ยวข้องของเคสที่กดข้ามมา</SheetDescription>
        {/* min-h-0 คู่กับ flex-1: flex child ที่ basis 0% ในพ่อที่สูงไม่แน่นอนจะไม่ยอมหด แล้ว
            ไทม์ไลน์ยาวๆ จะดันแผงทะลุจอแทนที่จะเลื่อนอยู่ข้างใน */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {peek && <CaseDetailPane bare caseId={peek} onOpenCase={setPeek} canEdit={canEdit} />}
        </div>
      </SheetContent>
    </Sheet>
  );

  if (isMobile) {
    return (
      <div className="space-y-4">
        {filters}
        {active ? (
          <div>
            <Button variant="ghost" className="mb-2 gap-1.5" onClick={() => setSelected(null)}>
              <ArrowLeft className="size-4" /> กลับไปรายการ
            </Button>
            {detail}
          </div>
        ) : list}
        {peekSheet}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {filters}
      {/* 1:2 เหมือนหน้ารายการสิ่งที่ต้องทำ — รายการมีแค่ชื่อ/วันที่/จำนวน ส่วนรายละเอียดคือที่ที่
          ไทม์ไลน์กับหลักฐานอยู่จริง. minmax(0,…) ไม่ใช่ 1fr/2fr เปล่า: track ที่เป็น auto ปล่อยให้
          ข้อความยาวดันคอลัมน์บวม.

          แตกสองคอลัมน์ที่ xl ไม่ใช่ lg อย่างหน้ารายการสิ่งที่ต้องทำ: หน้านั้นกินความกว้างเต็มจอ
          ส่วนตรงนี้อยู่ในหน้าที่มีแถบเมนูซ้ายกินไปแล้วราว 256px. ที่ 1024px คอลัมน์ซ้ายจึงเหลือ
          233px ซึ่งตัดคำว่า "รับคืนจากซ่อม" เหลือ "รับคืนจาก…" ทุกแถว. ที่ 1280 ได้ ~330px
          เท่ากับที่หน้าเคสได้ตอน 1024. */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {list}
        {detail}
      </div>
      {peekSheet}
    </div>
  );
}

function EmptyPane() {
  return (
    <section className="grid place-items-center rounded-2xl border border-dashed border-border bg-card/40 py-24">
      <p className="text-sm text-muted-foreground">เลือกรายการทางซ้ายเพื่อดูรายละเอียด</p>
    </section>
  );
}

const dayCount = (from: string) => Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 86_400_000));

const tripTone = (trip: RepairTrip) => trip.done
  ? "bg-success/10 text-success-700 dark:text-success-200"
  : "bg-warning/15 text-warning-700 dark:text-warning-200";

const CASE_META: Record<string, { icon: typeof Package; name: string; done: string; open: string }> = {
  REPAIR: { icon: Wrench, name: "งานซ่อม", done: "ปิดงานแล้ว", open: "ยังไม่ปิด" },
  BORROW: { icon: ArrowUpFromLine, name: "การยืม", done: "คืนครบแล้ว", open: "ยังไม่คืนครบ" },
  // เบิกใช้ปิดตั้งแต่เกิด — `open` จึงเขียนเหมือน `done` ไม่ใช่ปล่อยว่าง: ป้ายที่ว่างเปล่าอ่านเหมือน
  // ข้อมูลหาย ส่วนคำว่า "ยังไม่..." จะบอกว่ามีอะไรค้างอยู่ ทั้งที่ไม่มี.
  DISPENSE: { icon: ShoppingCart, name: "การเบิกใช้", done: "เบิกออกแล้ว", open: "เบิกออกแล้ว" },
  INUSE: { icon: MonitorCog, name: "ตั้งใช้ในห้อง", done: "คืนเข้าพัสดุแล้ว", open: "ยังตั้งใช้อยู่" },
  MAINTENANCE: { icon: Wrench, name: "บำรุงรักษา", done: "เสร็จสิ้น", open: "ยังไม่ปิด" },
};

/** คำกริยาหน้าวันที่เปิดเคส — "ยืม 31 ส.ค." ไม่ใช่ "แจ้ง 31 ส.ค." ซึ่งเป็นภาษาของงานซ่อม. */
const OPENED_VERB: Record<string, string> = { BORROW: "ยืม", INUSE: "ตั้งใช้", DISPENSE: "เบิก" };

/** เคสประเภทที่ยังไม่มีหน้าตาของตัวเอง อ่านเป็นงานซ่อมไว้ก่อน ดีกว่าพังทั้งแถว. */
const caseMeta = (t: string) => CASE_META[t] ?? CASE_META.REPAIR;

const caseIdOf = (trip: RepairTrip) => `${trip.caseType}:${trip.id}`;

/**
 * บรรทัดล่างของเคส. ไม่พิมพ์จำนวนซ้ำ — มันอยู่ในช่องขวาของแถวแล้ว ช่องเดียวกับที่กิจกรรมเดี่ยว
 * พิมพ์ตัวเลขของมัน และแถวที่เขียน "23 ชิ้น" สองที่คือแถวที่ทำให้สายตาสะดุด.
 */
function tripMeta(trip: RepairTrip): string {
  const opened = OPENED_VERB[trip.caseType] ?? "แจ้ง";
  return [
    trip.done
      ? `${opened} ${fmtDate(trip.openedAt, TH_DATE)}`
      : `${opened} ${fmtDate(trip.openedAt, TH_DATE)} · ผ่านมา ${dayCount(trip.openedAt)} วัน`,
    trip.cost != null ? `ค่าใช้จ่าย ${trip.cost.toLocaleString("th-TH")}` : null,
    trip.attachments > 0 ? `หลักฐาน ${trip.attachments}` : null,
  ].filter(Boolean).join(" · ");
}

/** The rail every entry hangs off. `last` stops the line instead of running it off the end. */
function Rail({ children, last, dot }: { children: ReactNode; last?: boolean; dot: ReactNode }) {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 sm:gap-x-4">
      <div className="flex flex-col items-center">
        {dot}
        {!last && <span aria-hidden className="w-px flex-1 bg-border" />}
      </div>
      <div className={cn("min-w-0", last ? "pb-0" : "pb-4")}>{children}</div>
    </li>
  );
}

/**
 * ทุกแถวในไทม์ไลน์ — เคสหรือกิจกรรมเดี่ยว — เป็นการ์ดใบเดียวกัน.
 *
 * เดิมมีสอง renderer: เคสได้กล่องมีขอบ มีชื่อประเภทตัวหนา มีป้ายสถานะ; กิจกรรมเดี่ยวได้แถวเปล่า
 * ไม่มีขอบ ชื่อประเภทอยู่ในชิปสี ชื่อเรื่องขึ้นเป็นหัว. ผลคือไล่สายตาลงมาในลิสต์เดียวกันแล้วต้อง
 * สลับวิธีอ่านทุกสองแถว ทั้งที่คำถามคือคำถามเดิม — "นี่เรื่องอะไร ของขยับเท่าไหร่ เมื่อไหร่".
 *
 * ที่ยังต่างคือ**เนื้อ** ไม่ใช่โครง: กิจกรรมเดี่ยวไม่มีเลขเคสและไม่มีป้ายสถานะ เพราะมันเกิดครั้งเดียว
 * จบ ไม่มีใครรออยู่ปลายทาง (เหตุผลเดียวกับที่ EventDetailPane ไม่พิมพ์ป้าย). ช่องที่ไม่มีของก็แค่
 * ไม่ขึ้น — ไม่ต้องประดิษฐ์เลขเคสให้ของที่ไม่มี lifecycle เพียงเพื่อให้สองแถวเท่ากัน.
 */
type Row = {
  icon: typeof Package;
  tone: string;
  name: string;
  status: string | null;
  title: string;
  sub: string | null;
  meta: ReactNode;
  /** ตัวเลขมุมขวา; `neutral` = นับจำนวน ไม่ใช่การขยับสต๊อก จึงไม่ทาสี */
  value: number | null;
  neutral: boolean;
  delta: number | null;
  change?: { from: number; to: number } | null;
  /** ยังค้างอยู่ — ขอบเหลือง. กิจกรรมเดี่ยวจบในตัวเสมอ */
  open: boolean;
};

function rowOf(u: Unit): Row {
  if (isTrip(u)) {
    const m = caseMeta(u.caseType);
    return {
      icon: m.icon,
      tone: tripTone(u),
      name: m.name,
      status: u.statusLabel || (u.done ? m.done : m.open),
      title: u.subject,
      sub: null,
      meta: (
        <>
          {u.code && <><span className="font-mono">{u.code}</span> · </>}
          {/* เคสสามใบของสามชิ้นในรายการเดียวกันอ่านเหมือนกันทุกตัวอักษรถ้าไม่บอกว่าชิ้นไหน */}
          {u.subCode && <><span className="font-mono">{u.subCode}</span> · </>}
          {tripMeta(u)} · {u.steps.length} ขั้นตอน
        </>
      ),
      value: u.qty,
      neutral: true,
      delta: null,
      open: !u.done,
    };
  }
  const m = TYPE_META[u.type] ?? TYPE_META.ADJUSTMENT;
  return {
    icon: m.icon,
    tone: m.chip,
    name: EVENT_TYPE_LABELS[u.type] ?? u.type,
    status: null,
    title: u.note,
    sub: u.subtitle || null,
    meta: <>{u.user} · <span className="tabular-nums">{fmtDate(u.date, TH_DATE)} {timeOf(u.date)} น.</span></>,
    value: u.delta ?? u.qty,
    neutral: u.delta === null,
    delta: u.delta,
    change: u.change,
    open: false,
  };
}

function TimelineRow({ u, unit, selected, onSelect, last }: {
  u: Unit;
  unit: string;
  selected: boolean;
  onSelect: () => void;
  last?: boolean;
}) {
  const r = rowOf(u);
  const Icon = r.icon;
  return (
    <Rail
      last={last}
      dot={<span aria-hidden className={cn("mt-3.5 grid size-6 shrink-0 place-items-center rounded-full", r.tone)}>
        <Icon className="size-3.5" />
      </span>}
    >
      {/* เคสไม่กางขั้นตอนในตัวเอง — ช่องขวาเล่าครบอยู่แล้ว กางซ้ำคือเรื่องเดียวกันสองที่บนจอเดียว */}
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected}
        className={cn(
          "group grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-3 overflow-hidden rounded-xl border px-3 py-2.5 text-left transition",
          selected
            ? "border-primary bg-primary/5"
            : r.open ? "border-warning/40 hover:bg-muted/40" : "border-border hover:bg-muted/40",
        )}
      >
        <span className="min-w-0">
          {/* ประเภท → เรื่อง → เลขอ้างอิง. รหัสเคยนำหัวการ์ด ซึ่งอ่านแล้วรู้แค่ว่า "นี่คือเคส" —
              RC-2569-0320 กับ RC-2569-0321 หน้าตาเหมือนกันเป๊ะ. ชื่อพัสดุไม่อยู่ที่นี่: หน้านี้คือ
              หน้าของพัสดุตัวนั้นอยู่แล้ว เขียนซ้ำทุกการ์ดคือ noise (หน้าเคสเขียน เพราะปนหลายตัว). */}
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold">{r.name}</span>
            {r.status && (
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap", r.tone)}>
                {r.status}
              </span>
            )}
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </span>
          {r.title && <span className="mt-0.5 block truncate text-sm text-foreground">{r.title}</span>}
          {r.sub && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{r.sub}</span>}
          <span className="mt-1 block truncate text-[11px] text-muted-foreground">{r.meta}</span>
        </span>
        <span className="shrink-0 text-right">
          <Delta value={r.value} unit={unit} neutral={r.neutral} />
          <ChangeHint delta={r.delta} change={r.change} />
        </span>
      </button>
    </Rail>
  );
}

// The table answers "ใครทำอะไร กี่ชิ้น เมื่อไหร่"; everything quieter — the balance change, the
// supporting context, the free-text note — lives here so it never crowds the row.
const attachKey = (g: { recordType: AttachRecordType; recordId: string }) => `${g.recordType}:${g.recordId}`;

// A รับคืนจากซ่อม row is one event told by three records. Which one a folded-in group came from
// is the difference between "the bill" and "the photos of the damage", so the label says it.
const FOLDED_LABEL: Record<AttachRecordType, string> = {
  MaintenanceRecord: "ไฟล์จากใบส่งซ่อมของรายการนี้ — แก้ได้ที่แท็บบำรุงรักษา",
  StockAdjustment: "ไฟล์ตอนแจ้งชำรุดและส่งซ่อม — แก้ได้ที่รายการแจ้งชำรุด",
  ItemStatusLog: "ไฟล์จากการเปลี่ยนสถานะของรายการนี้",
};

/**
 * รายละเอียดของกิจกรรมที่ไม่ใช่เคส — รับเข้า, ปรับสต๊อก, ย้ายที่ตั้ง, เปลี่ยนสถานะ.
 *
 * ยึดช่องขวาช่องเดียวกับ CaseDetailPane และ **หน้าตาเดียวกัน**: หัวเดียวกัน แถบแท็บเดียวกัน
 * ลำดับแท็บเดียวกัน. ก่อนหน้านี้ช่องนี้เป็นตาราง label/value เปล่าๆ ผลคือช่องขวาพูดสองภาษา —
 * กดแถวหนึ่งได้การ์ดมีหัวมีแท็บ กดแถวถัดไปได้ตารางเปล่า ทั้งที่คนอ่านถามคำถามเดียวกันทั้งสองครั้ง.
 *
 * ที่ยังต่างคือเลขเคส: กิจกรรมพวกนี้ไม่มีเลข เพราะไม่มีอะไรให้อ้างถึง — มันเกิดครั้งเดียวจบ
 * ไม่มีสถานะ ไม่มีใครรออยู่ปลายทาง. เปลือกเหมือนกันได้โดยไม่ต้องประดิษฐ์เคสให้ของที่ไม่มี lifecycle.
 *
 * แท็บ "เกี่ยวข้อง" ไม่มีที่นี่: เคสอ้างถึงเคสอื่นได้ (การคืนที่เปิดงานซ่อม) กิจกรรมเดี่ยวไม่มีเส้น
 * แบบนั้นเลยสักเส้น และแท็บที่ว่างเปล่าทุกครั้งคือแท็บที่สอนคนอ่านให้เลิกกดแท็บ.
 */
const EVENT_TABS = [
  { value: "timeline", label: "ไทม์ไลน์" },
  { value: "info", label: "รายละเอียด" },
  { value: "files", label: "หลักฐาน" },
] as const;

function EventDetailPane({ event, unit, canEdit, attachOverride, onAttachChange }: {
  event: TimelineEvent;
  unit: string;
  canEdit: boolean;
  attachOverride: Record<string, string[]>;
  onAttachChange: (key: string, urls: string[]) => void;
}) {
  const [tab, setTab] = useState<(typeof EVENT_TABS)[number]["value"]>("timeline");
  // กลับไปแท็บแรกทุกครั้งที่เปลี่ยนแถว — แท็บที่คนเปิดค้างไว้บนแถวก่อนหน้าไม่ได้บอกอะไรเกี่ยวกับ
  // แถวใหม่. เหมือน CaseDetailPane ที่ setTab("timeline") ทุกครั้งที่เคสเปลี่ยน.
  useEffect(() => { setTab("timeline"); }, [event.id]);

  // groups[0] is the record this timeline row IS; anything after it was folded in from a second
  // record telling the same event (a qty รับคืนจากซ่อม carries the closing MaintenanceRecord).
  // Only the first is editable — two identical "แนบเพิ่ม" buttons on one row is a choice nobody
  // can make, and the folded-in record is editable on its own บำรุงรักษา tab anyway. A folded-in
  // group with no files has nothing to say here, so it does not render at all.
  const all = (event.attachments ?? []).map((g) => ({ ...g, urls: attachOverride[attachKey(g)] ?? g.urls }));
  const groups = all.filter((g, i) => i === 0 || g.urls.length > 0);
  const fileCount = groups.reduce((n, g) => n + g.urls.length, 0);
  // แท็บหลักฐานยังอยู่ตอนที่ยังไม่มีไฟล์ ถ้าคนคนนั้นแนบได้ — ที่ว่างคือที่ที่ปุ่มแนบเพิ่มอยู่.
  const showFiles = groups.length > 0 && (fileCount > 0 || canEdit);
  const tabs = EVENT_TABS.filter((t) => t.value !== "files" || showFiles);

  const meta = TYPE_META[event.type] ?? TYPE_META.ADJUSTMENT;
  const Icon = meta.icon;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <header className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 border-b border-border px-5 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", meta.chip)}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          {/* ป้ายเส้นขอบ+ไอคอน = ประเภท ตามกฎเดียวกับหัวเคส. ป้ายทึบ+จุด (= สถานะ) ไม่มีที่นี่:
              กิจกรรมเดี่ยวไม่มีสถานะให้รายงาน และป้ายที่เขียนว่า "บันทึกแล้ว" ทุกใบคือหมึกที่
              ไม่ได้แยกอะไรออกจากอะไร. */}
          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            <Icon className="size-3" />
            {EVENT_TYPE_LABELS[event.type] ?? event.type}
          </span>
          <h2 className="mt-1 text-lg font-semibold leading-tight tracking-tight">{event.note}</h2>
          {event.subtitle && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{event.subtitle}</p>}
          <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground tabular-nums">
            {fmtDate(event.date, TH_DATE)} · {timeOf(event.date)} น.
          </p>
        </div>
        {/* ที่เดียวกับปุ่มปิดเคสบนหัวเคส — มุมนี้คือ "สิ่งที่แถวนี้ทำกับของ" */}
        <div className="col-start-2 sm:col-start-3 sm:row-start-1 sm:text-right">
          <Delta value={event.delta ?? event.qty} unit={unit} size="lg" neutral={event.delta === null} />
        </div>
      </header>

      <div className="flex gap-1 overflow-x-auto border-b border-border bg-muted/30 px-3">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={cn(
              "relative shrink-0 px-3 py-2.5 text-sm font-medium transition",
              tab === t.value ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.value === "files" && fileCount > 0 && (
              <span className="ml-1.5 text-[11px] tabular-nums text-muted-foreground">{fileCount}</span>
            )}
            {tab === t.value && <span aria-hidden className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />}
          </button>
        ))}
      </div>

      <div className="p-5">
        {/* ขั้นเดียว เพราะกิจกรรมนี้มีขั้นเดียวจริงๆ — ไม่ใช่ไทม์ไลน์ที่ยังโหลดไม่เสร็จ. เส้นเชื่อม
            จึงไม่มี: เส้นที่ลากลงไปหาที่ว่างคือคำสัญญาว่ามีขั้นถัดไป. */}
        {tab === "timeline" && (
          <ol>
            <Rail last dot={<span aria-hidden className={cn("mt-1.5 size-3 shrink-0 rounded-full", meta.rail)} />}>
              <p className="text-sm font-semibold leading-tight">{event.note}</p>
              {event.subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{event.subtitle}</p>}
              {event.notes && <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{event.notes}</p>}
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                <Avatar name={event.user} />
                {event.user}
                <span className="tabular-nums">· {fmtDate(event.date, TH_DATE)} {timeOf(event.date)} น.</span>
              </p>
            </Rail>
          </ol>
        )}

        {tab === "info" && (
          <dl className="divide-y divide-border">
            <DetailRow label="รายการ" value={<span className="font-medium text-foreground">{event.note}</span>} />
            {event.subtitle && <DetailRow label="รายละเอียด" value={event.subtitle} />}
            {event.change && (
              <DetailRow
                label="จำนวนคงเหลือ"
                value={
                  <span className="tabular-nums">
                    <span className="text-muted-foreground">{event.change.from}</span>
                    <span className="mx-1.5 text-muted-foreground">→</span>
                    <span className="font-semibold text-foreground">{event.change.to}</span>
                    {unit && <span className="ml-1 text-xs text-muted-foreground">{unit}</span>}
                  </span>
                }
              />
            )}
            {event.cost != null && (
              <DetailRow
                label="ค่าซ่อม"
                value={<span className="tabular-nums">{event.cost.toLocaleString("th-TH")} บาท</span>}
              />
            )}
            {event.notes && <DetailRow label="หมายเหตุ" value={<span className="whitespace-pre-wrap">{event.notes}</span>} />}
            <DetailRow
              label="ผู้ดำเนินการ"
              value={
                <span className="inline-flex items-center gap-2">
                  <Avatar name={event.user} />
                  {event.user}
                </span>
              }
            />
            <DetailRow
              label="วันที่ / เวลา"
              value={<span className="tabular-nums">{fmtDate(event.date, TH_DATE)} · {timeOf(event.date)} น.</span>}
            />
          </dl>
        )}

        {tab === "files" && (
          <div className="space-y-2">
            {groups.map((g, i) =>
              i === 0 ? (
                <AttachmentList
                  key={attachKey(g)}
                  urls={g.urls}
                  target={{ recordType: g.recordType, recordId: g.recordId }}
                  canEdit={canEdit}
                  onChange={(urls) => onAttachChange(attachKey(g), urls)}
                />
              ) : (
                // Folded in from another record of the same event. Read-only here and
                // labelled with where it came from, so "แนบเพิ่ม" is never ambiguous
                // about which record it would write to. The ประวัติ popover still works.
                <div key={attachKey(g)} className="space-y-1.5 border-t border-dashed border-border pt-2">
                  <p className="text-[11px] text-muted-foreground">{FOLDED_LABEL[g.recordType]}</p>
                  <AttachmentList urls={g.urls} target={{ recordType: g.recordType, recordId: g.recordId }} />
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-foreground">{value}</dd>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary"
    >
      {name.trim().charAt(0) || "?"}
    </span>
  );
}

// No +/- sign — colour carries direction (green up, red down). Four cases: null = never
// touched stock (สถานะ/ซ่อม/ย้ายที่), 0 = came back but written off — neither painted gain/loss.
// back but written off, so neither may be painted as a gain or a loss.
function Delta({ value, unit, size, neutral }: { value: number | null; unit: string; size?: "lg"; neutral?: boolean }) {
  if (value === null) return <span className="text-sm text-muted-foreground">—</span>;
  const tone =
    // A count that is not a movement (ส่งซ่อม) gets no colour — green would claim stock came in.
    neutral ? "text-foreground"
      : value > 0 ? "text-success-700 dark:text-success-200"
      : value < 0 ? "text-destructive dark:text-danger-400"
      : "text-muted-foreground";
  return (
    <span className={cn("font-semibold tabular-nums", size === "lg" ? "text-base" : "text-sm", tone)}>
      {Math.abs(value)}
      {unit && <span className="ml-1 text-[11px] font-normal text-muted-foreground">{unit}</span>}
    </span>
  );
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false });

// The quieter second line under the count. `change` (the yard before → after) reads better than
// a bare signed number, so it wins when present; otherwise the signed delta gives the direction
// the abs count above cannot. Rows that never moved stock (delta null) or corrected nothing
// (delta 0, a written-off return) get no line — there is no movement to caption.
function ChangeHint({ delta, change }: { delta: number | null; change?: { from: number; to: number } | null }) {
  if (change) {
    return (
      <span className="mt-0.5 block font-mono text-[10px] tabular-nums text-muted-foreground">
        {change.from} → {change.to}
      </span>
    );
  }
  if (delta === null || delta === 0) return null;
  const tone = delta > 0 ? "text-success-700 dark:text-success-200" : "text-destructive dark:text-danger-400";
  return (
    <span className={cn("mt-0.5 block font-mono text-[10px] tabular-nums", tone)}>
      {delta > 0 ? "+" : "−"}{Math.abs(delta)}
    </span>
  );
}


// ── Filter controls ───────────────────────────────────────────────────────────
// เตี้ยกว่าปกติ (h-8) เท่ากับที่เวิร์กสเปซเคสใช้ — แถบตัวกรองอยู่เหนือตารางที่ความหนาแน่นคือประโยชน์
// ของมัน ปุ่มขนาดฟอร์มเต็มตัวจะดันตารางลงไปพ้นจอตั้งแต่ยังไม่ทันอ่าน.

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-[150px] flex-1 sm:flex-none">
      <p className="mb-1.5 text-[11px] text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function FilterSelect({ icon: Icon, value, onValueChange, options }: {
  icon: typeof Package;
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={(v) => onValueChange((v as string) ?? "all")}>
      <SelectTrigger className="h-8 w-full gap-1.5 text-xs">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        {/* Base UI: SelectValue ต้องได้ label มาเอง ไม่งั้นมันพิมพ์ค่าดิบออกมา */}
        <SelectValue>{options.find((o) => o.value === value)?.label ?? ""}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
