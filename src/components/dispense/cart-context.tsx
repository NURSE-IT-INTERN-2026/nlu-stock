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
        const updated = [...prev];
        updated[idx] = { ...existing, quantity: newQty };
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

/** Shared per-line cart actions used by the cart page. */
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

/** Normalized item shape both dispense search results and item detail can map to. */
export interface DispenseableItem {
  id: string;
  code: string;
  name: string;
  imageUrl: string | null;
  categoryName: string;
  dispenseType: "CONSUMABLE" | "COUNT" | "ITEM";
  trackIndividually: boolean;
  issueUnit: string;
  availableQty: number;
  location: { building: string; floor: string; room: string; detail: string | null } | null;
  lots: { id: string; lotNumber: string; expiryDate: string | null; remainingQty: number }[];
  subItems: { id: string; subCode: string }[];
}

export type AddToCartResult =
  | { ok: true; cartItem: CartItem }
  | { ok: false; reason: "no-sub" | "no-stock" };

/**
 * Build a cart line with smart defaults — same logic the dispense grid uses:
 *  - consumable with lots → FIFO lot (API returns lots sorted by expiry ASC)
 *  - tracked item         → next sub-item not already in cart
 *  - otherwise            → plain qty-1 line
 * `usedSubIds` = sub-item ids already in the cart for this item.
 */
export function buildCartItem(item: DispenseableItem, usedSubIds: Set<string | null | undefined>): AddToCartResult {
  const loc = item.location
    ? { building: item.location.building, floor: item.location.floor, room: item.location.room, detail: item.location.detail }
    : null;

  const base = {
    itemId: item.id,
    itemCode: item.code,
    itemName: item.name,
    imageUrl: item.imageUrl,
    categoryName: item.categoryName,
    dispenseType: item.dispenseType,
    issueUnit: item.issueUnit,
    availableQty: item.availableQty,
    location: loc,
    quantity: 1,
    lotId: null as string | null,
    lotNumber: null as string | null,
  };

  if (item.dispenseType === "CONSUMABLE" && item.lots.length > 0) {
    const lot = item.lots[0];
    return {
      ok: true,
      cartItem: {
        ...base,
        trackIndividually: false,
        lotId: lot.id,
        lotNumber: lot.lotNumber,
        subItemId: null,
        subCode: null,
        lots: item.lots.map((l) => ({ id: l.id, lotNumber: l.lotNumber, expiryDate: l.expiryDate, quantity: l.remainingQty })),
        subItems: [],
      },
    };
  }

  if (item.trackIndividually && item.subItems.length > 0) {
    const nextSub = item.subItems.find((s) => !usedSubIds.has(s.id));
    if (!nextSub) return { ok: false, reason: "no-sub" };
    return {
      ok: true,
      cartItem: {
        ...base,
        trackIndividually: true,
        subItemId: nextSub.id,
        subCode: nextSub.subCode,
        lots: [],
        subItems: item.subItems.map((s) => ({ id: s.id, subCode: s.subCode })),
      },
    };
  }

  if (item.availableQty <= 0) return { ok: false, reason: "no-stock" };

  const hasSingleSubItem = item.trackIndividually && item.subItems.length === 1;
  return {
    ok: true,
    cartItem: {
      ...base,
      trackIndividually: false,
      subItemId: hasSingleSubItem ? item.subItems[0].id : null,
      subCode: hasSingleSubItem ? item.subItems[0].subCode : null,
      lots: [],
      subItems: [],
    },
  };
}
