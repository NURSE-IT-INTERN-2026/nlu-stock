"use client";

import { useState, useEffect, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShoppingCart, ArrowDownToLine, Package, RefreshCw, Wrench,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TimelineEvent {
  id: string;
  type: "DISPENSE" | "RECEIVE" | "ADJUSTMENT" | "STATUS_CHANGE" | "MAINTENANCE";
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
};

const TYPE_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DISPENSE: "secondary",
  RECEIVE: "default",
  ADJUSTMENT: "outline",
  STATUS_CHANGE: "secondary",
  MAINTENANCE: "outline",
};

const EVENT_CHIPS = [
  { value: "", label: "All", activeClass: "bg-primary text-primary-foreground border-primary" },
  { value: "DISPENSE", label: "Dispense", activeClass: "bg-blue-600 text-white border-blue-600" },
  { value: "RECEIVE", label: "Receive", activeClass: "bg-emerald-600 text-white border-emerald-600" },
  { value: "ADJUSTMENT", label: "Adjustment", activeClass: "bg-slate-600 text-white border-slate-600" },
  { value: "STATUS_CHANGE", label: "Status", activeClass: "bg-amber-600 text-white border-amber-600" },
  { value: "MAINTENANCE", label: "Maintenance", activeClass: "bg-purple-600 text-white border-purple-600" },
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
    const params = new URLSearchParams({ page: String(page), perPage: String(perPage) });
    if (typeFilter) params.set("type", typeFilter);
    const res = await fetch(`/api/items/${itemId}/history?${params}`);
    const data = await res.json();
    setEvents(data.events || []);
    setTotal(data.total || 0);
    setLoading(false);
  }, [itemId, page, perPage, typeFilter]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const totalPages = Math.ceil(total / perPage);

  if (loading) {
    return <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }

  return (
    <div className="space-y-4">
      {/* ── Quick Filter Chips ── */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground mr-1">Type:</span>
        {EVENT_CHIPS.map((chip) => (
          <button
            key={chip.value}
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
              typeFilter === chip.value
                ? chip.activeClass
                : "bg-muted/50 text-foreground/70 border-border hover:bg-muted",
            )}
            onClick={() => { setTypeFilter(chip.value); setPage(1); }}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* ── Timeline ── */}
      {events.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No history events</p>
      ) : (
        <div className="space-y-2">
          {events.map((event, idx) => {
            const Icon = TYPE_ICONS[event.type] || Package;
            return (
              <div
                key={event.id}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border",
                  idx % 2 === 1 && "bg-muted/20",
                )}
              >
                <div className="mt-0.5 p-2 rounded-full bg-muted shrink-0">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant={TYPE_VARIANTS[event.type]} className="text-xs">
                      {event.type.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(event.date).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-sm mt-1">{event.description}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">by {event.user}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
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
    </div>
  );
}
