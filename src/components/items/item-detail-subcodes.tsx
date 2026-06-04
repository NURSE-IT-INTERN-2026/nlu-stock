"use client";

import { useState, useMemo, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronRight, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SubItemRecord {
  id: string;
  subCode: string;
  name: string | null;
  status: string;
  condition: string | null;
  notes: string | null;
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  AVAILABLE: "default",
  CHECKED_OUT: "secondary",
  DAMAGED: "destructive",
  UNDER_REPAIR: "secondary",
  LOST: "destructive",
  DISPOSED: "destructive",
  PENDING_MAINTENANCE: "secondary",
};

const STATUS_OPTIONS = ["AVAILABLE", "DAMAGED", "UNDER_REPAIR", "LOST", "DISPOSED", "PENDING_MAINTENANCE"];

const STATUS_CHIPS = [
  { value: "ALL", label: "All" },
  { value: "AVAILABLE", label: "Available", activeClass: "bg-emerald-600 text-white border-emerald-600" },
  { value: "CHECKED_OUT", label: "Checked Out", activeClass: "bg-blue-600 text-white border-blue-600" },
  { value: "DAMAGED", label: "Damaged", activeClass: "bg-red-600 text-white border-red-600" },
  { value: "UNDER_REPAIR", label: "Under Repair", activeClass: "bg-amber-600 text-white border-amber-600" },
  { value: "LOST", label: "Lost", activeClass: "bg-red-800 text-white border-red-800" },
  { value: "DISPOSED", label: "Disposed", activeClass: "bg-slate-600 text-white border-slate-600" },
];

interface Props {
  subItems: SubItemRecord[];
  itemId: string;
  canAct: boolean;
  onRefresh: () => void;
}

export function ItemDetailSubcodes({ subItems, itemId, canAct, onRefresh }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newStatus, setNewStatus] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // ── useMemo: filtered sub-items ──
  const filteredSubItems = useMemo(() => {
    if (statusFilter === "ALL") return subItems;
    return subItems.filter((s) => s.status === statusFilter);
  }, [subItems, statusFilter]);

  // ── useMemo: chip counts ──
  const chipCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: subItems.length };
    for (const s of subItems) {
      counts[s.status] = (counts[s.status] || 0) + 1;
    }
    return counts;
  }, [subItems]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selected.size === filteredSubItems.length) setSelected(new Set());
    else setSelected(new Set(filteredSubItems.map((s) => s.id)));
  }, [selected.size, filteredSubItems]);

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleBatchUpdate = async () => {
    if (!newStatus || selected.size === 0) return;
    setSubmitting(true);
    try {
      const promises = Array.from(selected).map((subItemId) =>
        fetch(`/api/items/${itemId}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newStatus, subItemId }),
        })
      );
      const results = await Promise.all(promises);
      const failed = results.filter((r) => !r.ok).length;
      if (failed > 0) toast.error(`${failed} update(s) failed`);
      else toast.success(`Updated ${selected.size} sub-item(s)`);
      setSelected(new Set());
      setNewStatus("");
      onRefresh();
    } catch {
      toast.error("Batch update failed");
    } finally {
      setSubmitting(false);
    }
  };

  // check if a sub-item has expandable detail
  const hasDetail = (sub: SubItemRecord): boolean =>
    !!(sub.condition || sub.notes);

  return (
    <div className="space-y-3">
      {/* ── Quick Filter Chips ── */}
      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_CHIPS.map((chip) => {
          const count = chipCounts[chip.value] || 0;
          if (chip.value !== "ALL" && count === 0) return null;
          return (
            <button
              key={chip.value}
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                statusFilter === chip.value
                  ? cn(chip.activeClass || "bg-primary text-primary-foreground border-primary")
                  : "bg-muted/50 text-foreground/70 border-border hover:bg-muted",
              )}
              onClick={() => setStatusFilter(chip.value)}
            >
              {chip.label}
              {count > 0 && (
                <span className={cn(
                  "ml-1 rounded-full px-1.5 text-[10px] leading-none",
                  statusFilter === chip.value ? "bg-white/20" : "bg-muted",
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Batch actions ── */}
      {canAct && (
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <span className="text-sm text-muted-foreground">{selected.size} selected</span>
              <Select value={newStatus} onValueChange={(v) => { if (v) setNewStatus(v); }}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Set status..." />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" disabled={!newStatus || submitting} onClick={handleBatchUpdate}>
                Apply
              </Button>
            </>
          )}
        </div>
      )}

      {/* ── Table ── */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {canAct && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={selected.size === filteredSubItems.length && filteredSubItems.length > 0}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
              )}
              <TableHead className="w-10" />
              <TableHead>Sub-code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Condition</TableHead>
              <TableHead className="hidden md:table-cell">Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSubItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canAct ? 7 : 6} className="text-center text-muted-foreground py-8">
                  No sub-codes
                </TableCell>
              </TableRow>
            ) : filteredSubItems.map((sub, idx) => {
              const expanded = expandedIds.has(sub.id);
              const expandable = hasDetail(sub);
              return (
                <SubItemRowGroup
                  key={sub.id}
                  sub={sub}
                  idx={idx}
                  expanded={expanded}
                  expandable={expandable}
                  canAct={canAct}
                  selected={selected.has(sub.id)}
                  onToggleExpand={() => toggleExpand(sub.id)}
                  onToggleSelect={() => toggleOne(sub.id)}
                />
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Expandable row group ──
function SubItemRowGroup({
  sub, idx, expanded, expandable, canAct, selected,
  onToggleExpand, onToggleSelect,
}: {
  sub: SubItemRecord;
  idx: number;
  expanded: boolean;
  expandable: boolean;
  canAct: boolean;
  selected: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
}) {
  const colCount = canAct ? 7 : 6;

  return (
    <>
      <TableRow className={cn(idx % 2 === 1 && "bg-muted/30")}>
        {canAct && (
          <TableCell>
            <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
          </TableCell>
        )}
        <TableCell>
          {expandable ? (
            <button onClick={onToggleExpand} className="text-muted-foreground hover:text-foreground transition-colors">
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <span className="w-4" />
          )}
        </TableCell>
        <TableCell className="font-mono text-sm">{sub.subCode}</TableCell>
        <TableCell className="text-sm">{sub.name || "-"}</TableCell>
        <TableCell>
          <Badge variant={STATUS_VARIANTS[sub.status] || "secondary"}>
            {sub.status.replace(/_/g, " ")}
          </Badge>
        </TableCell>
        <TableCell className="text-sm hidden md:table-cell">{sub.condition || "-"}</TableCell>
        <TableCell className="text-sm max-w-[200px] truncate hidden md:table-cell">{sub.notes || "-"}</TableCell>
      </TableRow>
      {expanded && expandable && (
        <TableRow className={cn("bg-muted/15", idx % 2 === 1 && "bg-muted/25")}>
          <TableCell colSpan={colCount} className="pl-16 py-3">
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 text-sm">
              {sub.condition && (
                <div>
                  <dt className="text-muted-foreground text-xs">Condition</dt>
                  <dd>{sub.condition}</dd>
                </div>
              )}
              {sub.notes && (
                <div className="col-span-2">
                  <dt className="text-muted-foreground text-xs">Notes</dt>
                  <dd>{sub.notes}</dd>
                </div>
              )}
            </dl>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
