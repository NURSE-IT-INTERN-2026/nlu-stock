"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { CartItem } from "@/lib/validators/dispense";

interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (itemId: string, lotId?: string | null, subItemId?: string | null) => void;
  updateItem: (itemId: string, updates: Partial<CartItem>, lotId?: string | null, subItemId?: string | null) => void;
  clearCart: () => void;
  itemCount: number;
  getItemQty: (itemId: string) => number;
}

const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = useCallback((item: CartItem) => {
    setItems((prev) => {
      const key = (i: CartItem) => `${i.itemId}-${i.lotId ?? ""}-${i.subItemId ?? ""}`;
      const idx = prev.findIndex((i) => key(i) === key(item));
      if (idx >= 0) {
        const existing = prev[idx];
        const newQty = Math.min(existing.quantity + item.quantity, item.availableQty);
        const newQtySub = existing.quantitySub + item.quantitySub;
        const updated = [...prev];
        updated[idx] = { ...existing, quantity: newQty, quantitySub: newQtySub };
        return updated;
      }
      const clampedQty = Math.min(item.quantity, item.availableQty);
      return [...prev, { ...item, quantity: clampedQty }];
    });
  }, []);

  const removeItem = useCallback((itemId: string, lotId?: string | null, subItemId?: string | null) => {
    setItems((prev) =>
      prev.filter((i) => !(i.itemId === itemId && (i.lotId ?? null) === (lotId ?? null) && (i.subItemId ?? null) === (subItemId ?? null)))
    );
  }, []);

  const updateItem = useCallback((itemId: string, updates: Partial<CartItem>, lotId?: string | null, subItemId?: string | null) => {
    setItems((prev) =>
      prev.map((i) =>
        i.itemId === itemId && (i.lotId ?? null) === (lotId ?? null) && (i.subItemId ?? null) === (subItemId ?? null)
          ? { ...i, ...updates }
          : i
      )
    );
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const getItemQty = useCallback((itemId: string) =>
    items.filter((i) => i.itemId === itemId).reduce((s, i) => s + i.quantity, 0),
  [items]);

  return (
    <CartContext value={{ items, addItem, removeItem, updateItem, clearCart, itemCount: items.length, getItemQty }}>
      {children}
    </CartContext>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

/** Shared per-line cart actions used by both CartDrawer and the confirm page. */
export function useCartLineActions() {
  const { updateItem } = useCart();

  const adjustQty = useCallback((item: CartItem, delta: number) => {
    const newQty = item.quantity + delta;
    if (newQty < 1) return;
    if (!item.trackIndividually && newQty > item.availableQty) return;
    updateItem(item.itemId, { quantity: newQty }, item.lotId, item.subItemId);
  }, [updateItem]);

  const changeLot = useCallback((item: CartItem, newLotId: string | null) => {
    if (!newLotId) return;
    const lot = item.lots?.find((l) => l.id === newLotId);
    if (!lot) return;
    updateItem(item.itemId, { lotId: lot.id, lotNumber: lot.lotNumber }, item.lotId, item.subItemId);
  }, [updateItem]);

  const changeSubItem = useCallback((item: CartItem, newSubId: string | null) => {
    if (!newSubId) return;
    const sub = item.subItems?.find((s) => s.id === newSubId);
    if (!sub) return;
    updateItem(item.itemId, { subItemId: sub.id, subCode: sub.subCode }, item.lotId, item.subItemId);
  }, [updateItem]);

  return { adjustQty, changeLot, changeSubItem };
}
