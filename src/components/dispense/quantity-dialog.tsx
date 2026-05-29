"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCart } from "./cart-context";
import type { CartItem } from "@/lib/validators/dispense";

interface ItemData {
  id: string;
  code: string;
  name: string;
  category: { name: string; category: string };
  trackIndividually: boolean;
  issueUnit: { id: string; name: string };
  subUnit: { id: string; name: string };
  conversionFactor: number;
  availableQty: number;
  lots: { id: string; lotNumber: string; expiryDate: string | null; quantity: number }[];
  subItems: { id: string; subCode: string; status: string; condition: string | null }[];
}

interface Props {
  item: ItemData | null;
  open: boolean;
  onClose: () => void;
}

export function QuantityDialog({ item, open, onClose }: Props) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [quantitySub, setQuantitySub] = useState(0);
  const [lotId, setLotId] = useState<string | null>(null);
  const [selectedSubItems, setSelectedSubItems] = useState<Set<string>>(new Set());

  // Reset state when item changes
  useEffect(() => {
    setQuantity(1);
    setQuantitySub(0);
    setLotId(null);
    setSelectedSubItems(new Set());
  }, [item?.id]);

  if (!item) return null;

  const categoryType = item.category.category as CartItem["categoryType"];
  const isConsumable = categoryType === "CON" || categoryType === "MED";
  const isTracked = item.trackIndividually && item.subItems.length > 1;

  const hasSingleSubItem = item.trackIndividually && item.subItems.length === 1;

  const handleAdd = () => {
    if (isConsumable) {
      const lot = item.lots.find((l) => l.id === lotId);
      addItem({
        itemId: item.id,
        itemCode: item.code,
        itemName: item.name,
        categoryName: item.category.name,
        categoryType,
        trackIndividually: isTracked,
        issueUnit: item.issueUnit.name,
        subUnit: item.subUnit.name,
        conversionFactor: item.conversionFactor,
        quantity,
        quantitySub,
        lotId,
        lotNumber: lot?.lotNumber ?? null,
        availableQty: item.availableQty,
      });
    } else if (isTracked) {
      for (const subId of selectedSubItems) {
        const sub = item.subItems.find((s) => s.id === subId);
        addItem({
          itemId: item.id,
          itemCode: item.code,
          itemName: item.name,
          categoryName: item.category.name,
          categoryType,
          trackIndividually: true,
          issueUnit: item.issueUnit.name,
          subUnit: item.subUnit.name,
          conversionFactor: item.conversionFactor,
          quantity: 1,
          quantitySub: 0,
          subItemId: subId,
          subCode: sub?.subCode ?? null,
          availableQty: item.availableQty,
        });
      }
    } else {
      addItem({
        itemId: item.id,
        itemCode: item.code,
        itemName: item.name,
        categoryName: item.category.name,
        categoryType,
        trackIndividually: false,
        issueUnit: item.issueUnit.name,
        subUnit: item.subUnit.name,
        conversionFactor: item.conversionFactor,
        quantity,
        quantitySub,
        subItemId: hasSingleSubItem ? item.subItems[0].id : null,
        subCode: hasSingleSubItem ? item.subItems[0].subCode : null,
        availableQty: item.availableQty,
      });
    }

    resetAndClose();
  };

  const resetAndClose = () => {
    setQuantity(1);
    setQuantitySub(0);
    setLotId(null);
    setSelectedSubItems(new Set());
    onClose();
  };

  const toggleSubItem = (id: string) => {
    setSelectedSubItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canAdd =
    isConsumable
      ? lotId !== null && quantity > 0
      : isTracked
        ? selectedSubItems.size > 0
        : quantity > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && resetAndClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {item.code} — {item.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{item.category.name}</Badge>
            <span className="text-sm text-muted-foreground">
              Available: {item.availableQty} {item.issueUnit.name}
            </span>
          </div>

          {isConsumable && (
            <>
              <div className="space-y-2">
                <Label>Lot (FIFO order)</Label>
                <Select value={lotId ?? ""} onValueChange={setLotId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select lot" />
                  </SelectTrigger>
                  <SelectContent>
                    {item.lots.map((lot) => (
                      <SelectItem key={lot.id} value={lot.id}>
                        {lot.lotNumber} — {lot.quantity} {item.issueUnit.name}
                        {lot.expiryDate && ` (exp: ${new Date(lot.expiryDate).toLocaleDateString()})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Qty ({item.issueUnit.name})</Label>
                  <Input
                    type="number"
                    min={1}
                    max={item.availableQty}
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  />
                </div>
                {item.conversionFactor > 1 && (
                  <div className="space-y-1">
                    <Label>Sub ({item.subUnit.name})</Label>
                    <Input
                      type="number"
                      min={0}
                      max={item.conversionFactor - 1}
                      value={quantitySub}
                      onChange={(e) => setQuantitySub(parseInt(e.target.value) || 0)}
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {isTracked && !isConsumable && (
            <div className="space-y-2">
              <Label>Select sub-items to dispense</Label>
              <div className="max-h-48 space-y-2 overflow-y-auto">
                {item.subItems.map((sub) => (
                  <label key={sub.id} className="flex items-center gap-2 rounded-md border p-2 cursor-pointer hover:bg-muted">
                    <Checkbox
                      checked={selectedSubItems.has(sub.id)}
                      onCheckedChange={() => toggleSubItem(sub.id)}
                    />
                    <span className="font-mono text-sm">{sub.subCode}</span>
                    {sub.condition && (
                      <Badge variant="secondary" className="text-xs">{sub.condition}</Badge>
                    )}
                  </label>
                ))}
              </div>
              {item.subItems.length === 0 && (
                <p className="text-sm text-muted-foreground">No available sub-items</p>
              )}
            </div>
          )}

          {!isTracked && !isConsumable && (
            <div className="space-y-1">
              <Label>Quantity ({item.issueUnit.name})</Label>
              <Input
                type="number"
                min={1}
                max={item.availableQty}
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={resetAndClose}>
              Cancel
            </Button>
            <Button disabled={!canAdd} onClick={handleAdd}>
              Add to Cart
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
