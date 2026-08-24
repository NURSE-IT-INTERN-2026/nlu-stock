"use client";

import { useState, useCallback } from "react";
import type { ReactNode } from "react";
import { fmtDate, TH_DATE } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShoppingCart, ArrowDownToLine, ArrowUpFromLine, Undo2, Package,
  RefreshCw, Wrench, MapPin, MonitorCog, Flag, ChevronRight, ChevronDown, ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { getItemHistory } from "@/lib/api";
import { Pagination } from "@/components/shared/pagination";
import { PAGE_SIZE } from "@/lib/pagination-constants";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { usePagedList } from "@/hooks/use-paged-list";
import { EVENT_TYPE_LABELS, type TimelineEventType } from "@/lib/constants";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DIALOG_SHELL_FIT, DIALOG_BODY } from "@/components/ui/dialog";

import { AttachmentList } from "@/components/shared/attachment-list";
import type { AttachRecordType } from "@/lib/attachments";
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
};

const CHIP_ORDER: TimelineEventType[] = [
  "DISPENSE", "BORROW", "INUSE", "RETURN", "RECEIVE",
  "ADJUSTMENT", "DAMAGE_REPORT", "REPAIR_SENT", "REPAIR_RETURN", "STATUS_CHANGE", "MAINTENANCE", "LOCATION_CHANGE",
];

// The ซ่อมบำรุง group tab used to exist because the four repair types were scattered and the
// reader had to know which of the twelve chips to click to see a repair whole. The trip card
// answers that directly now, so the coarse tabs are gone and the chips are the only filter.

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
  const [typeFilter, setTypeFilter] = useState<TimelineEventType | "">("");
  const [counts, setCounts] = useState<Counts>({});
  const [unit, setUnit] = useState("");
  const [selected, setSelected] = useState<TimelineEvent | null>(null);
  const perPage = PAGE_SIZE.DEFAULT;

  const fetchPage = useCallback(
    async (p: number) => {
      const qs = new URLSearchParams({ page: String(p), perPage: String(perPage) });
      if (typeFilter) qs.set("type", typeFilter);
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
    [itemId, subItemId, perPage, typeFilter],
  );

  const {
    items: events, total, page, totalPages, loading, isLoadingMore, hasNext, loadMore, setPage,
  } = usePagedList<Unit>({ fetchPage, pageSize: perPage, isMobile });

  // แนบเพิ่ม/ลบ answers with the record's array as it now stands. Keeping those answers here —
  // keyed by the record, not by the timeline row — means they survive closing the dialog, paging,
  // and filtering, without a refetch of seven tables to repaint one thumbnail.
  const [attachOverride, setAttachOverride] = useState<Record<string, string[]>>({});

  // Every chip counts events, never units. The word "รายการ" is dropped from each pill — the
  // caption above already frames these as counts, so a bare number reads compact and premium
  // instead of stacking "รายการ" seven times across a row that overflows the card.
  // How many lines the table actually draws — a case is one รายการ but several rows.
  const rowCount = events.reduce((n, u) => n + (isTrip(u) ? u.steps.length + 1 : 1), 0);
  const allRows = CHIP_ORDER.reduce((sum, t) => sum + (counts[t]?.n ?? 0), 0);
  const chips: { value: TimelineEventType | ""; label: string; amount: string }[] = [
    { value: "", label: "ทั้งหมด", amount: `${allRows}` },
    ...CHIP_ORDER.filter((t) => (counts[t]?.n ?? 0) > 0).map((t) => {
      const c = counts[t]!;
      return {
        value: t,
        label: EVENT_TYPE_LABELS[t],
        amount: `${c.n}`,
      };
    }),
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      {/* ── Header ──
          The four bands are one card, so their padding is what tells them apart: the header
          breathes most, the filter half as much, the table least (it is data — density is the
          point), the footer back to the filter's rhythm. Equal padding everywhere is what made
          the card read as one dense block with hairlines through it. */}
      <header className="border-b border-border px-5 py-6 sm:px-8">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">กิจกรรม</p>
        <h2 className="mt-1.5 text-lg font-semibold leading-tight tracking-tight">ประวัติ</h2>
      </header>

      {/* ── Filter pills ──
          Labelled "รวมทั้งประวัติ" on purpose: the stock card above these tabs shows ถูกยืม as
          the units still out *right now*, while these chips count how many events of each kind
          were ever recorded. Two different meanings under one word on one screen needs the caption. */}
      <div className="border-b border-border bg-muted/30 px-5 py-4 sm:px-8">
        <p className="mb-2.5 text-[11px] text-muted-foreground">
          รวมทั้งประวัติ{typeFilter ? " · กรองอยู่ จึงแสดงเป็นรายการเดี่ยว ไม่รวมเป็นงานซ่อม" : ""}
        </p>
        <div className="flex gap-2 overflow-x-auto">
          {chips.map((chip) => {
            const on = typeFilter === chip.value;
            return (
              <button
                key={chip.value || "all"}
                onClick={() => setTypeFilter(chip.value)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium transition",
                  on
                    ? "border-transparent bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                {chip.label}
                <span className={cn("font-semibold tabular-nums", on ? "text-primary-foreground" : "text-foreground/80")}>
                  {chip.amount}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2 p-4 sm:p-6">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      ) : events.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">ไม่มีรายการในหมวดนี้</p>
      ) : (
        <ol className="p-4 sm:p-6">
          {events.map((u, i) => (
            isTrip(u)
              ? <CaseBlock key={`case:${u.id}`} trip={u} unit={unit} onSelect={setSelected} last={i === events.length - 1} />
              : <MovementRow key={u.id} e={u} unit={unit} onSelect={setSelected} last={i === events.length - 1} />
          ))}
        </ol>
      )}

      {/* ── Footer / pagination ── */}
      {!loading && events.length > 0 && (
        <div className="space-y-2 border-t border-border bg-muted/30 px-5 py-4 sm:px-8">
          <p className="text-xs text-muted-foreground">
            แสดง <span className="font-semibold tabular-nums text-foreground">{events.length}</span> จาก{" "}
            <span className="tabular-nums">{total}</span> รายการ
            {/* A case counts as one รายการ but prints several rows. Saying "4 จาก 4" over a table
                of ten lines reads like a bug unless the rows are named too. */}
            {rowCount !== events.length && <> · <span className="tabular-nums">{rowCount}</span> เหตุการณ์</>}
          </p>
          {totalPages > 1 && (isMobile ? (
            <Pagination
              mode="loadMore"
              shown={events.length}
              total={total}
              hasMore={hasNext}
              isLoading={isLoadingMore}
              onLoadMore={loadMore}
            />
          ) : (
            <Pagination page={page} total={total} pageSize={perPage} onChange={setPage} />
          ))}
        </div>
      )}

      <EventDetailDialog
        event={selected}
        unit={unit}
        canEdit={canEdit}
        attachOverride={attachOverride}
        onAttachChange={(key, urls) => setAttachOverride((m) => ({ ...m, [key]: urls }))}
        onClose={() => setSelected(null)}
      />
    </section>
  );
}

// ── Repair trip ───────────────────────────────────────────────────────────────
// Closed trips arrive folded: the reader scanning a year of history wants the one line that
// says "ซ่อมไปแล้ว จบ เท่าไหร่". An open one arrives expanded, because an open trip is the thing
// somebody is waiting on and hiding its last step is hiding the answer.

const dayCount = (from: string) => Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 86_400_000));

const tripTone = (trip: RepairTrip) => trip.done
  ? "bg-success/10 text-success-700 dark:text-success-200"
  : "bg-warning/15 text-warning-700 dark:text-warning-200";

const CASE_META: Record<string, { icon: typeof Package; name: string; done: string; open: string }> = {
  REPAIR: { icon: Wrench, name: "งานซ่อม", done: "ปิดงานแล้ว", open: "ยังไม่ปิด" },
  BORROW: { icon: ArrowUpFromLine, name: "การยืม", done: "คืนครบแล้ว", open: "ยังไม่คืนครบ" },
  INUSE: { icon: MonitorCog, name: "ตั้งใช้ในห้อง", done: "คืนเข้าพัสดุแล้ว", open: "ยังตั้งใช้อยู่" },
  MAINTENANCE: { icon: Wrench, name: "บำรุงรักษา", done: "เสร็จสิ้น", open: "ยังไม่ปิด" },
  KIT_CHECK: { icon: Package, name: "ตรวจชุด", done: "ตรวจแล้ว", open: "รอตรวจ" },
};

/** เคสประเภทที่ยังไม่มีหน้าตาของตัวเอง อ่านเป็นงานซ่อมไว้ก่อน ดีกว่าพังทั้งแถว. */
const caseMeta = (t: string) => CASE_META[t] ?? CASE_META.REPAIR;

const caseIdOf = (trip: RepairTrip) => `${trip.caseType}:${trip.id}`;

/**
 * The trip's second line. In the table it must NOT repeat the count or the date — those columns
 * are right there saying the same thing, and a row that prints "23 ชิ้น" twice is what makes the
 * eye stop. On mobile there are no columns to carry them, so `full` puts them back.
 */
function tripMeta(trip: RepairTrip, unit: string, full = false): string {
  const opened = trip.caseType === "BORROW" ? "ยืม" : "แจ้ง";
  return [
    full && trip.qty != null ? `${trip.qty}${unit ? ` ${unit}` : ""}` : null,
    trip.done
      ? `${opened} ${fmtDate(trip.openedAt, TH_DATE)}`
      : `${opened} ${fmtDate(trip.openedAt, TH_DATE)} · ผ่านมา ${dayCount(trip.openedAt)} วัน`,
    trip.cost != null ? `฿${trip.cost.toLocaleString("th-TH")}` : null,
    trip.attachments > 0 ? `หลักฐาน ${trip.attachments}` : null,
  ].filter(Boolean).join(" · ");
}

function CaseIcon({ trip, className }: { trip: RepairTrip; className?: string }) {
  const Icon = caseMeta(trip.caseType).icon;
  return <Icon className={className} />;
}

/** ไปเปิดเคสเดียวกันที่แท็บเคสงานในหน้ารายงาน — เลขเดียวกัน ที่มาเดียวกัน ไม่ใช่ log คนละกอง. */
function CaseLink({ trip }: { trip: RepairTrip }) {
  return (
    <Link
      href={`/reports?tab=cases&case=${encodeURIComponent(caseIdOf(trip))}`}
      onClick={(e) => e.stopPropagation()}
      title="เปิดเคสนี้"
      aria-label={`เปิดเคส ${trip.code}`}
      className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-background hover:text-foreground"
    >
      <ExternalLink className="size-3.5" />
    </Link>
  );
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
 * เคสหนึ่งเคสในประวัติของพัสดุ — กล่องเดียว มีขั้นตอนอยู่ข้างใน อ่านเก่า→ใหม่ เหมือนหน้า /cases เป๊ะ
 * เพราะมันคือเคสเดียวกัน เลขเดียวกัน. เคสที่ปิดแล้วมาแบบพับ เคสที่ยังค้างมาแบบกาง — สิ่งที่ค้างอยู่คือ
 * สิ่งที่คนเปิดหน้านี้มาหา.
 */
function CaseBlock({ trip, unit, onSelect, last }: {
  trip: RepairTrip;
  unit: string;
  onSelect: (e: TimelineEvent) => void;
  last?: boolean;
}) {
  const [open, setOpen] = useState(!trip.done);
  const tone = tripTone(trip);
  return (
    <Rail
      last={last}
      dot={<span aria-hidden className={cn("mt-3.5 grid size-6 shrink-0 place-items-center rounded-full", tone)}>
        <CaseIcon trip={trip} className="size-3.5" />
      </span>}
    >
      <div className={cn("overflow-hidden rounded-xl border", trip.done ? "border-border" : "border-warning/40")}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-start gap-2 bg-muted/30 px-3 py-2.5 text-left transition hover:bg-muted/50"
        >
          {/* ประเภท → เรื่อง → เลขอ้างอิง. รหัสเคยนำหัวการ์ด ซึ่งอ่านแล้วรู้แค่ว่า "นี่คือเคส" —
              RC-2569-0320 กับ RC-2569-0321 หน้าตาเหมือนกันเป๊ะ. ชื่อพัสดุไม่อยู่ที่นี่: หน้านี้คือ
              หน้าของพัสดุตัวนั้นอยู่แล้ว เขียนซ้ำทุกการ์ดคือ noise (หน้า /cases เขียน เพราะปนหลายตัว). */}
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-semibold">{caseMeta(trip.caseType).name}</span>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap", tone)}>
                {trip.statusLabel || (trip.done ? caseMeta(trip.caseType).done : caseMeta(trip.caseType).open)}
              </span>
            </span>
            {trip.subject && (
              <span className="mt-0.5 block truncate text-sm text-foreground">{trip.subject}</span>
            )}
            <span className="mt-1 block truncate text-[11px] text-muted-foreground">
              {trip.code && <><span className="font-mono">{trip.code}</span> · </>}
              {tripMeta(trip, unit, true)} · {trip.steps.length} ขั้นตอน
            </span>
          </span>
          <ChevronDown className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
          {trip.code && <CaseLink trip={trip} />}
        </button>

        {open && (
          <ol className="divide-y divide-border">
            {trip.steps.map((step) => (
              <CaseStepRow key={step.id} e={step} unit={unit} onSelect={onSelect} />
            ))}
          </ol>
        )}
      </div>
    </Rail>
  );
}

/** ขั้นตอนหนึ่งขั้นในเคส. จำนวนขึ้นเฉพาะตอนสต๊อกขยับจริง — ยอดของเคสอยู่บนหัวกล่องแล้ว. */
function CaseStepRow({ e, unit, onSelect }: { e: TimelineEvent; unit: string; onSelect: (e: TimelineEvent) => void }) {
  const moved = e.delta !== null || !!e.change;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(e)}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-3 px-3 py-2.5 text-left transition hover:bg-muted/30"
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <TypeChip type={e.type} />
            <span className="truncate text-sm font-medium">{e.note}</span>
          </span>
          {e.subtitle && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{e.subtitle}</span>}
          <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
            <Avatar name={e.user} />
            {e.user}
            <span className="tabular-nums">· {fmtDate(e.date, TH_DATE)} {timeOf(e.date)} น.</span>
          </span>
        </span>
        {moved && (
          <span className="shrink-0 text-right">
            <Delta value={e.delta ?? e.qty} unit={unit} neutral={e.delta === null} />
            <ChangeHint delta={e.delta} change={e.change} />
          </span>
        )}
      </button>
    </li>
  );
}

/**
 * ความเคลื่อนไหวที่ไม่มีเคส — รับเข้า, เบิกสิ้นเปลือง, ปรับสต๊อก, ย้ายที่ตั้ง, สูญหาย. ของพวกนี้ไม่มีใคร
 * รออยู่และไม่มีจุดจบ จึงไม่ใช่เคส แต่ยังเป็นสิ่งที่เกิดกับของชิ้นนี้ และยอดคงเหลือของมันอ่านได้จาก
 * แถวพวกนี้เท่านั้น — นี่คือเหตุผลที่หน้านี้ไม่ใช่รายการเคสเฉยๆ.
 */
function MovementRow({ e, unit, onSelect, last }: {
  e: TimelineEvent;
  unit: string;
  onSelect: (e: TimelineEvent) => void;
  last?: boolean;
}) {
  return (
    <Rail
      last={last}
      dot={<span aria-hidden className={cn("mt-3 size-3 shrink-0 rounded-full", TYPE_META[e.type].rail)} />}
    >
      <button
        type="button"
        onClick={() => onSelect(e)}
        className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-muted/40"
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <TypeChip type={e.type} />
            <span className="truncate text-sm font-medium">{e.note}</span>
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </span>
          {e.subtitle && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{e.subtitle}</span>}
          <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
            <Avatar name={e.user} />
            {e.user}
            <span className="tabular-nums">· {fmtDate(e.date, TH_DATE)} {timeOf(e.date)} น.</span>
          </span>
        </span>
        <span className="shrink-0 text-right">
          <Delta value={e.delta ?? e.qty} unit={unit} neutral={e.delta === null} />
          <ChangeHint delta={e.delta} change={e.change} />
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

function EventDetailDialog({ event, unit, canEdit, attachOverride, onAttachChange, onClose }: {
  event: TimelineEvent | null;
  unit: string;
  canEdit: boolean;
  attachOverride: Record<string, string[]>;
  onAttachChange: (key: string, urls: string[]) => void;
  onClose: () => void;
}) {
  // groups[0] is the record this timeline row IS; anything after it was folded in from a second
  // record telling the same event (a qty รับคืนจากซ่อม carries the closing MaintenanceRecord).
  // Only the first is editable — two identical "แนบเพิ่ม" buttons on one row is a choice nobody
  // can make, and the folded-in record is editable on its own บำรุงรักษา tab anyway. A folded-in
  // group with no files has nothing to say here, so it does not render at all.
  const all = (event?.attachments ?? []).map((g) => ({ ...g, urls: attachOverride[attachKey(g)] ?? g.urls }));
  const groups = all.filter((g, i) => i === 0 || g.urls.length > 0);

  return (
    <Dialog open={!!event} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={cn(DIALOG_SHELL_FIT, "sm:max-w-md")}>
        <DialogHeader>
          <DialogTitle>รายละเอียดกิจกรรม</DialogTitle>
          <DialogDescription className="sr-only">รายละเอียดของกิจกรรมในประวัติ</DialogDescription>
        </DialogHeader>
        {event && (
          <div className={cn(DIALOG_BODY, "px-1")}>
            <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
              <TypeChip type={event.type} />
              <Delta value={event.delta ?? event.qty} unit={unit} size="lg" neutral={event.delta === null} />
            </div>
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
              {/* The row shows up whenever the event owns an evidence column — an empty one is
                  where แนบเพิ่ม lives. With nothing attached and no right to attach, it stays hidden. */}
              {groups.length > 0 && (groups.some((g) => g.urls.length > 0) || canEdit) && (
                <DetailRow
                  label="หลักฐานแนบ"
                  value={
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
                            <AttachmentList
                              urls={g.urls}
                              target={{ recordType: g.recordType, recordId: g.recordId }}
                            />
                          </div>
                        ),
                      )}
                    </div>
                  }
                />
              )}
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
          </div>
        )}
      </DialogContent>
    </Dialog>
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

function TypeChip({ type }: { type: TimelineEventType }) {
  const meta = TYPE_META[type] ?? TYPE_META.ADJUSTMENT;
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap", meta.chip)}>
      <Icon className="size-3.5" />
      {EVENT_TYPE_LABELS[type] ?? type}
    </span>
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
