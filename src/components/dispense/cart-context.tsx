"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { toast } from "sonner";
import { addCartLine, deleteCartLine, getCart, patchCartLine } from "@/lib/api";
import { cartLineKey } from "@/lib/cart";
import type { CartItem } from "@/lib/validators/dispense";

interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (itemId: string, lotId?: string | null, subItemId?: string | null) => void;
  updateItem: (itemId: string, updates: Partial<CartItem>, lotId?: string | null, subItemId?: string | null) => void;
  clearCart: () => void;
  itemCount: number;
  getItemQty: (itemId: string) => number;
  /** ดึงตะกร้าใหม่จาก server — หน้าจอที่อยากได้ยอดสดกดเรียกเองได้ */
  refresh: () => Promise<void>;
}

const CartContext = createContext<CartState | null>(null);

// ตะกร้าอยู่ใน DB (ตาราง cart_lines) ไม่ใช่ localStorage — requirement คือล็อกอินเครื่องอื่น
// แล้วตะกร้ายังอยู่ ซึ่งที่เก็บฝั่งเบราว์เซอร์ทำไม่ได้ไม่ว่าจะตั้งชื่อ key ยังไง
//
// ทุก mutation อัปเดตในหน่วยความจำก่อน (optimistic) แล้วค่อยยิง API — คนกด +/- รัวๆ ต้องไม่
// เห็นตัวเลขกระตุก. ทุก endpoint คืนตะกร้าทั้งใบกลับมา ผลที่ได้จึงถูกเขียนทับด้วยค่าจริงจาก DB
// เสมอ พลาดเมื่อไหร่ก็เด้งกลับพร้อมบอกเหตุ ไม่ปล่อยให้จอโกหกเงียบๆ
//
// เจตนาที่ต้องไม่หายไป: **ตะกร้าไม่จองสต็อก** ของชิ้นสุดท้ายอยู่ในตะกร้าหลายคนพร้อมกันได้
// ใครกดยืนยันก่อนได้ไป — /api/borrow และ /api/dispense ตัดสินใต้ row lock เป็นเจ้าเดียว
export function CartProvider({ userId, children }: { userId?: string; children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  // คิวเดียว ยิงทีละใบตามลำดับที่ผู้ใช้กด — ไม่ใช่ยิงพร้อมกันแล้วหวังว่าจะถึงตามลำดับ
  // กด + สี่ครั้งรัวๆ คือ PATCH 4 ใบ ถ้าปล่อยขนานกัน เบราว์เซอร์เปิดหลายคอนเนกชันได้ ใบที่ยิง
  // ก่อนอาจถึงทีหลัง แล้ว "จำนวน 4" ถูกทับด้วย "จำนวน 3" ที่มาช้า จอกับ DB จบไม่ตรงกันเงียบๆ
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  const enqueue = useCallback((call: () => Promise<{ items: CartItem[] }>, fallbackMsg: string) => {
    chain.current = chain.current
      .catch(() => {})
      .then(() => call())
      .then((d) => setItems(d.items))
      .catch(async (e) => {
        toast.error(e instanceof Error ? e.message : fallbackMsg);
        // ค่าที่จออยู่ตอนนี้เป็นค่าที่เดาไว้ตอน optimistic update — ดึงของจริงมาทับ
        try { setItems((await getCart()).items); } catch { /* ยังใช้ค่าเดิมต่อได้ */ }
      });
    return chain.current;
  }, []);

  /** ดึงตะกร้าใหม่จาก server — ต่อท้ายคิวเดียวกัน จะได้ไม่แซงคำสั่งที่ยังค้างอยู่ */
  const refresh = useCallback(async () => {
    await enqueue(() => getCart(), "โหลดตะกร้าไม่สำเร็จ");
  }, [enqueue]);

  // โหลดตะกร้าของคนที่ล็อกอินอยู่ และโหลดใหม่เมื่อสลับคน (ล็อกอินคนใหม่ในแท็บเดิม)
  useEffect(() => {
    if (!userId) { setItems([]); return; }
    void refresh();
  }, [userId, refresh]);

  const addItem = useCallback((item: CartItem) => {
    const key = (i: CartItem) => cartLineKey(i.itemId, i.subItemId, i.lotId);
    // POST /api/cart เป็น increment ล้วนๆ (ตั้งใจไม่ clamp) แล้วคืนตะกร้าทั้งใบมาทับ — ถ้าส่งจำนวนดิบ
    // ไป ยอดใน DB จะทะลุเพดานแล้วลบค่าที่ clamp ไว้ตรงนี้ทิ้ง จึงต้องส่ง "ส่วนที่เพิ่มได้จริง"
    const existing = items.find((i) => key(i) === key(item));
    const delta = Math.min(item.quantity, item.availableQty - (existing?.quantity ?? 0));
    if (delta <= 0) return; // เต็มเพดานแล้ว ไม่ต้องยิงให้ server เพิ่มเปล่าๆ
    setItems((prev) => {
      const idx = prev.findIndex((i) => key(i) === key(item));
      if (idx < 0) return [...prev, { ...item, quantity: delta }];
      const updated = [...prev];
      updated[idx] = { ...prev[idx], quantity: prev[idx].quantity + delta };
      return updated;
    });
    void enqueue(
      () => addCartLine({ itemId: item.itemId, subItemId: item.subItemId, lotId: item.lotId, quantity: delta }),
      "เพิ่มลงตะกร้าไม่สำเร็จ",
    );
  }, [enqueue, items]);

  const removeItem = useCallback((itemId: string, lotId?: string | null, subItemId?: string | null) => {
    const key = cartLineKey(itemId, subItemId, lotId);
    setItems((prev) => prev.filter((i) => cartLineKey(i.itemId, i.subItemId, i.lotId) !== key));
    void enqueue(() => deleteCartLine(key), "ลบออกจากตะกร้าไม่สำเร็จ");
  }, [enqueue]);

  const updateItem = useCallback((itemId: string, updates: Partial<CartItem>, lotId?: string | null, subItemId?: string | null) => {
    const key = cartLineKey(itemId, subItemId, lotId);
    setItems((prev) =>
      prev.map((i) => (cartLineKey(i.itemId, i.subItemId, i.lotId) === key ? { ...i, ...updates } : i)),
    );
    void enqueue(
      () => patchCartLine({
        lineKey: key,
        ...(updates.quantity !== undefined ? { quantity: updates.quantity } : {}),
        ...("subItemId" in updates ? { subItemId: updates.subItemId } : {}),
        ...("lotId" in updates ? { lotId: updates.lotId } : {}),
      }),
      "แก้ไขตะกร้าไม่สำเร็จ",
    );
  }, [enqueue]);

  const clearCart = useCallback(() => {
    setItems([]);
    void enqueue(() => deleteCartLine(), "ล้างตะกร้าไม่สำเร็จ");
  }, [enqueue]);

  const getItemQty = useCallback((itemId: string) =>
    items.filter((i) => i.itemId === itemId).reduce((s, i) => s + i.quantity, 0),
  [items]);

  return (
    <CartContext value={{ items, addItem, removeItem, updateItem, clearCart, itemCount: items.length, getItemQty, refresh }}>
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
  subItems: { id: string; subCode: string; condition?: string | null }[];
}

export type AddToCartResult =
  | { ok: true; cartItem: CartItem }
  | { ok: false; reason: "no-sub" | "no-stock" };

/** The row shape /api/dispense/items returns, as far as the cart cares. */
export interface DispenseSearchItem {
  id: string;
  code: string;
  name: string;
  imageUrl: string | null;
  availableQty: number;
  trackIndividually: boolean;
  issueUnit: { name: string };
  category: { name: string; profile: { dispenseType: "CONSUMABLE" | "COUNT" | "ITEM" } };
  lots: { id: string; lotNumber: string; expiryDate: string | null; remainingQty: number }[];
  subItems: { id: string; subCode: string; condition: string | null }[];
  location: { building: string; floor: string; room: string; detail: string | null } | null;
}

/** Flatten a search row into the shape buildCartItem wants. Shared so every screen that fills
 *  the cart — the เบิก grid, ชุดประกอบ — starts from the same lots and the same location. */
export function toDispenseableItem(item: DispenseSearchItem): DispenseableItem {
  return {
    id: item.id,
    code: item.code,
    name: item.name,
    imageUrl: item.imageUrl,
    categoryName: item.category.name,
    dispenseType: item.category.profile.dispenseType,
    trackIndividually: item.trackIndividually,
    issueUnit: item.issueUnit.name,
    availableQty: item.availableQty,
    location: item.location
      ? { building: item.location.building, floor: item.location.floor, room: item.location.room, detail: item.location.detail }
      : null,
    lots: item.lots.map((l) => ({ id: l.id, lotNumber: l.lotNumber, expiryDate: l.expiryDate, remainingQty: l.remainingQty })),
    subItems: item.subItems.map((s) => ({ id: s.id, subCode: s.subCode, condition: s.condition })),
  };
}

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
        subItems: item.subItems.map((s) => ({ id: s.id, subCode: s.subCode, condition: s.condition ?? null })),
      },
    };
  }

  // trackIndividually with no usable SubItem → never fall back to aggregate dispense
  // (would create a subItemId=null record with no identity — the 9/9 bug).
  if (item.trackIndividually) return { ok: false, reason: "no-sub" };

  if (item.availableQty <= 0) return { ok: false, reason: "no-stock" };

  return {
    ok: true,
    cartItem: {
      ...base,
      trackIndividually: false,
      subItemId: null,
      subCode: null,
      lots: [],
      subItems: [],
    },
  };
}
