"use client";

import { useState, useCallback } from "react";
import type { ReactNode } from "react";
import { fmtDate, TH_DATE } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShoppingCart, ArrowDownToLine, ArrowUpFromLine, Undo2, Package,
  RefreshCw, Wrench, MapPin, MonitorCog, Flag, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getItemHistory } from "@/lib/api";
import { Pagination } from "@/components/shared/pagination";
import { PAGE_SIZE } from "@/lib/pagination-constants";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { usePagedList } from "@/hooks/use-paged-list";
import { EVENT_TYPE_LABELS, type TimelineEventType } from "@/lib/constants";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
        items: (data.events || []) as TimelineEvent[],
        total: (data.total as number) || 0,
      };
    },
    [itemId, subItemId, perPage, typeFilter],
  );

  const {
    items: events, total, page, totalPages, loading, isLoadingMore, hasNext, loadMore, setPage,
  } = usePagedList<TimelineEvent>({ fetchPage, pageSize: perPage, isMobile });

  // แนบเพิ่ม/ลบ answers with the record's array as it now stands. Keeping those answers here —
  // keyed by the record, not by the timeline row — means they survive closing the dialog, paging,
  // and filtering, without a refetch of seven tables to repaint one thumbnail.
  const [attachOverride, setAttachOverride] = useState<Record<string, string[]>>({});

  // Every chip counts events, never units. The word "รายการ" is dropped from each pill — the
  // caption above already frames these as counts, so a bare number reads compact and premium
  // instead of stacking "รายการ" seven times across a row that overflows the card.
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
        <p className="mb-2.5 text-[11px] text-muted-foreground">รวมทั้งประวัติ</p>
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
      ) : isMobile ? (
        <ul className="space-y-2 p-3">
          {events.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => setSelected(e)}
                className="w-full rounded-xl border border-border bg-muted/20 p-3 text-left transition hover:border-primary/40 hover:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <TypeChip type={e.type} />
                  <div className="flex flex-col items-end">
                    <Delta value={e.delta ?? e.qty} unit={unit} size="lg" neutral={e.delta === null} />
                    <ChangeHint delta={e.delta} change={e.change} />
                  </div>
                </div>
                <p className="mt-2 flex items-center gap-1 text-sm font-medium">
                  {e.note}
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                </p>
                {e.subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{e.subtitle}</p>}
                <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Avatar name={e.user} /> {e.user}
                  </span>
                  <span className="tabular-nums">{fmtDate(e.date, TH_DATE)} · {timeOf(e.date)} น.</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Table grid zebra className="table-fixed">
          <TableHeader>
            {/* The shared table is a 32px-header datagrid; a history row carries two lines, so
                the header is given the taller band that matches them. Local override — the
                report tables keep the tighter default. */}
            <TableRow className="hover:bg-transparent [&>th]:h-13">
              <TableHead className="w-[18%] pl-5 sm:pl-8">ประเภท</TableHead>
              <TableHead className="w-[12%] text-right">จำนวน</TableHead>
              <TableHead className="w-[40%]">รายการ</TableHead>
              <TableHead className="w-[17%]">ผู้ดำเนินการ</TableHead>
              <TableHead className="w-[13%] pr-5 text-right sm:pr-8">วันที่ / เวลา</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((e) => (
              <TableRow
                key={e.id}
                className="group cursor-pointer"
                onClick={() => setSelected(e)}
              >
                <TableCell className="relative pl-5 align-top sm:pl-8">
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-y-2 left-0 w-[3px] rounded-r-full opacity-0 transition-opacity group-hover:opacity-100",
                      TYPE_META[e.type].rail,
                    )}
                  />
                  <TypeChip type={e.type} />
                </TableCell>
                <TableCell className="text-right align-top">
                  <Delta value={e.delta ?? e.qty} unit={unit} neutral={e.delta === null} />
                  <ChangeHint delta={e.delta} change={e.change} />
                </TableCell>
                <TableCell className="align-top">
                  <p className="flex items-center gap-1 text-sm font-medium leading-snug text-foreground">
                    <span className="truncate">{e.note}</span>
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </p>
                  {e.subtitle && <p className="mt-0.5 truncate text-xs leading-snug text-muted-foreground">{e.subtitle}</p>}
                </TableCell>
                <TableCell className="align-top">
                  <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <Avatar name={e.user} />
                    <span className="truncate">{e.user}</span>
                  </span>
                </TableCell>
                <TableCell className="pr-5 text-right align-top sm:pr-8">
                  <p className="text-xs font-medium tabular-nums">{fmtDate(e.date, TH_DATE)}</p>
                  <p className="text-[11px] tabular-nums text-muted-foreground">{timeOf(e.date)} น.</p>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* ── Footer / pagination ── */}
      {!loading && events.length > 0 && (
        <div className="space-y-2 border-t border-border bg-muted/30 px-5 py-4 sm:px-8">
          <p className="text-xs text-muted-foreground">
            แสดง <span className="font-semibold tabular-nums text-foreground">{events.length}</span> จาก{" "}
            <span className="tabular-nums">{total}</span> รายการ
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

// The table answers "ใครทำอะไร กี่ชิ้น เมื่อไหร่"; everything quieter — the balance change, the
// supporting context, the free-text note — lives here so it never crowds the row.
const attachKey = (g: { recordType: AttachRecordType; recordId: string }) => `${g.recordType}:${g.recordId}`;

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
                          <AttachmentList key={attachKey(g)} urls={g.urls} />
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
