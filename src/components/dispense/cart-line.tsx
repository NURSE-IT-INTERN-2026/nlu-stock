"use client";

import type { ReactNode } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { ItemThumb } from "@/components/shared/item-thumb";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONDITION_LABELS, effectiveCode } from "@/lib/constants";
import { EditableQty } from "@/components/dispense/editable-qty";
import { useCart, useCartLineActions } from "@/components/dispense/cart-context";
import type { CartItem } from "@/lib/validators/dispense";

// The row furniture both confirm screens share: /cart (เจ้าหน้าที่) and /borrow (นศ./บุคลากร).
// The two pages ask different questions — ผู้รับ, ชุดเบิก, ล็อต and ตั้งใช้ในห้อง are staff-only —
// but a cart line is a cart line, and two copies of the stepper would be two chances for the
// เพดานจำนวน to disagree with itself.

export function SectionHeader({
  tone,
  icon,
  title,
  subtitle,
  count,
  hint,
}: {
  tone: "consumable" | "durable";
  icon: ReactNode;
  title: string;
  subtitle?: string;
  count: number;
  hint?: string;
}) {
  const chip =
    tone === "consumable"
      ? "bg-success/15 text-success"
      : "bg-info-500/15 text-info-500";
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="flex items-center gap-2.5">
        <span className={`inline-flex size-7 items-center justify-center rounded-md ${chip}`}>
          {icon}
        </span>
        <div>
          <h2 className="text-sm font-semibold leading-tight">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          {hint && <p className="text-xs text-muted-foreground/80">{hint}</p>}
        </div>
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{count} รายการ</span>
    </div>
  );
}

export function CartQtyStepper({ item }: { item: CartItem }) {
  const { adjustQty } = useCartLineActions();
  const { updateItem } = useCart();
  return (
    <div
      className="flex h-8 shrink-0 items-center justify-self-center overflow-hidden rounded-md border border-input bg-transparent dark:bg-input/30"
      onKeyDown={(e) => {
        const t = e.target as HTMLElement;
        if (t.tagName === "INPUT") return; // let EditableQty input handle its own keys
        if (e.key === "ArrowUp" || e.key === "+" || e.key === "=") {
          e.preventDefault();
          if (!item.trackIndividually && item.quantity < item.availableQty) adjustQty(item, 1);
        } else if (e.key === "ArrowDown" || e.key === "-") {
          e.preventDefault();
          if (item.quantity > 1) adjustQty(item, -1);
        }
      }}
    >
      <button
        type="button"
        aria-label="ลดจำนวน"
        className="grid size-8 place-items-center text-muted-foreground transition-colors hover:bg-muted active:scale-90 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
        onClick={() => adjustQty(item, -1)}
        disabled={item.quantity <= 1}
      >
        <Minus className="size-3.5" />
      </button>
      <EditableQty
        value={item.quantity}
        max={item.trackIndividually ? 1 : item.availableQty}
        unit={item.issueUnit}
        onChange={(v) => updateItem(item.itemId, { quantity: v }, item.lotId, item.subItemId)}
      />
      <button
        type="button"
        aria-label="เพิ่มจำนวน"
        className="grid size-8 place-items-center text-muted-foreground transition-colors hover:bg-muted active:scale-90 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
        onClick={() => adjustQty(item, 1)}
        disabled={item.trackIndividually ? true : item.quantity >= item.availableQty}
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

/** Thumbnail box — shared by desktop table cell + mobile row. */
export function CartThumb({ item }: { item: CartItem }) {
  return (
    <div className="size-11 shrink-0 overflow-hidden rounded-md bg-muted">
      <ItemThumb src={item.imageUrl} alt={item.itemName} />
    </div>
  );
}

/** Delete button — always visible (desktop + mobile). */
export function CartDelete({ item }: { item: CartItem }) {
  const { removeItem } = useCart();
  return (
    <button
      type="button"
      aria-label="ลบ"
      className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive active:scale-90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      onClick={() => removeItem(item.itemId, item.lotId, item.subItemId)}
    >
      <Trash2 className="size-4" />
    </button>
  );
}

/** ตัวเลือกชิ้น (C01/C02/…) ของพัสดุที่นับรายชิ้น — Select เมื่อมีหลายชิ้น, null เมื่อไม่ใช่ของนับรายชิ้น.
 *  ทั้งเจ้าหน้าที่และคนยืมต้องเปลี่ยนได้: หน้ารายการเลือกชิ้นแรกที่ว่างให้ ซึ่งไม่มีทางรู้ว่าคนที่เดินไป
 *  หยิบจะหยิบตัวไหนจากชั้น. variant="trigger" = Select เต็มช่อง (ตารางเดสก์ท็อป), "chip" = pill (มือถือ). */
export function CartSubChip({ item, variant = "chip" }: { item: CartItem; variant?: "chip" | "trigger" }) {
  const { changeSubItem } = useCartLineActions();
  const { items } = useCart();
  if (!item.trackIndividually || !item.subItems || item.subItems.length === 0) return null;
  const triggerCls = variant === "trigger"
    ? "w-full rounded-md font-medium text-foreground"
    : "shrink-0 rounded-full border-transparent bg-muted px-2.5 font-mono text-[11px] hover:bg-accent";
  return (
    <Select value={item.subItemId ?? ""} onValueChange={(v) => changeSubItem(item, v)}>
      <SelectTrigger className={triggerCls}>
        <SelectValue>
          {(value: string | null) => {
            if (!value) return "เลือกชิ้น";
            const sub = item.subItems?.find((s) => s.id === value);
            if (!sub) return value;
            const cond = sub.condition ? ` (${CONDITION_LABELS[sub.condition] ?? sub.condition})` : "";
            return <>{effectiveCode(item.itemCode, sub.subCode, item.subItems?.length ?? 0)}{cond}</>;
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {item.subItems.map((sub) => {
          const subInCart = items.some(
            (c) => c.itemId === item.itemId && c.subItemId === sub.id && (item.subItemId ?? null) !== sub.id
          );
          return (
            <SelectItem key={sub.id} value={sub.id} disabled={subInCart} className="font-mono text-xs">
              {effectiveCode(item.itemCode, sub.subCode, item.subItems?.length ?? 0)}
              {sub.condition && ` (${CONDITION_LABELS[sub.condition] ?? sub.condition})`}
              {subInCart ? " (อยู่ในตะกร้า)" : ""}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
