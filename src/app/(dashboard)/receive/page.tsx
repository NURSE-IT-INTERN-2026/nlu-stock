"use client";

import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Search, Send, Package } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchItem {
  id: string;
  code: string;
  name: string;
  nameTh: string | null;
  issueUnit: { id: string; name: string };
  subUnit: { id: string; name: string };
  conversionFactor: number;
  trackIndividually: boolean;
  category: { name: string; category: string };
  location: { room: string; cabinet: string | null; shelf: string | null } | null;
}

interface ReceiveRow {
  id: string;
  item: SearchItem;
  quantity: number;
  lotNumber: string;
  expiryDate: string;
  subCodes: string[];
}

export default function ReceivePage() {
  const [rows, setRows] = useState<ReceiveRow[]>([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerIdx, setPickerIdx] = useState<number | null>(null);

  // Item search
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<SearchItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const doSearch = useCallback(async (q: string) => {
    if (!q) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/dispense/items?q=${encodeURIComponent(q)}&limit=20`);
      const data = await res.json();
      setSearchResults(data.items ?? []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleSearchChange = (val: string) => {
    setSearchQ(val);
    if (val) doSearch(val);
    else setSearchResults([]);
  };

  const addItem = (item: SearchItem) => {
    setRows((prev) => {
      if (prev.some((r) => r.item.id === item.id)) {
        toast.error(`${item.code} already in list`);
        return prev;
      }
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          item,
          quantity: 1,
          lotNumber: "",
          expiryDate: "",
          subCodes: [],
        },
      ];
    });
    setPickerOpen(false);
    setPickerIdx(null);
    setSearchQ("");
    setSearchResults([]);
  };

  const updateRow = (id: string, updates: Partial<ReceiveRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const openItemPicker = (idx: number | null) => {
    setPickerIdx(idx);
    setPickerOpen(true);
    setSearchQ("");
    setSearchResults([]);
  };

  const categoryColor = (cat: string) => {
    switch (cat) {
      case "CONSUMABLE": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "DURABLE": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "FIXED_ASSET": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case "BOOK": return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
      default: return "";
    }
  };

  const handleSubmit = async () => {
    if (rows.length === 0) {
      toast.error("Add at least one item");
      return;
    }

    // Validate
    for (const row of rows) {
      if (row.quantity < 1) {
        toast.error(`Invalid quantity for ${row.item.code}`);
        return;
      }
      const isConsumable = row.item.category.category === "CONSUMABLE";
      if (isConsumable && !row.lotNumber.trim()) {
        toast.error(`Lot number required for consumable: ${row.item.code}`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        items: rows.map((r) => ({
          itemId: r.item.id,
          quantity: r.quantity,
          lotNumber: r.item.category.category === "CONSUMABLE" ? r.lotNumber || null : null,
          expiryDate: r.expiryDate || null,
          subCodes: r.item.trackIndividually && r.subCodes.length > 0 ? r.subCodes : null,
        })),
        notes: notes || null,
      };

      const res = await fetch("/api/receive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Receive failed");
        return;
      }

      toast.success(`Received ${data.count} item(s) successfully`);
      setRows([]);
      setNotes("");
    } catch {
      toast.error("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Receive Items</h1>
        <Button onClick={() => openItemPicker(null)} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add Item
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Package className="h-10 w-10 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              No items added yet. Click &quot;Add Item&quot; to start receiving.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row, idx) => {
            const isConsumable = row.item.category.category === "CONSUMABLE";
            return (
              <Card key={row.id}>
                <CardContent className="space-y-3">
                  {/* Item header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-muted-foreground">{row.item.code}</span>
                        <Badge className={cn("text-[10px]", categoryColor(row.item.category.category))}>
                          {row.item.category.name}
                        </Badge>
                        {row.item.trackIndividually && (
                          <Badge variant="outline" className="text-[10px]">Tracked</Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium">{row.item.name}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openItemPicker(idx)}
                        title="Change item"
                      >
                        <Search className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => removeRow(row.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Quantity */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Quantity ({row.item.issueUnit.name})</Label>
                      <Input
                        type="number"
                        min={1}
                        value={row.quantity}
                        onChange={(e) => updateRow(row.id, { quantity: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    {row.item.trackIndividually && (
                      <div className="space-y-1">
                        <Label className="text-xs">Sub-codes (comma separated)</Label>
                        <Input
                          placeholder="A001, A002, A003"
                          value={row.subCodes.join(", ")}
                          onChange={(e) => {
                            const codes = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                            updateRow(row.id, { subCodes: codes });
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Consumable fields */}
                  {isConsumable && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Lot Number *</Label>
                        <Input
                          placeholder="LOT-001"
                          value={row.lotNumber}
                          onChange={(e) => updateRow(row.id, { lotNumber: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Expiry Date</Label>
                        <Input
                          type="date"
                          value={row.expiryDate}
                          onChange={(e) => updateRow(row.id, { expiryDate: e.target.value })}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Notes */}
      {rows.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs">Notes</Label>
          <Textarea
            placeholder="Optional notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>
      )}

      {/* Submit FAB */}
      {rows.length > 0 && (
        <div className="fixed bottom-20 left-0 right-0 px-4 md:bottom-6 md:left-auto md:right-6 md:w-auto z-40">
          <Button
            size="lg"
            className="w-full md:w-auto shadow-lg"
            onClick={handleSubmit}
            disabled={submitting}
          >
            <Send className="h-4 w-4 mr-2" />
            {submitting ? "Processing..." : `Receive ${rows.length} Item(s)`}
          </Button>
        </div>
      )}

      {/* Item Picker Dialog */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by code or name..."
                value={searchQ}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>
            <div className="max-h-[300px] overflow-y-auto space-y-1">
              {searchLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))
              ) : searchResults.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {searchQ ? "No items found" : "Type to search"}
                </p>
              ) : (
                searchResults.map((item) => {
                  const alreadyAdded = rows.some((r) => r.item.id === item.id);
                  return (
                    <button
                      key={item.id}
                      className={cn(
                        "w-full text-left rounded-lg border p-2.5 transition-colors",
                        alreadyAdded
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:bg-muted/50 cursor-pointer",
                      )}
                      disabled={alreadyAdded}
                      onClick={() => {
                        if (pickerIdx !== null) {
                          setRows((prev) =>
                            prev.map((r, i) =>
                              i === pickerIdx
                                ? { ...r, item, quantity: 1, lotNumber: "", expiryDate: "", subCodes: [] }
                                : r
                            )
                          );
                          setPickerOpen(false);
                          setPickerIdx(null);
                        } else {
                          addItem(item);
                        }
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{item.code}</span>
                        <Badge className={cn("text-[10px]", categoryColor(item.category.category))}>
                          {item.category.category}
                        </Badge>
                        {alreadyAdded && (
                          <Badge variant="outline" className="text-[10px]">Added</Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium">{item.name}</p>
                      {item.location && (
                        <p className="text-xs text-muted-foreground">
                          {item.location.room}{item.location.cabinet ? ` / ${item.location.cabinet}` : ""}
                        </p>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
