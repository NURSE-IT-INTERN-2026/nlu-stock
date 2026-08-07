"use client";

import { useState, useCallback } from "react";
import { fmtDate, TH_DATE } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShoppingCart, ArrowDownToLine, ArrowUpFromLine, Undo2, Package,
  RefreshCw, Wrench, MapPin, MonitorCog,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getItemHistory } from "@/lib/api";
import { Pagination } from "@/components/shared/pagination";
import { PAGE_SIZE } from "@/lib/pagination-constants";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { usePagedList } from "@/hooks/use-paged-list";
import { EVENT_TYPE_LABELS, type TimelineEventType } from "@/lib/constants";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  date: string;
  delta: number | null;
  note: string;
  detail: string;
  user: string;
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
  STATUS_CHANGE: { icon: RefreshCw, chip: "bg-muted text-muted-foreground", rail: "bg-muted-foreground" },
  MAINTENANCE: { icon: Wrench, chip: "bg-muted text-muted-foreground", rail: "bg-muted-foreground" },
  LOCATION_CHANGE: { icon: MapPin, chip: "bg-muted text-muted-foreground", rail: "bg-muted-foreground" },
};

const CHIP_ORDER: TimelineEventType[] = [
  "DISPENSE", "BORROW", "INUSE", "RETURN", "RECEIVE",
  "ADJUSTMENT", "STATUS_CHANGE", "MAINTENANCE", "LOCATION_CHANGE",
];

/** n = how many rows of that type; qty = how many units they moved (null = type never moves stock). */
type Counts = Partial<Record<TimelineEventType, { n: number; qty: number | null }>>;

interface Props {
  itemId: string;
  /** Scope to one tracked copy. Item-level events (รับเข้า/ปรับสต๊อก/ย้ายที่ตั้ง) drop out. */
  subItemId?: string;
}

export function ItemDetailHistory({ itemId, subItemId }: Props) {
  const isMobile = useIsMobile();
  const [typeFilter, setTypeFilter] = useState<TimelineEventType | "">("");
  const [counts, setCounts] = useState<Counts>({});
  const [unit, setUnit] = useState("");
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

  // "ทั้งหมด" counts rows, not units: adding ของเข้า and ของออก into one unit figure would
  // produce a number that means nothing. Per-type chips carry the unit total instead.
  const allRows = CHIP_ORDER.reduce((sum, t) => sum + (counts[t]?.n ?? 0), 0);
  const chips: { value: TimelineEventType | ""; label: string; amount: string }[] = [
    { value: "", label: "ทั้งหมด", amount: `${allRows} รายการ` },
    ...CHIP_ORDER.filter((t) => (counts[t]?.n ?? 0) > 0).map((t) => {
      const c = counts[t]!;
      return {
        value: t,
        label: EVENT_TYPE_LABELS[t],
        amount: c.qty === null ? `${c.n} ครั้ง` : `${c.qty} ${unit}`,
      };
    }),
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      {/* ── Header ── */}
      <header className="px-4 py-4 sm:px-6 border-b border-border">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">กิจกรรม</p>
        <h2 className="mt-0.5 text-lg font-semibold leading-tight tracking-tight">ประวัติ</h2>
      </header>

      {/* ── Filter pills ──
          Labelled "รวมทั้งประวัติ" on purpose: the stock card above these tabs shows ถูกยืม as
          the units still out *right now*, and these chips sum every movement ever recorded.
          Two different numbers under the same word on one screen needs the caption. */}
      <div className="border-b border-border bg-muted/30 px-4 py-3 sm:px-6">
        <p className="mb-2 text-[11px] text-muted-foreground">รวมทั้งประวัติ</p>
        <div className="flex gap-2 overflow-x-auto">
          {chips.map((chip) => {
            const on = typeFilter === chip.value;
            return (
              <button
                key={chip.value || "all"}
                onClick={() => setTypeFilter(chip.value)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition",
                  on
                    ? "border-transparent bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                {chip.label}
                <span className={cn("tabular-nums", on ? "text-primary-foreground/75" : "text-muted-foreground/70")}>
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
            <li key={e.id} className="rounded-xl border border-border bg-muted/20 p-3">
              <div className="flex items-start justify-between gap-2">
                <TypeChip type={e.type} />
                <Delta value={e.delta} unit={unit} size="lg" />
              </div>
              <p className="mt-2 text-sm font-medium">{e.note}</p>
              {e.detail && <p className="mt-0.5 text-xs text-muted-foreground">{e.detail}</p>}
              <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Avatar name={e.user} /> {e.user}
                </span>
                <span className="tabular-nums">{fmtDate(e.date, TH_DATE)} · {timeOf(e.date)} น.</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[160px] pl-4 text-[11px] uppercase tracking-[0.14em] text-muted-foreground sm:pl-6">Type</TableHead>
              <TableHead className="w-[110px] text-right text-[11px] uppercase tracking-[0.14em] text-muted-foreground">จำนวน</TableHead>
              <TableHead className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">หมายเหตุ</TableHead>
              <TableHead className="w-[170px] text-[11px] uppercase tracking-[0.14em] text-muted-foreground">ผู้ดำเนินการ</TableHead>
              <TableHead className="w-[130px] pr-4 text-right text-[11px] uppercase tracking-[0.14em] text-muted-foreground sm:pr-6">วันที่ / เวลา</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((e) => (
              <TableRow key={e.id} className="group">
                <TableCell className="relative py-3 pl-4 sm:pl-6">
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-y-2 left-0 w-[3px] rounded-r-full opacity-0 transition-opacity group-hover:opacity-100",
                      TYPE_META[e.type].rail,
                    )}
                  />
                  <TypeChip type={e.type} />
                </TableCell>
                <TableCell className="py-3 text-right"><Delta value={e.delta} unit={unit} /></TableCell>
                <TableCell className="max-w-sm py-3">
                  <p className="text-sm font-medium text-foreground">{e.note}</p>
                  {e.detail && <p className="mt-0.5 truncate text-xs text-muted-foreground">{e.detail}</p>}
                </TableCell>
                <TableCell className="py-3">
                  <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <Avatar name={e.user} />
                    {e.user}
                  </span>
                </TableCell>
                <TableCell className="py-3 pr-4 text-right sm:pr-6">
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
        <div className="border-t border-border bg-muted/30 px-4 py-3 sm:px-6">
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
    </section>
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
function Delta({ value, unit, size }: { value: number | null; unit: string; size?: "lg" }) {
  if (value === null) return <span className="text-sm text-muted-foreground">—</span>;
  const tone =
    value > 0 ? "text-success-700 dark:text-success-200"
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
