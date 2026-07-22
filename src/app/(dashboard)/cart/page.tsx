"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { autoLotLabel, isAutoLot, lotDisplay } from "@/lib/lot-code";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCart, useCartLineActions } from "@/components/dispense/cart-context";
import { EditableQty } from "@/components/dispense/editable-qty";
import { Loader2, Minus, Plus, Trash2, ShoppingBasket, MapPin, Package, Repeat } from "lucide-react";
import { pic } from "@/lib/image";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { USAGE_TYPE_OPTIONS, locationLabel, effectiveCode, CONDITION_LABELS } from "@/lib/constants";
import { createDispense } from "@/lib/api";
import type { CartItem } from "@/lib/validators/dispense";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function ConfirmDispensePage() {
  const { items, clearCart } = useCart();
  const router = useRouter();
  const [usageType, setUsageType] = useState<string>("");
  const [usageNote, setUsageNote] = useState("");
  const [notes, setNotes] = useState("");
  const [recipient, setRecipient] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const today = new Date().toISOString().split("T")[0];

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
        notes: notes.trim() || null,
        recipient: recipient || null,
        dueAt: dueDate || null,
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

  // Split cart into consumable (ตัดสต็อกทันที) vs durable (ยืม/ตั้งในห้อง) sections.
  const consumables = items.filter((i) => i.dispenseType === "CONSUMABLE");
  const durables = items.filter((i) => i.dispenseType !== "CONSUMABLE");
  const hasDurable = durables.length > 0;

  // Inline validation — surfaced after the first submit attempt (error prevention, not recovery).
  const errors = {
    usageType: usageType ? null : "เลือกการใช้งาน",
    recipient: recipient.trim() ? null : "ระบุผู้รับ",
    ...(hasDurable ? { dueDate: dueDate ? null : "เลือกกำหนดคืน" } : {}),
  } as Record<string, string | null>;
  const canConfirm = Object.values(errors).every((v) => !v);

  // Validate first; focus the first invalid field so the user sees what's missing (no silent disable).
  const handleSubmit = () => {
    if (!canConfirm) {
      setShowErrors(true);
      const firstErrorKey = Object.keys(errors).find((k) => errors[k]);
      if (firstErrorKey) document.getElementById(firstErrorKey)?.focus();
      return;
    }
    void handleConfirm();
  };

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
        <Button variant="outline" size="lg" className="bg-white" onClick={() => router.push("/dispense")}>
          เพิ่มรายการ
        </Button>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col -mx-4 sm:-mx-6 min-h-0 h-full lg:h-[calc(100vh-5rem)] lg:-mb-6">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      {/* ── Items list (scrollable) ── */}
      <div className="flex-1 min-w-0 p-6 lg:min-h-0 lg:overflow-y-auto">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold">ตะกร้าของฉัน</h2>
          </div>
          <Button size="lg" className="bg-orange-500 text-white hover:bg-orange-600" onClick={() => router.push("/dispense")}>
            เพิ่มรายการ
          </Button>
        </div>
        <div className="space-y-6">
        {(["consumable", "durable"] as const).map((group) => {
          const list = group === "consumable" ? consumables : durables;
          if (list.length === 0) return null;
          return (
          <section key={group} className="space-y-3">
            <SectionHeader
              tone={group}
              icon={group === "consumable" ? <Package className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
              title={group === "consumable" ? "วัสดุสิ้นเปลือง" : "วัสดุคงทน / อื่นๆ (ต้องคืน)"}
              count={list.length}
              hint={group === "consumable" ? "จะถูกตัดออกจากสต็อกทันทีเมื่อยืนยันเบิก" : "ต้องนำกลับมาคืนตามกำหนดเวลา"}
            />
            {/* Desktop ≥md — shadcn Table (table-fixed → sticky header works, columns auto-align) */}
            <div className="hidden md:block rounded-lg border border-border bg-card overflow-x-auto">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-16 sticky top-0 z-10 rounded-tl-lg bg-card" />
                    <TableHead className="min-w-0 sticky top-0 z-10 bg-card text-xs font-medium text-muted-foreground">รายการ</TableHead>
                    <TableHead className="w-[120px] sticky top-0 z-10 bg-card text-xs font-medium text-muted-foreground">ประเภท</TableHead>
                    <TableHead className="w-[90px] sticky top-0 z-10 bg-card text-xs font-medium text-muted-foreground">สถานะ</TableHead>
                    <TableHead className="w-[240px] sticky top-0 z-10 bg-card text-right text-xs font-medium text-muted-foreground">{group === "durable" ? "ชิ้น" : ""}</TableHead>
                    <TableHead className="w-[150px] sticky top-0 z-10 bg-card text-right text-xs font-medium text-muted-foreground">จำนวน</TableHead>
                    <TableHead className="w-14 sticky top-0 z-10 rounded-tr-lg bg-card" />
                  </TableRow>
                </TableHeader>
                <TableBody className="[&_td]:py-4">
                  {list.map((item) => {
                    const key = `${item.itemId}-${item.lotId ?? ""}-${item.subItemId ?? ""}`;
                    const fullCode = effectiveCode(item.itemCode, item.subCode, item.subItems?.length ?? 0);
                    const hasSelector = (item.dispenseType === "CONSUMABLE" && (item.lots?.length ?? 0) > 0) || (item.trackIndividually && (item.subItems?.length ?? 0) > 0);
                    return (
                      <TableRow key={key}>
                        <TableCell><CartThumb item={item} /></TableCell>
                        <TableCell className="min-w-0">
                          <div className="min-w-0 py-0.5">
                            <span className="block font-mono text-xs text-muted-foreground">{fullCode}</span>
                            <span className="block truncate text-sm font-medium text-foreground leading-tight">{item.itemName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{item.categoryName}</span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {item.dispenseType === "CONSUMABLE" ? (
                            <span className="inline-flex items-center rounded-full bg-orange-500/15 px-2 py-0.5 text-xs font-medium text-orange-700">เบิก</span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">ยืม</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {group === "durable" && (
                            hasSelector ? (
                              <>
                                <CartLotChip item={item} variant="trigger" />
                                <CartSubChip item={item} variant="trigger" />
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            <CartQtyStepper item={item} />
                          </div>
                        </TableCell>
                        <TableCell className="pr-4"><div className="flex justify-end"><CartDelete item={item} /></div></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile <md — stacked 3 lines (table hidden) */}
            <div className="md:hidden rounded-xl border border-border bg-card overflow-hidden">
              {list.map((item, index) => {
                const key = `${item.itemId}-${item.lotId ?? ""}-${item.subItemId ?? ""}`;
                const stockNum = item.trackIndividually ? `${item.subItems?.length ?? 0}` : item.availableQty;
                const fullCode = effectiveCode(item.itemCode, item.subCode, item.subItems?.length ?? 0);
                return (
                  <div key={key} className={cn("px-3 py-2", index !== list.length - 1 && "border-b border-border")}>
                    <div className="flex items-center gap-2">
                      <CartThumb item={item} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.itemName}</span>
                      <CartDelete item={item} />
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 pl-10 text-xs text-muted-foreground">
                      <span className="font-mono">{fullCode}</span>
                      <span aria-hidden>·</span>
                      <span className="whitespace-nowrap">เหลือ {stockNum} {item.issueUnit}</span>
                      {item.location && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="inline-flex min-w-0 items-center gap-0.5">
                            <MapPin className="size-3 shrink-0" />
                            <span className="truncate">{locationLabel(item.location)}</span>
                          </span>
                        </>
                      )}
                      <CartLotChip item={item} />
                      <CartSubChip item={item} />
                    </div>
                    <div className="mt-1.5 flex justify-end">
                      <CartQtyStepper item={item} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          );
        })}
        </div>
      </div>

      </div>

      {/* ── Sticky footer ── */}
      <div className="shrink-0 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <div className="text-sm">
            <p className="text-xs text-muted-foreground">รวมทั้งหมด</p>
            <p className="font-semibold">{items.length} รายการ · {totalQty} ชิ้น</p>
            <p className="hidden text-xs text-muted-foreground sm:block">
              <span className="text-success font-medium">{consumables.length}</span> สิ้นเปลือง ·{" "}
              <span className="text-info-500 font-medium">{durables.length}</span> ต้องคืน
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" disabled={submitting} onClick={() => setClearDialogOpen(true)}>
              ล้าง
            </Button>
            <Button type="button" disabled={submitting} onClick={() => { setShowErrors(false); setFormDialogOpen(true); }}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              เบิก-ยืมพัสดุ
            </Button>
          </div>
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

      {/* ── Dispense form dialog (form entry + final checkpoint merged) ── */}
      <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
        <DialogContent showCloseButton={false} className="max-w-[calc(100%-2rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>ข้อมูลการเบิก-ยืม</DialogTitle>
            <DialogDescription>กรอกข้อมูลก่อนยืนยัน — กดยืนยันแล้วจะตัดสต็อกทันที</DialogDescription>
            <p className="text-xs text-muted-foreground">
              <span className="text-success font-medium">สิ้นเปลือง {consumables.length}</span>
              {" · "}
              <span className="text-warning font-medium">ต้องคืน {durables.length}</span>
            </p>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                handleSubmit();
              }
            }}
          >
            <fieldset disabled={submitting} className="m-0 min-w-0 space-y-4 border-0">
              {showErrors && !canConfirm && (
                <p role="status" aria-live="polite" className="text-xs text-destructive">
                  กรุณากรอกข้อมูลให้ครบ {Object.values(errors).filter(Boolean).length} ช่อง
                </p>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="usageType" id="usageType-label" className="text-xs text-muted-foreground" required>ใช้ใน</Label>
                <Select value={usageType} onValueChange={(v) => v !== null && setUsageType(v)}>
                  <SelectTrigger id="usageType" aria-labelledby="usageType-label" aria-required="true" aria-invalid={showErrors && !!errors.usageType} aria-describedby={showErrors && errors.usageType ? "usageType-error" : undefined} className="text-sm">
                    <SelectValue placeholder="เลือกการใช้งาน">{USAGE_TYPE_OPTIONS.find((o) => o.value === usageType)?.label ?? "เลือกการใช้งาน"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {USAGE_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {showErrors && errors.usageType && <FieldError id="usageType-error">{errors.usageType}</FieldError>}
              </div>

              {usageType === "OTHER" && (
                <div className="space-y-1.5">
                  <Label htmlFor="usageNote" className="text-xs text-muted-foreground">ระบุการใช้งาน</Label>
                  <Input
                    id="usageNote"
                    placeholder="ระบุการใช้งาน..."
                    value={usageNote}
                    onChange={(e) => setUsageNote(e.target.value)}
                    className="text-sm"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="recipient" className="text-xs text-muted-foreground" required>ผู้รับ</Label>
                <Input
                  id="recipient"
                  required
                  aria-invalid={showErrors && !!errors.recipient}
                  aria-describedby={showErrors && errors.recipient ? "recipient-error" : undefined}
                  placeholder="ใครเอาไป เช่น ครูสมชาย / ห้อง ม.4/1"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="text-sm"
                />
                {showErrors && errors.recipient && <FieldError id="recipient-error">{errors.recipient}</FieldError>}
              </div>

              {hasDurable && (
                <div className="space-y-1.5">
                  <Label htmlFor="dueDate" className="text-xs text-muted-foreground" required>กำหนดคืน</Label>
                  <Input
                    id="dueDate"
                    type="date"
                    min={today}
                    required
                    aria-invalid={showErrors && !!errors.dueDate}
                    aria-describedby={showErrors && errors.dueDate ? "dueDate-error" : undefined}
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="text-sm"
                  />
                  {showErrors && errors.dueDate && <FieldError id="dueDate-error">{errors.dueDate}</FieldError>}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="notes" className="text-xs text-muted-foreground">หมายเหตุ</Label>
                <Textarea
                  id="notes"
                  placeholder="หมายเหตุ (optional)..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="text-sm"
                />
              </div>
            </fieldset>

            <p className="mt-4 mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              กดยืนยันแล้วจะตัดสต็อกทันที ไม่สามารถย้อนกลับได้ (หากเบิกผิด ใช้การคืนพัสดุ)
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFormDialogOpen(false)}>ยกเลิก</Button>
              <Button type="submit" variant="destructive" disabled={submitting}>
                {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                ยืนยันเบิก
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return <p id={id} role="alert" className="text-xs text-destructive">{children}</p>;
}

function SectionHeader({
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

/** Lot chip — Select (multi-lot) or static Badge (single lot); null when no lot.
 *  variant="trigger" = standard shadcn Select (desktop grid cell); "chip" = compact pill (mobile). */
function CartLotChip({ item, variant = "chip" }: { item: CartItem; variant?: "chip" | "trigger" }) {
  const { changeLot } = useCartLineActions();
  if (item.dispenseType !== "CONSUMABLE" || !item.lots || item.lots.length === 0) return null;
  if (item.lots.length <= 1 && item.lotNumber) {
    return <Badge variant="secondary" className={cn("shrink-0 rounded-full bg-muted px-2.5 text-xs text-muted-foreground", !isAutoLot(item.lotNumber) && "font-mono")}>{lotDisplay(item.lotNumber)}</Badge>;
  }
  const triggerCls = variant === "trigger"
    ? "w-full rounded-md font-medium text-foreground"
    : "shrink-0 rounded-full border-transparent bg-muted px-2.5 font-mono text-[11px] hover:bg-accent";
  return (
    <Select value={item.lotId ?? ""} onValueChange={(v) => changeLot(item, v)}>
      <SelectTrigger className={triggerCls}>
        <SelectValue>
          {(value: string | null) => {
            if (!value) return "เลือก Lot";
            const lot = item.lots?.find((l) => l.id === value);
            return lot ? <>{autoLotLabel(lot.lotNumber)}<span> · {lot.quantity}</span></> : value;
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {item.lots.map((lot) => (
          <SelectItem key={lot.id} value={lot.id} className={cn("text-xs", !isAutoLot(lot.lotNumber) && "font-mono")}>
            {autoLotLabel(lot.lotNumber)} — {lot.quantity} {item.issueUnit}
            {lot.expiryDate && ` (หมดอายุ: ${new Date(lot.expiryDate).toLocaleDateString()})`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Sub-item chip — Select (tracked items); null otherwise. Disables pieces already in cart.
 *  variant="trigger" = standard shadcn Select (desktop grid cell); "chip" = compact pill (mobile). */
function CartSubChip({ item, variant = "chip" }: { item: CartItem; variant?: "chip" | "trigger" }) {
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

/** Qty stepper pill — −/[editable qty]/+, clamps to stock for consumables.
 *  h-8, no internal divider, 28px buttons; centered in its grid cell, natural width on mobile. */
function CartQtyStepper({ item }: { item: CartItem }) {
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
function CartThumb({ item }: { item: CartItem }) {
  return (
    <div className="size-11 shrink-0 overflow-hidden rounded-md bg-muted">
      <img src={item.imageUrl ?? pic(item.itemCode, 128)} alt={item.itemName} loading="lazy" className="size-full object-cover" />
    </div>
  );
}

/** Delete button — always visible (desktop + mobile). */
function CartDelete({ item }: { item: CartItem }) {
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
