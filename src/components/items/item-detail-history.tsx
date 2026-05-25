"use client";

import { useState, useEffect, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ShoppingCart, ArrowDownToLine, Package, RefreshCw, Wrench,
  ChevronLeft, ChevronRight,
} from "lucide-react";

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
      <div className="flex gap-2">
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v === "__all__" ? "" : (v ?? "")); setPage(1); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Events" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Events</SelectItem>
            <SelectItem value="DISPENSE">Dispense</SelectItem>
            <SelectItem value="RECEIVE">Receive</SelectItem>
            <SelectItem value="ADJUSTMENT">Adjustment</SelectItem>
            <SelectItem value="STATUS_CHANGE">Status Change</SelectItem>
            <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {events.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No history events</p>
      ) : (
        <div className="space-y-2">
          {events.map((event) => {
            const Icon = TYPE_ICONS[event.type] || Package;
            return (
              <div key={event.id} className="flex items-start gap-3 p-3 rounded-lg border">
                <div className="mt-0.5 p-2 rounded-full bg-muted">
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
