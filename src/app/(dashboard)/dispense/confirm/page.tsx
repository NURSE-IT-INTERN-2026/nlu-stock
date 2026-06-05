"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCart } from "@/components/dispense/cart-context";
import { Loader2, Minus, Plus, Package, Trash2, Pencil, ShoppingCart, ArrowLeft, MapPin } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { USAGE_TYPE_OPTIONS } from "@/lib/constants";

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

function locationLabel(loc: { building: string; floor: string; room: string; detail: string | null } | null | undefined) {
  if (!loc) return null;
  return [loc.building, loc.floor, loc.room, loc.detail].filter(Boolean).join(" / ");
}

export default function ConfirmDispensePage() {
  const { items, removeItem, updateItem, clearCart } = useCart();
  const router = useRouter();
  const [usageType, setUsageType] = useState<string>("");
  const [usageNote, setUsageNote] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  const handleConfirm = async () => {
    if (items.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/dispense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Dispense failed");
      }

      const data = await res.json();
      toast.success(`Dispensed ${data.count} item(s) successfully`);
      clearCart();
      router.push("/dispense");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to dispense");
    } finally {
      setSubmitting(false);
    }
  };

  const adjustQty = (item: typeof items[number], delta: number) => {
    const newQty = item.quantity + delta;
    if (newQty < 1) return;
    if (!item.trackIndividually && newQty > item.availableQty) return;
    updateItem(item.itemId, { quantity: newQty }, item.lotId, item.subItemId);
  };

  const changeLot = (item: typeof items[number], newLotId: string | null) => {
    if (!newLotId) return;
    const lot = item.lots?.find((l) => l.id === newLotId);
    if (!lot) return;
    updateItem(item.itemId, {
      lotId: lot.id,
      lotNumber: lot.lotNumber,
    }, item.lotId, item.subItemId);
  };

  const changeSubItem = (item: typeof items[number], newSubId: string | null) => {
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

  // Empty state
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
          <ShoppingCart className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="text-center">
          <p className="text-lg font-medium">Cart is empty</p>
          <p className="text-sm text-muted-foreground mt-1">Add items from the dispense page first</p>
        </div>
        <Button variant="outline" onClick={() => router.push("/dispense")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Dispense
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col -m-6 h-[calc(100vh-3.5rem)]">
      {/* ── Items list (scrollable) ── */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold">ตะกร้าอุปกรณ์</h2>
            <p className="text-sm text-muted-foreground">ตรวจสอบรายการ ปรับจำนวน และเลือก lot ก่อนยืนยันการเบิก</p>
          </div>
          <Button size="lg" className="h-11" onClick={() => router.push("/dispense")}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            กลับหน้าเบิก-ยืม
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.map((item) => {
          const key = `${item.itemId}-${item.lotId ?? ""}-${item.subItemId ?? ""}`;
          return (
            <article key={key} className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_0_rgba(0,0,0,0.02),0_8px_24px_-12px_rgba(15,23,42,0.08)] transition-shadow hover:shadow-[0_1px_0_rgba(0,0,0,0.02),0_12px_28px_-12px_rgba(15,23,42,0.14)]">
              {/* Delete */}
              <button
                aria-label="Remove"
                className="absolute right-3 top-3 z-10 grid size-7 place-items-center rounded-md text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive transition-colors"
                onClick={() => removeItem(item.itemId, item.lotId, item.subItemId)}
              >
                <Trash2 className="size-4" />
              </button>

              {/* ── Top: image + body ── */}
              <div className="flex gap-4 p-4">
                {/* Thumbnail */}
                <div className="relative size-32 shrink-0 overflow-hidden rounded-xl bg-muted">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.itemName} loading="lazy" width={192} height={192} className="size-full object-cover" />
                  ) : (
                    <div className="grid size-full place-items-center text-muted-foreground/40">
                      <Package className="size-8" strokeWidth={1.5} />
                    </div>
                  )}
                </div>

                {/* Body */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{item.itemCode}</span>
                    <Badge variant="secondary" className="rounded-md bg-accent px-1.5 py-0 text-[10px] font-medium text-accent-foreground">
                      {item.categoryName}
                    </Badge>
                  </div>
                  <h3 className="mt-1 truncate text-[15px] font-semibold leading-snug text-foreground">{item.itemName}</h3>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <span className="inline-flex items-baseline gap-1 text-muted-foreground">
                      Available
                      <span className="text-sm font-semibold text-foreground">
                        {item.trackIndividually ? `${item.subItems?.length ?? 0}` : item.availableQty}
                      </span>
                      <span>{item.issueUnit}</span>
                    </span>
                    {item.location && (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <MapPin className="size-3.5 text-primary/80" />
                        {locationLabel(item.location)}
                      </span>
                    )}
                  </div>
                  {item.conversionFactor > 1 && (
                    <p className="mt-1 text-[10px] text-muted-foreground/50">
                      = {item.quantity * item.conversionFactor} {item.subUnit}
                    </p>
                  )}
                </div>
              </div>

              {/* ── Footer: lot/sub-item + qty ── */}
              <div className="mt-auto grid grid-cols-[1fr_auto] items-center gap-2 border-t border-border bg-muted/30 px-3 py-2.5">
                {/* Dropdowns */}
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  {/* Lot picker */}
                  {isConsumable(item) && item.lots && item.lots.length > 1 && (
                    <Select value={item.lotId ?? ""} onValueChange={(v) => changeLot(item, v)}>
                      <SelectTrigger className="h-8 w-full justify-between rounded-lg border-border bg-card font-mono text-xs">
                        <SelectValue>
                          {(value: string | null) => {
                            if (!value) return "Select lot";
                            const lot = item.lots?.find((l) => l.id === value);
                            return lot ? `${lot.lotNumber} — ${lot.quantity}` : value;
                          }}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {item.lots.map((lot) => (
                          <SelectItem key={lot.id} value={lot.id} className="font-mono text-xs">
                            {lot.lotNumber} — {lot.quantity} {item.issueUnit}
                            {lot.expiryDate && ` (exp: ${new Date(lot.expiryDate).toLocaleDateString()})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {/* Single lot badge */}
                  {isConsumable(item) && item.lots && item.lots.length <= 1 && item.lotNumber && (
                    <Badge variant="secondary" className="text-[10px]">Lot {item.lotNumber}</Badge>
                  )}
                  {/* Sub-item picker */}
                  {item.trackIndividually && item.subItems && item.subItems.length > 0 && (
                    <Select value={item.subItemId ?? ""} onValueChange={(v) => changeSubItem(item, v)}>
                      <SelectTrigger className="h-8 w-full justify-between rounded-lg border-border bg-card font-mono text-xs">
                        <SelectValue>
                          {(value: string | null) => {
                            if (!value) return "Select unit";
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
                            <SelectItem key={sub.id} value={sub.id} disabled={inCart} className="font-mono text-xs">
                              {sub.subCode} {inCart ? "(in cart)" : ""}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Qty control */}
                <div className="flex h-9 items-center rounded-lg border border-border bg-card">
                  <button
                    className="size-9 grid place-items-center rounded-l-lg rounded-r-none text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
                    onClick={() => adjustQty(item, -1)}
                    disabled={item.quantity <= 1}
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <div className="flex min-w-[56px] items-baseline justify-center gap-1 px-1.5 text-sm">
                    <EditableQty
                      value={item.quantity}
                      max={!item.trackIndividually ? item.availableQty : undefined}
                      unit={item.issueUnit}
                      onChange={(v) => updateItem(item.itemId, { quantity: v }, item.lotId, item.subItemId)}
                    />
                  </div>
                  <button
                    className="size-9 grid place-items-center rounded-l-none rounded-r-lg text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
                    onClick={() => adjustQty(item, 1)}
                    disabled={!item.trackIndividually && item.quantity >= item.availableQty}
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        </div>
      </div>

      {/* ── Sticky footer ── */}
      <div className="shrink-0 border-t bg-card px-6 py-3 flex items-center gap-4">
        <p className="text-xs text-muted-foreground">
          รวม: {items.length} รายการ · {totalQty} ชิ้น
        </p>
        <span className="flex-1" />

        {/* ใช้ใน */}
        <Select value={usageType} onValueChange={(v) => v !== null && setUsageType(v)}>
          <SelectTrigger className="h-8 text-xs w-[160px]">
            <SelectValue placeholder="ใช้ใน (optional)" />
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
          <Input
            placeholder="ระบุ..."
            value={usageNote}
            onChange={(e) => setUsageNote(e.target.value)}
            className="h-8 text-xs w-[160px]"
          />
        )}

        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setClearDialogOpen(true)}>
          Clear all
        </Button>
        <Button disabled={submitting} onClick={handleConfirm}>
          {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          Confirm Dispense
        </Button>
      </div>

      {/* ── Clear all dialog ── */}
      <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <DialogContent showCloseButton={false} className="max-w-[360px]">
          <DialogHeader>
            <DialogTitle>ล้างตะกร้า</DialogTitle>
            <DialogDescription>ต้องการลบอุปกรณ์ในตะกร้าทั้งหมดหรือไม่?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearDialogOpen(false)}>ยกเลิก</Button>
            <Button variant="destructive" onClick={() => { clearCart(); setClearDialogOpen(false); }}>
              ล้างทั้งหมด
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
