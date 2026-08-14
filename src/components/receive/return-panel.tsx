"use client";

import { useState, useCallback, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ChevronRight, RotateCcw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { getOpenBorrows, type OpenBorrow } from "@/lib/api";
import { ReturnLoanDetail, type LoanGroup } from "@/components/receive/return-loan-detail";
import { fmtDate as fmt, TH_DATE } from "@/lib/format";
import { recipientLabel, USAGE_TYPE_LABELS, USAGE_TYPE_OPTIONS } from "@/lib/constants";

const fmtDate = (iso: string | null) => (iso ? fmt(iso, TH_DATE) : null);
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

// Row background by due status: white / amber / red per dueAlert. Fully-returned loans
// never reach here — they're filtered out of the list entirely.
function rowTint(dueAt: string | null): string {
  const a = dueAlert(dueAt);
  if (a?.text === "เกินกำหนด") return "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900";
  if (a?.text === "ใกล้ครบกำหนด") return "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900";
  return "bg-card border-border";
}

// A loan row is a flex line. Number columns are fixed-width + right-aligned so header and
// rows line up and dates show in full; the two text columns share the slack, so a wide
// screen spends it on more of the loan instead of on a gap in the middle.
//
// Columns come and go with width rather than clustering at one end:
//   base (≥320) ผู้ยืม · ค้าง · กำหนดคืน · รายการ
//   ≥400        + กี่วัน
//   ≥sm         + ยืมเมื่อ
//   ≥md         + พัสดุ (the names, not just the count)
//   ≥lg         + การใช้งาน
//   ≥xl         + ผู้ให้ยืม
const ROW_LINE = "flex items-center gap-2 sm:gap-3 lg:gap-4";
const COL = {
  // Both flex-1 from a 0 basis: they split the leftover evenly instead of one of them
  // swallowing it. min-w-0 is what lets truncate work inside a flex child.
  who: "flex-1 min-w-0 truncate",
  items: "hidden md:block flex-1 min-w-0 truncate",
  usage: "hidden lg:block w-16 shrink-0 truncate",
  staff: "hidden xl:block w-24 shrink-0 truncate",
  owe: "w-11 sm:w-14 shrink-0",
  // Thai dates ("31 ก.ค. 2569") are wider than the old 7/31/2026 — these two columns are
  // sized to hold one on a single line, otherwise the date wraps and the row grows.
  borrowed: "hidden sm:block w-24 shrink-0 text-right whitespace-nowrap",
  days: "hidden min-[400px]:block w-12 sm:w-14 shrink-0 text-right",
  due: "w-20 sm:w-24 shrink-0 text-right truncate",
  count: "w-7 sm:w-9 shrink-0 text-right",
} as const;

const CHIP_STYLES: Record<"all" | "overdue" | "near", { active: string; idle: string }> = {
  all: { active: "bg-foreground text-background border-foreground", idle: "bg-card text-muted-foreground border-border hover:text-foreground" },
  overdue: { active: "bg-red-700 text-white border-red-700", idle: "bg-red-50 text-red-700 border-red-200 hover:bg-red-100" },
  near: { active: "bg-amber-600 text-white border-amber-600", idle: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" },
};

export function ReturnPanel({ initialChip, readOnly }: { initialChip?: "overdue" | "near"; readOnly?: boolean }) {
  const [records, setRecords] = useState<OpenBorrow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<"all" | "overdue" | "near">(initialChip ?? "all");
  // ผู้ยืม reads as the รายวิชา / กิจกรรม it went out for (lib/constants recipientLabel), so
  // "ตามคืนของวิชาที่จบเทอมแล้ว" is a filter on the same field the rows are named by.
  const [usage, setUsage] = useState<string>("all");

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
  // A loan leaves this screen the moment nothing is owed on it — "คืนแล้ว" rows lingering
  // in the list is what staff found confusing. Closed loans live in รายงาน/ประวัติ instead.
  const groups = [...groupMap.values()].filter(
    (g) => g.records.reduce((s, r) => s + outstandingOf(r), 0) > 0,
  );

  const selected = groups.find((g) => g.key === selectedKey) ?? null;

  // Filter chips (due status) AND usage type AND text search (recipient / item / subCode / serial).
  const chipFiltered = groups.filter((g) => {
    const head = g.records[0];
    if (usage !== "all" && head.usageType !== usage) return false;
    if (chip === "all") return true;
    const a = dueAlert(head.dueAt);
    return chip === "overdue" ? a?.text === "เกินกำหนด" : a?.text === "ใกล้ครบกำหนด";
  });
  const q = query.trim().toLowerCase();
  const filteredGroups = q
    ? chipFiltered.filter((g) => {
        const head = g.records[0];
        const recipientMatch = (recipientLabel(head) ?? "").toLowerCase().includes(q);
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
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-lg" />
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
        readOnly={readOnly}
      />
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
          <RotateCcw className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">ไม่มีรายการที่อยู่ระหว่างยืม</p>
      </div>
    );
  }

  return (
    <Card className="flex flex-col max-h-full min-h-0 overflow-hidden">
      <CardContent className="flex flex-col flex-1 min-h-0 gap-2">
        {/* Two lines on every width, phone included: the count truncates before it pushes the
            chips off, and the usage select rides beside the search instead of claiming a third
            row. A phone screen holds ~4 more loans for it. */}
        <div className="shrink-0 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[11px] text-muted-foreground">{shownOutstanding} ชิ้นค้างคืน · {filteredGroups.length} รายการยืม</p>
            {!readOnly && (
              <div className="flex shrink-0 items-center gap-1">
                {([["all", "ทั้งหมด"], ["overdue", "เกินกำหนด"], ["near", "ใกล้ครบ"]] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setChip(value)}
                    className={cn(
                      "rounded-full border px-2 py-1 text-[11px] whitespace-nowrap shrink-0 transition-colors",
                      chip === value ? CHIP_STYLES[value].active : CHIP_STYLES[value].idle,
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="ค้นหา ผู้ยืม / พัสดุ…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-8 pl-8 text-sm"
              />
            </div>
            <Select value={usage} onValueChange={(v) => setUsage(String(v ?? "all"))}>
              {/* ponytail: explicit children on SelectValue — Base UI falls back to the raw
                  value when the popup items are unmounted. Same as reports' FilterSelect. */}
              {/* No width cap — the trigger is w-fit by default and "ทุกการใช้งาน" was being
                  clipped by one. It is the widest label there is, so it sets the size. */}
              <SelectTrigger className="shrink-0 text-xs">
                <SelectValue>{USAGE_TYPE_LABELS[usage] ?? "ทุกการใช้งาน"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกการใช้งาน</SelectItem>
                {USAGE_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Separator />
        </div>
        {filteredGroups.length > 0 && (
          <div className={cn(ROW_LINE, "shrink-0 px-2.5 text-[10px] text-muted-foreground sm:text-[11px]")}>
            <span className={COL.who}>ผู้ยืม</span>
            <span className={COL.items}>พัสดุ</span>
            <span className={COL.usage}>การใช้งาน</span>
            <span className={COL.staff}>ผู้ให้ยืม</span>
            <span className={COL.owe}>ค้าง</span>
            <span className={COL.borrowed}>ยืมเมื่อ</span>
            <span className={COL.days}>กี่วัน</span>
            <span className={COL.due}>กำหนดคืน</span>
            <span className={COL.count}>รายการ</span>
            <span className="w-4 shrink-0" aria-hidden />
          </div>
        )}
        <div className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-1 pr-1 sm:gap-1.5">
          {filteredGroups.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">ไม่พบ &ldquo;{query}&rdquo;</div>
          ) : filteredGroups.map((g) => {
          const head = g.records[0];
          const total = g.records.reduce((s, r) => s + r.quantity, 0);
          const outstanding = g.records.reduce((s, r) => s + outstandingOf(r), 0);
          const itemCount = new Set(g.records.map((r) => r.item.id)).size;
          const borrowed = fmtDate(head.dispensedAt);
          const days = head.dispensedAt ? daysSince(head.dispensedAt) : null;
          // Distinct names, in the order they were borrowed — one ใบ of 10 pieces of the same
          // model must read as that model once, not ten times.
          const itemNames = [...new Set(g.records.map((r) => r.item.name))].join(" · ");
          return (
            <button
              key={g.key}
              type="button"
              onClick={() => setSelectedKey(g.key)}
              className={cn(
                ROW_LINE,
                "w-full text-left border rounded-lg px-2.5 py-1.5 text-xs transition-colors hover:border-primary/50 sm:py-2 sm:text-sm",
                rowTint(head.dueAt),
              )}
            >
              <span className={cn(COL.who, "font-semibold text-foreground")}>{recipientLabel(head) ?? "ไม่ระบุผู้ยืม"}</span>
              <span className={cn(COL.items, "text-muted-foreground")}>{itemNames}</span>
              <span className={cn(COL.usage, "text-muted-foreground")}>
                {head.usageType ? USAGE_TYPE_LABELS[head.usageType] ?? head.usageType : "—"}
              </span>
              <span className={cn(COL.staff, "text-muted-foreground")}>{head.staff.name}</span>
              <span className={COL.owe}>
                <Badge className="text-[10px] bg-red-700 text-white font-semibold hover:bg-red-700">{outstanding}/{total}</Badge>
              </span>
              <span className={cn(COL.borrowed, "tabular-nums text-muted-foreground")}>{borrowed ?? "—"}</span>
              <span className={cn(COL.days, "tabular-nums text-muted-foreground")}>{days !== null ? `${days} วัน` : "—"}</span>
              <span className={cn(COL.due, "tabular-nums text-muted-foreground")}>{fmtDate(head.dueAt) ?? "—"}</span>
              <span className={cn(COL.count, "tabular-nums text-muted-foreground")}>{itemCount}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          );
        })}
        </div>
      </CardContent>
    </Card>
  );
}
