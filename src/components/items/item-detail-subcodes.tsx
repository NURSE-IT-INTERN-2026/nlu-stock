"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface SubItemRecord {
  id: string;
  subCode: string;
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

  const toggleAll = () => {
    if (selected.size === subItems.length) setSelected(new Set());
    else setSelected(new Set(subItems.map((s) => s.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBatchUpdate = async () => {
    if (!newStatus || selected.size === 0) return;
    setSubmitting(true);
    try {
      // Update each selected sub-item
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

  return (
    <div className="space-y-3">
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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {canAct && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={selected.size === subItems.length && subItems.length > 0}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
              )}
              <TableHead>Sub-code</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canAct ? 5 : 4} className="text-center text-muted-foreground py-8">
                  No sub-codes
                </TableCell>
              </TableRow>
            ) : subItems.map((sub) => (
              <TableRow key={sub.id}>
                {canAct && (
                  <TableCell>
                    <Checkbox checked={selected.has(sub.id)} onCheckedChange={() => toggleOne(sub.id)} />
                  </TableCell>
                )}
                <TableCell className="font-mono text-sm">{sub.subCode}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANTS[sub.status] || "secondary"}>
                    {sub.status.replace(/_/g, " ")}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{sub.condition || "-"}</TableCell>
                <TableCell className="text-sm max-w-[200px] truncate">{sub.notes || "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
