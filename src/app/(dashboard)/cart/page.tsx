"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCart, useCartLineActions } from "@/components/dispense/cart-context";
import { EditableQty } from "@/components/dispense/editable-qty";
import { Loader2, Minus, Plus, Trash2, ShoppingBasket, ArrowLeft, MapPin } from "lucide-react";
import { pic } from "@/lib/image";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { USAGE_TYPE_OPTIONS, locationLabel, formatSubCode, CONDITION_LABELS } from "@/lib/constants";
import { createDispense } from "@/lib/api";
import { AnimatePresence, motion } from "motion/react";

export default function ConfirmDispensePage() {
  const { items, removeItem, updateItem, clearCart } = useCart();
  const router = useRouter();
  const [usageType, setUsageType] = useState<string>("");
  const [usageNote, setUsageNote] = useState("");
  const [notes, setNotes] = useState("");
  const [recipient, setRecipient] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loanType, setLoanType] = useState<"BORROW" | "INUSE">("BORROW");
  const [submitting, setSubmitting] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const hasTracked = items.some((i) => i.trackIndividually); // loanType only affects per-piece items
  const inRoom = loanType === "INUSE";

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
        })),
        usageType: usageType || null,
        usageNote: usageType === "OTHER" ? usageNote || null : null,
        notes: notes || null,
        recipient: recipient || null,
        dueAt: dueDate || null,
        loanType,
      });
      toast.success(`เบิกพัสดุสำเร็จ ${data.count} รายการ`);
      clearCart();
      router.push("/dispense");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "เบิกพัสดุไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  const { adjustQty, changeLot, changeSubItem } = useCartLineActions();

  const isConsumable = (item: typeof items[number]) =>
    item.dispenseType === "CONSUMABLE";

  // Empty state
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4 animate-fade-in">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
          <ShoppingBasket className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="text-center">
          <p className="text-lg font-medium">ตะกร้าว่าง</p>
          <p className="text-sm text-muted-foreground mt-1">เพิ่มพัสดุจากหน้าเบิก-ยืมพัสดุก่อน</p>
        </div>
        <Button variant="outline" onClick={() => router.push("/dispense")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          กลับหน้าเบิก
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col -mx-4 sm:-mx-6 min-h-0 h-full lg:h-[calc(100vh-5rem)] lg:-mb-6">
      {/* ── Items list (scrollable) ── */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold">ตะกร้าอุปกรณ์</h2>
            <p className="text-sm text-muted-foreground">ตรวจสอบรายการ ปรับจำนวน และเลือก lot ก่อนยืนยันการเบิก</p>
          </div>
          <Button size="lg" className="h-11" onClick={() => router.push("/dispense")}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            กลับหน้าเบิก-ยืมพัสดุ
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <AnimatePresence>
        {items.map((item, index) => {
          const key = `${item.itemId}-${item.lotId ?? ""}-${item.subItemId ?? ""}`;
          return (
            <motion.article
            key={key}
            layout
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1, transition: { duration: 0.2, ease: "easeOut", delay: Math.min(index * 0.05, 0.3) } }}
            exit={{ opacity: 0, scale: 0.9, height: 0, transition: { duration: 0.2, ease: "easeOut" } }}
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_0_rgba(0,0,0,0.02),0_8px_24px_-12px_rgba(15,23,42,0.08)] transition-shadow hover:shadow-[0_1px_0_rgba(0,0,0,0.02),0_12px_28px_-12px_rgba(15,23,42,0.14)]"
          >
              {/* Delete */}
              <button
                aria-label="ลบ"
                className="absolute right-3 top-3 z-10 grid size-7 place-items-center rounded-md text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive transition-colors active:scale-90"
                onClick={() => removeItem(item.itemId, item.lotId, item.subItemId)}
              >
                <Trash2 className="size-4" />
              </button>

              {/* ── Top: image + body ── */}
              <div className="flex gap-4 p-4">
                {/* Thumbnail */}
                <div className="relative size-32 shrink-0 overflow-hidden rounded-xl bg-muted">
                  <img src={item.imageUrl ?? pic(item.itemCode, 256)} alt={item.itemName} loading="lazy" className="size-full object-cover" />
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
                      คงเหลือ
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
                </div>
              </div>

              {/* ── Footer: lot/sub-item + qty ── */}
              <div className="mt-auto grid grid-cols-[1fr_auto] items-center gap-2 border-t border-border bg-muted/30 px-3 py-2.5">
                {/* Dropdowns */}
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  {/* Lot picker */}
                  {isConsumable(item) && item.lots && item.lots.length > 1 && (
                    <Select value={item.lotId ?? ""} onValueChange={(v) => changeLot(item, v)}>
                      <SelectTrigger className="h-9 w-full justify-between rounded-lg border-border bg-card font-mono text-xs">
                        <SelectValue>
                          {(value: string | null) => {
                            if (!value) return "เลือก Lot";
                            const lot = item.lots?.find((l) => l.id === value);
                            return lot ? `${lot.lotNumber} — ${lot.quantity}` : value;
                          }}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {item.lots.map((lot) => (
                          <SelectItem key={lot.id} value={lot.id} className="font-mono text-xs">
                            {lot.lotNumber} — {lot.quantity} {item.issueUnit}
                            {lot.expiryDate && ` (หมดอายุ: ${new Date(lot.expiryDate).toLocaleDateString()})`}
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
                      <SelectTrigger className="h-9 w-full justify-between rounded-lg border-border bg-card font-mono text-xs">
                        <SelectValue>
                          {(value: string | null) => {
                            if (!value) return "เลือกชิ้น";
                            const sub = item.subItems?.find((s) => s.id === value);
                            if (!sub) return value;
                            const cond = sub.condition ? ` (${CONDITION_LABELS[sub.condition] ?? sub.condition})` : "";
                            return `${formatSubCode(item.itemCode, sub.subCode)}${cond}`;
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
                              {formatSubCode(item.itemCode, sub.subCode)}
                              {sub.condition && ` (${CONDITION_LABELS[sub.condition] ?? sub.condition})`}
                              {inCart ? " (อยู่ในตะกร้า)" : ""}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Qty control */}
                <div
                  className="flex h-9 items-center rounded-lg border border-border bg-card"
                  onKeyDown={(e) => {
                    const t = e.target as HTMLElement;
                    if (t.tagName === "INPUT") return; // let EditableQty input handle its own keys
                    if (e.key === "ArrowUp" || e.key === "+" || e.key === "=") {
                      e.preventDefault();
                      if (!(!item.trackIndividually && item.quantity >= item.availableQty)) adjustQty(item, 1);
                    } else if (e.key === "ArrowDown" || e.key === "-") {
                      e.preventDefault();
                      if (item.quantity > 1) adjustQty(item, -1);
                    }
                  }}
                >
                  <button
                    aria-label="ลดจำนวน"
                    className="size-9 grid place-items-center rounded-l-lg rounded-r-none text-muted-foreground hover:text-foreground transition-colors active:scale-90 disabled:opacity-30"
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
                    aria-label="เพิ่มจำนวน"
                    className="size-9 grid place-items-center rounded-l-none rounded-r-lg text-muted-foreground hover:text-foreground transition-colors active:scale-90 disabled:opacity-30"
                    onClick={() => adjustQty(item, 1)}
                    disabled={!item.trackIndividually && item.quantity >= item.availableQty}
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
              </div>
            </motion.article>
          );
        })}
        </AnimatePresence>
        </div>
      </div>

      {/* ── Sticky footer ── */}
      <div className="shrink-0 border-t bg-card px-4 sm:px-6 py-3 sm:py-4 shadow-[0_-4px_16px_-8px_rgba(15,23,42,0.12)] flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex flex-col leading-tight basis-full sm:basis-auto">
          <span className="text-xs text-muted-foreground">รวมทั้งหมด</span>
          <span className="text-base font-semibold">{items.length} รายการ · {totalQty} ชิ้น</span>
        </div>
        <span className="hidden sm:block flex-1" />

        <div className="flex w-full sm:contents gap-2 sm:gap-3">
          <Button variant="ghost" className="h-11 flex-1 sm:flex-none text-muted-foreground" onClick={() => setClearDialogOpen(true)}>
            ล้างทั้งหมด
          </Button>
          <Button size="lg" className="h-11 flex-1 sm:flex-none px-6" disabled={submitting} onClick={() => setConfirmOpen(true)}>
            ยืนยันการเบิก
          </Button>
        </div>
      </div>

      {/* ── Clear all dialog ── */}
      <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <DialogContent showCloseButton={false} className="max-w-[calc(100%-2rem)] sm:max-w-[360px]">
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

      {/* ── Confirm dispense dialog ── */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>ยืนยันการเบิก</DialogTitle>
            <DialogDescription>ตรวจสอบรายการและระบุการใช้งานก่อนยืนยัน</DialogDescription>
          </DialogHeader>

          {/* Summary list */}
          <div className="max-h-[40vh] overflow-y-auto -mx-1 px-1">
            <ul className="space-y-1.5">
              {items.map((item) => {
                // CONSUMABLE → เบิกออก (consumed); tracked durable → ยืม/ใช้ในห้อง (loanType); COUNT → ยืม
                const tag = item.dispenseType === "CONSUMABLE"
                  ? { label: "เบิกออก", cls: "bg-muted text-muted-foreground" }
                  : item.trackIndividually && inRoom
                    ? { label: "ใช้ในห้อง", cls: "bg-indigo-500/15 text-indigo-500" }
                    : { label: "ยืม", cls: "bg-info-500/15 text-info-500" };
                return (
                  <li key={`${item.itemId}-${item.lotId ?? ""}-${item.subItemId ?? ""}`} className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-2">
                    <div className="size-9 shrink-0 overflow-hidden rounded-md bg-muted">
                      <img src={item.imageUrl ?? pic(item.itemCode, 128)} alt={item.itemName} className="size-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.itemName}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{item.itemCode}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{item.quantity} {item.issueUnit}</span>
                    <Badge variant="secondary" className={cn("shrink-0", tag.cls)}>
                      {tag.label}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* usageType + recipient + note */}
          <div className="space-y-2.5">
            {hasTracked && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">เบิกพัสดุติดตามรายชิ้น</Label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: "BORROW", label: "ยืม (มีกำหนดคืน)" },
                    { value: "INUSE", label: "ตั้งใช้ในห้อง" },
                  ] as const).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setLoanType(opt.value)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-sm transition-colors",
                        loanType === opt.value
                          ? "border-primary bg-primary/10 font-medium text-primary"
                          : "border-border bg-card text-muted-foreground hover:bg-muted/50"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">ใช้ใน <span className="text-destructive">*</span></Label>
              <Select value={usageType} onValueChange={(v) => v !== null && setUsageType(v)}>
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue placeholder="เลือกการใช้งาน" />
                </SelectTrigger>
                <SelectContent>
                  {USAGE_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {usageType === "OTHER" && (
              <Input
                placeholder="ระบุการใช้งาน..."
                value={usageNote}
                onChange={(e) => setUsageNote(e.target.value)}
                className="h-10 text-sm"
              />
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">ผู้รับ</Label>
              <Input
                placeholder="ใครเอาไป เช่น ครูสมชาย / ห้อง ม.4/1"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="h-10 text-sm"
              />
            </div>

            {!inRoom && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">กำหนดคืน <span className="text-muted-foreground/60">(optional)</span></Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">หมายเหตุ</Label>
              <Textarea
                placeholder="หมายเหตุ (optional)..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>ยกเลิก</Button>
            <Button disabled={!usageType || submitting} onClick={handleConfirm}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              ยืนยันเบิก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
