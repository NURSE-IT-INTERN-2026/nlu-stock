"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { FileUpload } from "@/components/shared/file-upload";
import { createMaintenance, searchDispenseItems } from "@/lib/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId?: string;
  itemLabel?: string;
  maintenanceCycleMonths?: number;
  onSuccess: () => void;
}

interface SearchItem {
  id: string;
  code: string;
  name: string;
  category: { name: string; category: string };
}

export function MaintenanceFormDialog({ open, onOpenChange, itemId, itemLabel, maintenanceCycleMonths, onSuccess }: Props) {
  // ── Item selection ──
  const hasDefaultItem = !!itemId;
  const [selectedItemId, setSelectedItemId] = useState<string | null>(itemId ?? null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // ── Form fields ──
  const [type, setType] = useState<"PREVENTIVE" | "CORRECTIVE">("PREVENTIVE");
  const [result, setResult] = useState<"AVAILABLE" | "NEEDS_MORE_REPAIR" | "DISPOSED">("AVAILABLE");
  const [performedAt, setPerformedAt] = useState(new Date().toISOString().split("T")[0]);
  const [issue, setIssue] = useState("");
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  const [nextMaintenanceAt, setNextMaintenanceAt] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Reset on open/close ──
  useEffect(() => {
    if (open) {
      setSelectedItemId(itemId ?? null);
      setSearchQuery("");
      setSearchResults([]);
    }
  }, [open, itemId]);

  // ── Item search ──
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const data = await searchDispenseItems({ q, limit: "20" });
      setSearchResults((data.items ?? []) as SearchItem[]);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (hasDefaultItem) return; // no search when item is pre-selected
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(searchQuery), 300);
    return () => clearTimeout(searchTimer.current);
  }, [searchQuery, doSearch, hasDefaultItem]);

  // ── Auto-calculate next maintenance date ──
  const cycle = maintenanceCycleMonths ?? 0;
  useEffect(() => {
    if (cycle > 0 && performedAt) {
      const d = new Date(performedAt);
      d.setMonth(d.getMonth() + cycle);
      setNextMaintenanceAt(d.toISOString().split("T")[0]);
    }
  }, [performedAt, cycle]);

  const handleSubmit = async () => {
    const targetId = selectedItemId;
    if (!targetId) {
      toast.error("Please select an item");
      return;
    }
    setSubmitting(true);
    try {
      await createMaintenance(targetId, {
        type,
        result,
        performedAt,
        issue: issue || null,
        description: description || null,
        cost: cost ? parseFloat(cost) : null,
        nextMaintenanceAt: nextMaintenanceAt || null,
        attachmentUrls: attachmentUrl ? [attachmentUrl] : [],
      });
      toast.success("Maintenance record saved");
      resetAndClose();
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  const resetAndClose = () => {
    setType("PREVENTIVE");
    setResult("AVAILABLE");
    setPerformedAt(new Date().toISOString().split("T")[0]);
    setIssue("");
    setDescription("");
    setCost("");
    setNextMaintenanceAt("");
    setAttachmentUrl(null);
    setSelectedItemId(itemId ?? null);
    setSearchQuery("");
    setSearchResults([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Maintenance</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* ── Item selector ── */}
          {hasDefaultItem ? (
            <div className="rounded-lg border px-3 py-2 text-sm bg-muted/30">
              <span className="text-muted-foreground">Item: </span>
              <span className="font-medium">{itemLabel ?? itemId}</span>
            </div>
          ) : selectedItemId ? (
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <span className="text-sm font-medium">Item selected</span>
              <Button variant="ghost" size="sm" onClick={() => { setSelectedItemId(null); setSearchQuery(""); }}>
                Change
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search item by name or code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  autoFocus
                />
              </div>
              {searching && (
                <div className="text-xs text-muted-foreground py-1">Searching...</div>
              )}
              {searchResults.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-lg border divide-y">
                  {searchResults.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedItemId(item.id);
                        setSearchResults([]);
                        setSearchQuery("");
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                    >
                      <span className="font-mono text-xs text-muted-foreground">{item.code}</span>
                      <span className="ml-2">{item.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {searchQuery && !searching && searchResults.length === 0 && (
                <div className="text-xs text-muted-foreground py-1">No items found</div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PREVENTIVE">ป้องกัน</SelectItem>
                  <SelectItem value="CORRECTIVE">ซ่อมแก้ไข</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Result</Label>
              <Select value={result} onValueChange={(v) => setResult(v as typeof result)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AVAILABLE">พร้อมใช้งาน</SelectItem>
                  <SelectItem value="NEEDS_MORE_REPAIR">ต้องซ่อมเพิ่ม</SelectItem>
                  <SelectItem value="DISPOSED">จำหน่าย</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Date Performed</Label>
            <Input type="date" value={performedAt} onChange={(e) => setPerformedAt(e.target.value)} />
          </div>

          {type === "CORRECTIVE" && (
            <div className="space-y-1.5">
              <Label>Issue</Label>
              <Input value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="What was wrong?" />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Work performed..." rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Cost (฿)</Label>
              <Input type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Next Maintenance</Label>
              <Input type="date" value={nextMaintenanceAt} onChange={(e) => setNextMaintenanceAt(e.target.value)} />
              {cycle > 0 && nextMaintenanceAt && (
                <span className="text-[11px] text-muted-foreground">Auto: +{cycle} months</span>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Attachment</Label>
            <FileUpload
              value={attachmentUrl}
              onChange={setAttachmentUrl}
              accept="image/*,.pdf"
              label="Upload Attachment"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={resetAndClose}>Cancel</Button>
            <Button disabled={submitting || !selectedItemId} onClick={handleSubmit}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
