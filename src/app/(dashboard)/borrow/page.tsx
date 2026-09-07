"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ShoppingBasket, MapPin, Package, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DIALOG_SHELL, DIALOG_BODY, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCart } from "@/components/dispense/cart-context";
import { CartDelete, CartQtyStepper, CartSubChip, CartThumb, SectionHeader } from "@/components/dispense/cart-line";
import {
  SelfBorrowFields, emptySelfBorrowForm, selfBorrowErrors, selfBorrowUsagePayload,
  type SelfBorrowForm,
} from "@/components/dispense/self-borrow-fields";
import { selfBorrow } from "@/lib/api";
import { effectiveCode, locationLabel } from "@/lib/constants";
import { fmtDate, TH_DATETIME } from "@/lib/format";
import { selfBorrowDueAt } from "@/lib/self-borrow";

// ยืนยันการเบิก-ยืมของ BORROWER — the counterpart to /cart, which is the staff form and is
// blocked for this role by middleware. Same shape as /cart on purpose (grouped list, sticky
// footer, form-in-a-dialog) so anyone who has seen one screen can use the other; the rows
// themselves come from components/dispense/cart-line so the two cannot drift.
//
// What is NOT here is the whole reason it is a separate page: ผู้รับ, ชุดเบิกซ้ำ, ตั้งใช้ในห้อง
// and การเลือกล็อต/ชิ้น are bookkeeping about someone else's loan, and here the borrower IS the
// recipient. The เพดานต่อครั้ง is not re-checked either — the grid caps what can be added and
// /api/borrow is the enforcer, which refuses the basket as a whole.
export default function BorrowConfirmPage() {
  const { items, clearCart } = useCart();
  const router = useRouter();
  const [form, setForm] = useState<SelfBorrowForm>(emptySelfBorrowForm);
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [formDialogOpen, setFormDialogOpen] = useState(false);

  const consumables = items.filter((i) => i.dispenseType === "CONSUMABLE");
  const durables = items.filter((i) => i.dispenseType !== "CONSUMABLE");
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  // ตะกร้าที่มีแต่ของสิ้นเปลือง = เบิกใช้ล้วน ไม่มีกำหนดคืน. ผสมกัน → ยังต้องถามกำหนดคืน เพราะมี
  // อย่างน้อยหนึ่งบรรทัดที่ต้องเอามาคืน (API ตั้ง dueAt ให้เฉพาะบรรทัดที่ต้องคืน).
  const hasDurable = durables.length > 0;
  const verb = hasDurable ? "ยืม" : "เบิก";

  const errors = selfBorrowErrors(form);
  const canConfirm = Object.values(errors).every((v) => !v);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await selfBorrow({
        lines: items.map((i) => ({ itemId: i.itemId, subItemId: i.subItemId, quantity: i.quantity })),
        ...selfBorrowUsagePayload(form),
        ...(hasDurable ? { days: form.days } : {}),
      });
      toast.success(
        hasDurable
          ? `ยืมสำเร็จ · คืนภายใน ${fmtDate(selfBorrowDueAt(form.days), TH_DATETIME)}`
          : "เบิกสำเร็จ",
      );
      clearCart();
      setFormDialogOpen(false);
      router.push("/dispense");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `${verb}ไม่สำเร็จ`);
    } finally {
      setSubmitting(false);
    }
  };

  // Validate first, then focus what is missing — no silently dead confirm button.
  const handleSubmit = () => {
    if (!canConfirm) {
      setShowErrors(true);
      const firstError = Object.keys(errors).find((k) => errors[k]);
      if (firstError) document.getElementById(`borrow-${firstError === "courseCode" ? "course" : firstError === "usageType" ? "usage" : "activity"}`)?.focus();
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
          <p className="text-sm text-muted-foreground mt-1">เลือกพัสดุจากหน้าเบิก-ยืมพัสดุก่อน</p>
        </div>
        <Button variant="outline" size="lg" onClick={() => router.push("/dispense")}>
          เลือกพัสดุ
        </Button>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col -mx-4 sm:-mx-6 min-h-0 h-full lg:h-[calc(100vh-5rem)] lg:-mb-6">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        {/* ── Items list (scrollable) ── */}
        <div className="flex-1 min-w-0 p-6 lg:min-h-0 lg:overflow-y-auto">
          <div className="mb-4 flex items-start justify-between gap-2">
            <h2 className="text-xl font-semibold">ตะกร้าของฉัน</h2>
            <Button onClick={() => router.push("/dispense")}>เลือกเพิ่ม</Button>
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
                    title={group === "consumable" ? "เบิกใช้ (ไม่ต้องคืน)" : "ยืม (ต้องนำมาคืน)"}
                    count={list.length}
                    hint={group === "consumable" ? "ตัดออกจากสต็อกทันทีเมื่อยืนยัน" : "นำมาคืนที่งานพัสดุตามกำหนด"}
                  />

                  {/* Desktop ≥md */}
                  <div className="hidden md:block rounded-lg border border-border bg-card overflow-x-auto">
                    <Table grid zebra className="table-fixed">
                      <TableHeader sticky>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-16 rounded-tl-lg" />
                          <TableHead className="min-w-0">รายการ</TableHead>
                          <TableHead className="w-[140px]">ประเภท</TableHead>
                          <TableHead className="w-[220px] text-right">{group === "durable" ? "ชิ้น" : ""}</TableHead>
                          <TableHead className="w-[150px] text-right">จำนวน</TableHead>
                          <TableHead className="w-14 rounded-tr-lg" />
                        </TableRow>
                      </TableHeader>
                      <TableBody className="[&_td]:py-4">
                        {list.map((item) => {
                          const key = `${item.itemId}-${item.lotId ?? ""}-${item.subItemId ?? ""}`;
                          const fullCode = effectiveCode(item.itemCode, item.subCode, item.subItems?.length ?? 0);
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
                                <span className="inline-flex max-w-full items-center truncate rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{item.categoryName}</span>
                              </TableCell>
                              {/* หน้ารายการหยิบชิ้นแรกที่ว่างมาให้ ซึ่งเดาแทนคนที่เดินไปหยิบไม่ได้ —
                                  เปลี่ยนชิ้นได้ที่นี่ กติกาเดียวกับตะกร้าเจ้าหน้าที่. ล็อตไม่มีให้เลือก:
                                  สิ้นเปลืองตัดล็อตใกล้หมดอายุก่อนเสมอ (FEFO) ไม่ใช่เรื่องที่คนยืมเลือก. */}
                              <TableCell>
                                {group === "durable" && (
                                  item.trackIndividually && (item.subItems?.length ?? 0) > 0
                                    ? <CartSubChip item={item} variant="trigger" />
                                    : <span className="text-xs text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex justify-end"><CartQtyStepper item={item} /></div>
                              </TableCell>
                              <TableCell className="pr-4"><div className="flex justify-end"><CartDelete item={item} /></div></TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile <md — stacked rows */}
                  <div className="md:hidden rounded-xl border border-border bg-card overflow-hidden">
                    {list.map((item, index) => {
                      const key = `${item.itemId}-${item.lotId ?? ""}-${item.subItemId ?? ""}`;
                      const stockNum = item.trackIndividually ? item.subItems?.length ?? 0 : item.availableQty;
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
              <span className="text-success font-medium">{consumables.length}</span> เบิกใช้ ·{" "}
              <span className="text-info-500 font-medium">{durables.length}</span> ต้องคืน
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" disabled={submitting} onClick={() => setClearDialogOpen(true)}>
              ล้าง
            </Button>
            <Button type="button" disabled={submitting} onClick={() => { setShowErrors(false); setFormDialogOpen(true); }}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {verb}พัสดุ
            </Button>
          </div>
        </div>
      </div>

      {/* ── Clear all dialog ── */}
      <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <DialogContent showCloseButton={false} className="max-w-[calc(100%-2rem)] sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>ล้างตะกร้า</DialogTitle>
            <DialogDescription>ต้องการลบพัสดุในตะกร้าทั้งหมดหรือไม่?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearDialogOpen(false)}>ยกเลิก</Button>
            <Button variant="destructive" onClick={() => { clearCart(); setClearDialogOpen(false); }}>
              ล้างทั้งหมด
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Borrow form dialog (form entry + final checkpoint merged, same as /cart) ── */}
      <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
        {/* Fixed height, not fit: usageType swaps whole blocks in and out (รายวิชา, กิจกรรม,
            กำหนดคืน) while the dialog is open, and without the lock the confirm button ends
            up off-screen with nothing to scroll. */}
        <DialogContent showCloseButton={false} className={cn(DIALOG_SHELL, "max-w-[calc(100%-2rem)] sm:max-w-lg")}>
          <DialogHeader className="shrink-0">
            <DialogTitle>ข้อมูลการ{verb}</DialogTitle>
            <DialogDescription>กรอกข้อมูลก่อนยืนยัน — กดยืนยันแล้วจะตัดสต็อกทันที</DialogDescription>
            <p className="text-xs text-muted-foreground">
              <span className="text-success font-medium">เบิกใช้ {consumables.length}</span>
              {" · "}
              <span className="text-warning font-medium">ต้องคืน {durables.length}</span>
            </p>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                handleSubmit();
              }
            }}
          >
            <div className={cn(DIALOG_BODY, "px-1")}>
              <fieldset disabled={submitting} className="m-0 min-w-0 space-y-4 border-0">
                {showErrors && !canConfirm && (
                  <p role="status" aria-live="polite" className="text-xs text-destructive">
                    กรุณากรอกข้อมูลให้ครบ {Object.values(errors).filter(Boolean).length} ช่อง
                  </p>
                )}
                <SelfBorrowFields value={form} onChange={setForm} showErrors={showErrors} showDue={hasDurable} />
                <p className="text-xs text-muted-foreground">
                  กดยืนยันแล้วระบบจะตัดสต็อกทันที
                  {hasDurable && " · นำของมาคืนที่งานพัสดุ เจ้าหน้าที่เป็นผู้ปิดรายการให้"}
                </p>
              </fieldset>
            </div>
            <DialogFooter className="shrink-0">
              <Button type="button" variant="outline" disabled={submitting} onClick={() => setFormDialogOpen(false)}>
                ยกเลิก
              </Button>
              {/* Not disabled on invalid: a dead button says nothing about which field is
                  missing. Submitting turns the messages on instead. */}
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                ยืนยันการ{verb}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
