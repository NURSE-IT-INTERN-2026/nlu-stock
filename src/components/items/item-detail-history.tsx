"use client";

import { useState, useEffect, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  ShoppingCart, ArrowDownToLine, Package, RefreshCw, Wrench,
  ChevronLeft, ChevronRight, MapPin, CalendarDays, User2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getItemHistory } from "@/lib/api";

interface TimelineEvent {
  id: string;
  type: "DISPENSE" | "RECEIVE" | "ADJUSTMENT" | "STATUS_CHANGE" | "MAINTENANCE" | "LOCATION_CHANGE";
  date: string;
  description: string;
  user: string;
  details: Record<string, unknown>;
}

const TYPE_ICONS: Record<string, typeof ShoppingCart> = {
  DISPENSE: ShoppingCart,
  RECEIVE: ArrowDownToLine,
  ADJUSTMENT: Package,
  STATUS_CHANGE: RefreshCw,
  MAINTENANCE: Wrench,
  LOCATION_CHANGE: MapPin,
};

const TYPE_BADGE: Record<string, string> = {
  DISPENSE: "bg-primary/10 text-primary border-primary/20",
  RECEIVE: "bg-success/10 text-success-700 border-success/20",
  ADJUSTMENT: "bg-muted text-foreground border-border",
  STATUS_CHANGE: "bg-warning/10 text-warning-700 border-warning/20",
  MAINTENANCE: "bg-primary/5 text-primary border-primary/15",
  LOCATION_CHANGE: "bg-muted text-foreground border-border",
};

const EVENT_CHIPS = [
  { value: "", label: "ทั้งหมด", activeClass: "bg-primary text-primary-foreground border-primary" },
  { value: "DISPENSE", label: "เบิก", activeClass: "bg-blue-600 text-white border-blue-600" },
  { value: "RECEIVE", label: "รับเข้า", activeClass: "bg-emerald-600 text-white border-emerald-600" },
  { value: "ADJUSTMENT", label: "ปรับสต๊อก", activeClass: "bg-slate-600 text-white border-slate-600" },
  { value: "STATUS_CHANGE", label: "เปลี่ยนสถานะ", activeClass: "bg-amber-600 text-white border-amber-600" },
  { value: "MAINTENANCE", label: "บำรุงรักษา", activeClass: "bg-purple-600 text-white border-purple-600" },
  { value: "LOCATION_CHANGE", label: "ที่ตั้ง", activeClass: "bg-sky-600 text-white border-sky-600" },
];

interface Props {
  itemId: string;
}

export function ItemDetailHistory({ itemId }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [typeFilter, setTypeFilter] = useState("");

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), perPage: String(perPage) });
    if (typeFilter) qs.set("type", typeFilter);
    const data = await getItemHistory(itemId, qs.toString());
    setEvents((data.events || []) as TimelineEvent[]);
    setTotal((data as Record<string, unknown>).total as number || 0);
    setLoading(false);
  }, [itemId, page, perPage, typeFilter]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const totalPages = Math.ceil(total / perPage);

  if (loading) {
    return (
      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <SectionHeader eyebrow="กิจกรรม" title="ประวัติ" />
        <div className="p-4 sm:p-5 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <SectionHeader eyebrow="กิจกรรม" title="ประวัติ" />

      {/* ── Quick filter chips ── */}
      <div className="px-4 sm:px-5 pt-4 flex items-center gap-2 overflow-x-auto">
        <span className="text-sm text-muted-foreground shrink-0">Type:</span>
        {EVENT_CHIPS.map((chip) => {
          const active = typeFilter === chip.value;
          return (
            <button
              key={chip.value}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs whitespace-nowrap border transition-colors",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/50 text-muted-foreground border-border hover:text-foreground hover:bg-muted",
              )}
              onClick={() => { setTypeFilter(chip.value); setPage(1); }}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* ── Timeline ── */}
      {events.length === 0 ? (
        <p className="text-center py-10 text-sm text-muted-foreground">ไม่มีรายการในหมวดนี้</p>
      ) : (
        <ol className="p-4 sm:p-5 space-y-3">
          {events.map((event) => {
            const Icon = TYPE_ICONS[event.type] || Package;
            return (
              <li
                key={event.id}
                className="grid grid-cols-[auto_1fr] gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-colors"
              >
                <div className="size-10 shrink-0 rounded-lg bg-primary/5 border border-primary/10 grid place-items-center text-primary">
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase border",
                      TYPE_BADGE[event.type] ?? "bg-muted text-foreground border-border",
                    )}>
                      {event.type.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <CalendarDays className="size-3" />
                      {new Date(event.date).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-sm font-medium">{event.description}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1">
                    <User2 className="size-3" />
                    by {event.user}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 sm:px-5 py-3">
          <p className="text-sm text-muted-foreground">{total} events, page {page} of {totalPages}</p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function SectionHeader({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="px-4 sm:px-5 py-4 border-b border-border grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{eyebrow}</div>}
        <h2 className="text-lg font-semibold leading-tight mt-0.5 truncate">{title}</h2>
      </div>
      {right}
    </div>
  );
}
