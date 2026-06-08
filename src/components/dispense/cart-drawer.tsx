"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCart } from "./cart-context";
import { ShoppingBasket, Loader2, Minus, Plus, Package, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { USAGE_TYPE_OPTIONS } from "@/lib/constants";
import { createDispense } from "@/lib/api";

function EditableQty({ value, max, unit, onChange }: {
  value: number;
  max?: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min={1}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const v = parseInt(draft) || 1;
          const clamped = Math.max(1, max ? Math.min(v, max) : v);
          onChange(clamped);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            setDraft(String(value));
            setEditing(false);
          }
        }}
        className="w-14 h-6 text-center text-sm font-medium tabular-nums bg-transparent border-0 px-1 outline-none focus:ring-1 focus:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
    );
  }

  return (
    <button
      className="flex items-center gap-0.5 w-14 justify-center group"
      onClick={() => { setDraft(String(value)); setEditing(true); }}
    >
      <span className="text-sm font-medium tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{unit}</span>
      <Pencil className="h-2.5 w-2.5 text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-colors" />
    </button>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

export function CartDrawer({ open, onClose, onDone }: Props) {
  const { items, removeItem, updateItem, clearCart } = useCart();
  const [usageType, setUsageType] = useState<string>("");
  const [usageNote, setUsageNote] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  const handleConfirm = async () => {
    if (items.length === 0) return;
    setSubmitting(true);
    try {
      const data = await createDispense({
        items: items.map((i) => ({
          itemId: i.itemId,
          subItemId: i.subItemId ?? null,
          lotId: i.lotId ?? null,
          quantity: i.quantity,
          quantitySub: i.quantitySub,
        })),
        usageType: usageType || null,
        usageNote: usageType === "OTHER" ? usageNote || null : null,
        notes: notes || null,
      });
      toast.success(`Dispensed ${data.count} item(s) successfully`);
      clearCart();
      setUsageType("");
      setUsageNote("");
      setNotes("");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to dispense");
    } finally {
      setSubmitting(false);
    }
  };

  const adjustQty = (
    item: typeof items[number],
    delta: number
  ) => {
    const newQty = item.quantity + delta;
    if (newQty < 1) return;
    if (!item.trackIndividually && newQty > item.availableQty) return;
    updateItem(item.itemId, { quantity: newQty }, item.lotId, item.subItemId);
  };

  const changeLot = (
    item: typeof items[number],
    newLotId: string | null
  ) => {
    if (!newLotId) return;
    const lot = item.lots?.find((l) => l.id === newLotId);
    if (!lot) return;
    updateItem(item.itemId, {
      lotId: lot.id,
      lotNumber: lot.lotNumber,
    }, item.lotId, item.subItemId);
  };

  const changeSubItem = (
    item: typeof items[number],
    newSubId: string | null
  ) => {
    if (!newSubId) return;
    const sub = item.subItems?.find((s) => s.id === newSubId);
    if (!sub) return;
    updateItem(item.itemId, {
      subItemId: sub.id,
      subCode: sub.subCode,
    }, item.lotId, item.subItemId);
  };

  const isConsumable = (item: typeof items[number]) =>
    item.categoryType === "CON" || item.categoryType === "MED";

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="flex flex-col sm:max-w-3xl p-0">
        {/* ── ZONE 1: Header ── */}
        <SheetHeader className="px-6 pt-6 pb-3 shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <ShoppingBasket className="h-5 w-5" />
            Cart ({items.length})
          </SheetTitle>
        </SheetHeader>

        {/* ── ZONE 2: Items (scrollable) ── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Cart is empty</p>
          ) : (
            <div className="space-y-2 pb-2">
              {items.map((item) => {
                const key = `${item.itemId}-${item.lotId ?? ""}-${item.subItemId ?? ""}`;
                return (
                  <div
                    key={key}
                    className="relative flex items-start gap-3 rounded-2xl border p-3 hover:bg-muted/50 transition-colors"
                  >
                    {/* Image — LEFT SIDE, same as item list */}
                    <div className="h-28 w-28 shrink-0 rounded-md overflow-hidden bg-muted flex items-center justify-center">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.itemName} className="h-full w-full object-cover" />
                      ) : (
                        <Package className="h-6 w-6 text-muted-foreground/50" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Row 1: code + badge */}
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[15px] text-muted-foreground">{item.itemCode}</span>
                        <Badge variant="outline" className="text-[13px]">{item.categoryName}</Badge>
                      </div>
                      {/* Row 2: name */}
                      <p className="text-[17px] font-medium line-clamp-2">{item.itemName}</p>
                      {/* Row 3: available qty */}
                      <p className="text-[15px] text-muted-foreground">
                        Available: {item.trackIndividually
                          ? `${item.subItems?.length ?? 0} units`
                          : `${item.availableQty} ${item.issueUnit}`}
                      </p>

                      {/* Row 4: Lot / Sub-item picker (full width) */}
                      {(isConsumable(item) && item.lots && item.lots.length > 1) && (
                        <div className="mt-1">
                          <Select
                            value={item.lotId ?? ""}
                            onValueChange={(v) => changeLot(item, v)}
                          >
                            <SelectTrigger className="h-7 text-xs gap-1 w-full">
                              <SelectValue>
                                {(value: string | null) => {
                                  if (!value) return "Select lot";
                                  const lot = item.lots?.find((l) => l.id === value);
                                  return lot ? `${lot.lotNumber} — ${lot.quantity} ${item.issueUnit}` : value;
                                }}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {item.lots.map((lot) => (
                                <SelectItem key={lot.id} value={lot.id}>
                                  {lot.lotNumber} — {lot.quantity} {item.issueUnit}
                                  {lot.expiryDate && ` (exp: ${new Date(lot.expiryDate).toLocaleDateString()})`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {item.trackIndividually && item.subItems && item.subItems.length > 0 && (
                        <div className="mt-1">
                          <Select
                            value={item.subItemId ?? ""}
                            onValueChange={(v) => changeSubItem(item, v)}
                          >
                            <SelectTrigger className="h-7 text-xs gap-1 w-full">
                              <SelectValue>
                                {(value: string | null) => {
                                  if (!value) return "Select sub-item";
                                  const sub = item.subItems?.find((s) => s.id === value);
                                  return sub ? sub.subCode : value;
                                }}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {item.subItems.map((sub) => {
                                const inCart = items.some(
                                  (c) => c.itemId === item.itemId && c.subItemId === sub.id && (item.subItemId ?? null) !== sub.id
                                );
                                return (
                                  <SelectItem key={sub.id} value={sub.id} disabled={inCart}>
                                    {sub.subCode} {inCart ? "(in cart)" : ""}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {isConsumable(item) && item.lots && item.lots.length <= 1 && item.lotNumber && (
                        <div className="mt-1">
                          <Badge variant="secondary" className="text-[10px]">Lot {item.lotNumber}</Badge>
                        </div>
                      )}

                      {/* Row 5: Qty (align right) */}
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <div className="flex items-center gap-0.5 bg-background border rounded-full px-0.5">
                          <button
                            className="h-6 w-6 flex items-center justify-center rounded-full hover:bg-muted transition-colors disabled:opacity-30"
                            onClick={() => adjustQty(item, -1)}
                            disabled={item.quantity <= 1}
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <EditableQty
                            value={item.quantity}
                            max={!item.trackIndividually ? item.availableQty : undefined}
                            unit={item.issueUnit}
                            onChange={(v) => {
                              updateItem(item.itemId, { quantity: v }, item.lotId, item.subItemId);
                            }}
                          />
                          <button
                            className="h-6 w-6 flex items-center justify-center rounded-full hover:bg-muted transition-colors disabled:opacity-30"
                            onClick={() => adjustQty(item, 1)}
                            disabled={!item.trackIndividually && item.quantity >= item.availableQty}
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        {item.quantitySub > 0 && (
                          <span className="text-xs text-muted-foreground">
                            + {item.quantitySub} {item.subUnit}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Delete button top-right */}
                    <button
                      className="absolute top-2 right-2 p-1 rounded text-muted-foreground/40 hover:text-destructive transition-colors"
                      onClick={() => removeItem(item.itemId, item.lotId, item.subItemId)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── ZONE 3: Form ── */}
        <div className="shrink-0 px-6 pt-3 pb-2 border-t space-y-2">
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">ใช้ใน</span>
            <Select value={usageType} onValueChange={(v) => v !== null && setUsageType(v)}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="เลือกประเภทการใช้ (optional)" />
              </SelectTrigger>
              <SelectContent>
                {USAGE_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {usageType === "OTHER" && (
              <>
                <span className="text-xs text-muted-foreground whitespace-nowrap">ระบุ</span>
                <Input
                  placeholder="เช่น ประชุมคณะ, โครงการพิเศษ..."
                  value={usageNote}
                  onChange={(e) => setUsageNote(e.target.value)}
                  className="h-8 text-sm"
                />
              </>
            )}

            <span className="text-xs text-muted-foreground whitespace-nowrap">Notes</span>
            <Textarea
              placeholder="Optional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="text-sm"
            />
          </div>
        </div>

        {/* ── Summary + Footer ── */}
        <div className="shrink-0 border-t px-6 py-3 space-y-2">
          {items.length > 0 && (
            <p className="text-xs text-muted-foreground text-center">
              รวม: {items.length} รายการ · {totalQty} ชิ้น
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => { clearCart(); onClose(); }}>
              Clear
            </Button>
            <Button className="flex-1" disabled={items.length === 0 || submitting} onClick={handleConfirm}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Confirm Dispense
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
