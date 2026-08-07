"use client";

import { useState, useCallback, useEffect } from "react";
import { fmtDate, TH_DATE } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, MapPin, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { getReport } from "@/lib/api";
import type { CategoryOption, LocationOption, ProfileOption } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/shared/pagination";
import { PAGE_SIZE } from "@/lib/pagination-constants";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { ItemsFilterBar, type FilterState } from "@/components/items/items-filter-bar";

interface ScheduleRow {
  id: string;
  itemId: string;
  code: string;
  name: string;
  location: string;
  nextMaintenanceDate: string;
  maintenanceStatus: string;
  categoryId: string;
  profileId: string;
  building: string;
  floor: string;
  room: string;
  detail: string;
  status: string;
}

interface Props {
  profiles: ProfileOption[];
  categories: CategoryOption[];
  locations: LocationOption[];
  filter: FilterState;
  onFilterChange: (next: FilterState) => void;
}

const DAY_MS = 86_400_000;
const daysOverdue = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS));

// Read-only worklist for the "เกินกำหนดซ่อมบำรุง" alert tab. Pulls the same maintenance-schedule
// report the /maintenance page uses (it derives status from SubItem dates for tracked copies +
// Item dates for flat items), then keeps only overdue rows. Mirrors the other alert tabs: the
// shared ItemsFilterBar above, the table in its own bordered container below. A row click jumps
// to /maintenance so the user can record the service — no editing happens here.
//
// ponytail: the filter bar's state is the page's FilterState, applied client-side over the rows
// already in memory — no second endpoint, and switching tabs keeps the same filters.
export function OverdueMaintenancePanel({ profiles, categories, locations, filter, onFilterChange }: Props) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // ponytail: perPage 200 — overdue rows sort to the top (oldest next-date first), so a
      // tenant needs >200 overdue items for any to slip past. Move to a server-side status
      // filter if that ceiling is ever hit.
      const data = (await getReport("maintenance-schedule", { perPage: "200" })) as { items: ScheduleRow[] };
      setRows((data.items ?? []).filter((r) => r.maintenanceStatus === "overdue"));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const goMaintenance = () => router.push("/maintenance");

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
          <Wrench className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">ไม่มีพัสดุที่เกินกำหนดซ่อมบำรุง</p>
      </div>
    );
  }

  const q = filter.query.trim().toLowerCase();
  const loc = filter.location;
  const filtered = rows.filter((r) =>
    (!q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q) || r.location.toLowerCase().includes(q)) &&
    (!filter.profileId || r.profileId === filter.profileId) &&
    (!filter.categoryId || r.categoryId === filter.categoryId) &&
    (!filter.status.length || filter.status.includes(r.status as (typeof filter.status)[number])) &&
    (!loc.building || r.building === loc.building) &&
    (!loc.floor || r.floor === loc.floor) &&
    (!loc.room || r.room === loc.room) &&
    (!loc.detail || r.detail === loc.detail)
  );

  // Client-side slice: the whole overdue set is already in memory (perPage 200 above), so
  // paging is a slice, not a fetch. Desktop = numbered page, mobile = append (load more).
  const perPage = PAGE_SIZE.DEFAULT;
  const paged = isMobile
    ? filtered.slice(0, page * perPage)
    : filtered.slice((page - 1) * perPage, page * perPage);

  return (
    <div className="space-y-3 sm:space-y-6">
      <ItemsFilterBar
        profiles={profiles}
        categories={categories}
        locations={locations}
        alerts={{ lowStock: 0, nearExpiry: 0, overdueMaintenance: 0 }}
        value={filter}
        onChange={(next) => { onFilterChange(next); setPage(1); }}
        resultCount={filtered.length}
        onScanQR={() => {}}
        hideAlertPicker
        hideScan
      />

      {/* Table — same bordered container + scroll cap the other alert tabs use */}
      <div className="rounded-2xl border overflow-hidden bg-card">
        {/* Desktop: table */}
        <div className="hidden md:block overflow-auto max-h-[58dvh] lg:max-h-[calc(100vh-340px)]">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="sticky top-0 z-10 bg-card border-b border-border shadow-[0_1px_3px_rgba(0,0,0,0.08)] [&>th]:h-8 [&>th]:py-0 [&>th]:text-xs [&>th]:text-muted-foreground">
                <TableHead className="w-28 px-2">รหัสพัสดุ</TableHead>
                <TableHead className="px-2">ชื่อ</TableHead>
                <TableHead className="w-48 px-2">การแจ้งเตือน</TableHead>
                <TableHead className="w-56 px-2">รายละเอียด</TableHead>
                <TableHead className="w-44 px-2 hidden xl:table-cell">สถานที่</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    ไม่มีรายการแจ้งเตือน
                  </TableCell>
                </TableRow>
              ) : paged.map((r, idx) => (
                <TableRow
                  key={r.id}
                  className={cn("h-9 cursor-pointer hover:bg-muted/50 transition-colors [&>td]:py-1", idx % 2 === 1 && "bg-muted/40")}
                  onClick={goMaintenance}
                >
                  <TableCell className="font-mono text-xs px-2"><span className="block truncate">{r.code}</span></TableCell>
                  <TableCell className="px-2"><span className="block truncate font-medium">{r.name}</span></TableCell>
                  <TableCell className="px-2">
                    <span className="inline-flex items-center rounded-full border border-destructive/30 bg-destructive/15 px-1.5 py-0 text-[11px] font-medium leading-5 whitespace-nowrap text-destructive">
                      เกินกำหนดซ่อมบำรุง
                    </span>
                  </TableCell>
                  <TableCell className="text-xs px-2 text-muted-foreground tabular-nums">
                    เกิน {daysOverdue(r.nextMaintenanceDate)} วัน · ครบ {fmtDate(r.nextMaintenanceDate, TH_DATE)}
                  </TableCell>
                  <TableCell className="text-sm px-2 hidden xl:table-cell"><span className="block truncate">{r.location || "-"}</span></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobile: cards */}
        <div className="md:hidden p-1 space-y-2">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">ไม่มีรายการแจ้งเตือน</p>
          ) : paged.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={goMaintenance}
              className="group flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card p-3 text-left shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
            >
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive ring-1 ring-destructive/20">
                <Wrench className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center rounded-full border border-destructive/30 bg-destructive/15 px-1.5 py-0 text-[11px] font-medium leading-5 text-destructive">
                    เกินกำหนดซ่อมบำรุง
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">{r.code}</span>
                </div>
                <p className="mt-1 truncate text-sm font-semibold leading-snug">{r.name}</p>
                <div className="mt-0.5 flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    เกิน {daysOverdue(r.nextMaintenanceDate)} วัน · ครบ {fmtDate(r.nextMaintenanceDate, TH_DATE)}
                  </span>
                  {r.location && (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <MapPin className="size-3 shrink-0" />
                      <span className="truncate">{r.location}</span>
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="size-4 shrink-0 self-center text-muted-foreground/40 transition group-hover:translate-x-0.5 group-hover:text-primary" />
            </button>
          ))}
        </div>

        {/* Pagination — desktop numbered, mobile load-more (same as the other alert tabs) */}
        {isMobile ? (
          paged.length > 0 && (
            <Pagination
              mode="loadMore"
              shown={paged.length}
              total={filtered.length}
              hasMore={paged.length < filtered.length}
              isLoading={false}
              onLoadMore={() => setPage((p) => p + 1)}
            />
          )
        ) : (
          <Pagination page={page} total={filtered.length} pageSize={perPage} onChange={setPage} />
        )}
      </div>
    </div>
  );
}
