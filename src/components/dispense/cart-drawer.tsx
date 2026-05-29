"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useCart } from "./cart-context";
import { X, ShoppingCart, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { USAGE_TYPE_OPTIONS } from "@/lib/constants";

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

export function CartDrawer({ open, onClose, onDone }: Props) {
  const { items, removeItem, clearCart } = useCart();
  const [usageType, setUsageType] = useState<string>("");
  const [usageNote, setUsageNote] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="flex flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Cart ({items.length})
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Cart is empty</p>
          ) : (
            <div className="space-y-3">
              {items.map((item, i) => (
                <div key={`${item.itemId}-${item.lotId ?? ""}-${item.subItemId ?? ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {item.itemCode} — {item.itemName}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Badge variant="outline" className="text-xs">{item.categoryName}</Badge>
                        {item.lotNumber && (
                          <Badge variant="secondary" className="text-xs">Lot: {item.lotNumber}</Badge>
                        )}
                        {item.subCode && (
                          <Badge variant="secondary" className="text-xs">{item.subCode}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {item.quantity} {item.issueUnit}
                        {item.quantitySub > 0 && ` + ${item.quantitySub} ${item.subUnit}`}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 h-7 w-7"
                      onClick={() => removeItem(item.itemId, item.lotId, item.subItemId)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {i < items.length - 1 && <Separator className="mt-3" />}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="space-y-3 pt-4 border-t">
          <div className="space-y-1.5">
            <Label>ใช้ใน (Usage Type)</Label>
            <Select value={usageType} onValueChange={(v) => v !== null && setUsageType(v)}>
              <SelectTrigger>
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
          </div>

          {usageType === "OTHER" && (
            <div className="space-y-1.5">
              <Label>ระบุ (Note)</Label>
              <Input
                placeholder="เช่น ประชุมคณะ, โครงการพิเศษ..."
                value={usageNote}
                onChange={(e) => setUsageNote(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              placeholder="Optional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <SheetFooter className="flex-row gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => { clearCart(); onClose(); }}>
              Clear
            </Button>
            <Button className="flex-1" disabled={items.length === 0 || submitting} onClick={handleConfirm}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Confirm Dispense
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
}
