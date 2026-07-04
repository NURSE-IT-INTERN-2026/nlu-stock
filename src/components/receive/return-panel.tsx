"use client";

import { useState, useCallback, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Calendar, Package, ChevronRight, RotateCcw, MapPin, Search } from "lucide-react";
import { pic } from "@/lib/image";
import { cn } from "@/lib/utils";
import { getOpenBorrows, type OpenBorrow } from "@/lib/api";
import { locationLabel } from "@/lib/constants";
import { ReturnLoanDetail, type LoanGroup } from "@/components/receive/return-loan-detail";

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : null);
const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

function outstandingOf(r: OpenBorrow) {
  return r.returnedAt ? 0 : r.quantity - r.resolvedQty;
}

function dueAlert(dueAt: string | null): { text: string; cls: string } | null {
  if (!dueAt) return null;
  const days = (new Date(dueAt).getTime() - Date.now()) / 86400000;
  if (days < 0) return { text: "เกินกำหนด", cls: "bg-red-700 text-white hover:bg-red-700" };
  if (days <= 3) return { text: "ใกล้ครบกำหนด", cls: "bg-amber-600 text-white hover:bg-amber-600" };
  return null;
}

const CHIP_STYLES: Record<"all" | "overdue" | "near", { active: string; idle: string }> = {
  all: { active: "bg-foreground text-background border-foreground", idle: "bg-card text-muted-foreground border-border hover:text-foreground" },
  overdue: { active: "bg-red-700 text-white border-red-700", idle: "bg-red-50 text-red-700 border-red-200 hover:bg-red-100" },
  near: { active: "bg-amber-600 text-white border-amber-600", idle: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" },
};

export function ReturnPanel({ initialChip }: { initialChip?: "overdue" | "near" }) {
  const [records, setRecords] = useState<OpenBorrow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<"all" | "overdue" | "near">(initialChip ?? "all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getOpenBorrows();
      setRecords(data.records);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Group records into one loan event per loanGroupId (legacy null → each its own).
  const groupMap = new Map<string, LoanGroup>();
  for (const r of records) {
    const key = r.loanGroupId ?? r.id;
    const g = groupMap.get(key);
    if (g) g.records.push(r);
    else groupMap.set(key, { key, records: [r] });
  }
  const groups = [...groupMap.values()];

  const totalOutstanding = records.reduce((s, r) => s + outstandingOf(r), 0);
  const selected = groups.find((g) => g.key === selectedKey) ?? null;

  // Filter chips (due status) AND text search (recipient / item / subCode / serial).
  const chipFiltered = groups.filter((g) => {
    if (chip === "all") return true;
    const a = dueAlert(g.records[0].dueAt);
    return chip === "overdue" ? a?.text === "เกินกำหนด" : a?.text === "ใกล้ครบกำหนด";
  });
  const q = query.trim().toLowerCase();
  const filteredGroups = q
    ? chipFiltered.filter((g) => {
        const head = g.records[0];
        const recipientMatch = (head.recipient ?? "").toLowerCase().includes(q);
        const itemMatch = g.records.some(
          (r) => r.item.name.toLowerCase().includes(q) || r.item.code.toLowerCase().includes(q),
        );
        const subMatch = g.records.some(
          (r) =>
            (r.subItem?.subCode ?? "").toLowerCase().includes(q) ||
            (r.subItem?.serialNumber ?? "").toLowerCase().includes(q),
        );
        return recipientMatch || itemMatch || subMatch;
      })
    : chipFiltered;
  const shownOutstanding = filteredGroups.reduce((s, g) => s + g.records.reduce((a, r) => a + outstandingOf(r), 0), 0);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (selected) {
    return (
      <ReturnLoanDetail
        group={selected}
        onBack={() => setSelectedKey(null)}
        onResolved={load}
      />
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
          <RotateCcw className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">ไม่มีพัสดุที่ยืมอยู่</p>
      </div>
    );
  }

  return (
    <Card className="flex flex-col max-h-full min-h-0 overflow-hidden">
      <CardContent className="flex flex-col flex-1 min-h-0 gap-3">
        <div className="shrink-0 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">{shownOutstanding} ชิ้นค้างคืน · {filteredGroups.length} รายการยืม</p>
            <div className="flex items-center gap-1">
              {([["all", "ทั้งหมด"], ["overdue", "เกินกำหนด"], ["near", "ใกล้ครบกำหนด"]] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setChip(value)}
                  className={cn(
                    "px-2 py-1.5 rounded-full text-[11px] whitespace-nowrap shrink-0 border transition-colors",
                    chip === value ? CHIP_STYLES[value].active : CHIP_STYLES[value].idle,
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ค้นหา ผู้ยืม / พัสดุ…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 pl-9 text-sm"
            />
          </div>
          <Separator />
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 grid grid-cols-1 sm:grid-cols-2 gap-2 items-start pr-1">
          {filteredGroups.length === 0 ? (
            <div className="col-span-full text-center py-10 text-sm text-muted-foreground">ไม่พบ &ldquo;{query}&rdquo;</div>
          ) : filteredGroups.map((g) => {
          const head = g.records[0];
          const total = g.records.reduce((s, r) => s + r.quantity, 0);
          const outstanding = g.records.reduce((s, r) => s + outstandingOf(r), 0);
          const itemCount = new Set(g.records.map((r) => r.item.id)).size;
          const borrowed = fmtDate(head.dispensedAt);
          const days = head.dispensedAt ? daysSince(head.dispensedAt) : null;
          const alert = dueAlert(head.dueAt);
          const done = outstanding === 0;
          return (
            <button key={g.key} type="button" onClick={() => setSelectedKey(g.key)} className="block w-full text-left">
              <Card className="border shadow-none transition-colors hover:border-primary/50">
                <CardContent>
                  <div className="flex flex-col gap-1.5">
                    <p className="font-semibold text-base leading-snug truncate">{head.recipient ?? "ไม่ระบุชื่อผู้ยืม"}</p>
                    <div className="flex flex-wrap items-center gap-1">
                      {alert && <Badge className={`text-xs ${alert.cls}`}>{alert.text}</Badge>}
                      {done ? (
                        <Badge variant="secondary" className="text-xs">คืนครบ</Badge>
                      ) : (
                        <Badge className="text-xs bg-red-700 text-white font-semibold hover:bg-red-700">ค้าง {outstanding}/{total}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{head.item.location ? locationLabel(head.item.location) : "—"}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      <span>ยืมเมื่อ {borrowed ?? "—"}{days !== null ? ` · ${days} วันที่แล้ว` : ""}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5 shrink-0" />
                      <span>{itemCount} รายการ</span>
                    </div>
                  </div>
                  {/* item thumbnails */}
                  <div className="flex items-center gap-1.5 mt-2.5">
                    <div className="flex -space-x-2">
                      {[...new Map(g.records.map((r) => [r.item.id, r.item])).values()].slice(0, 5).map((it) => (
                        <div key={it.id} className="size-8 overflow-hidden rounded-md border-2 border-card bg-muted">
                          <img src={it.imageUrl ?? pic(it.code, 96)} alt={it.name} loading="lazy" className="size-full object-cover" />
                        </div>
                      ))}
                    </div>
                    <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </button>
          );
        })}
        </div>
      </CardContent>
    </Card>
  );
}
