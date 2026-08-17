"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Boxes, Check, ClipboardCheck, Plus, ShoppingCart, Trash2, Wrench, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DIALOG_SHELL, DIALOG_SHELL_FIT, DIALOG_BODY, Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { NumericInput } from "@/components/shared/numeric-input";
import { StepComponents } from "@/components/shared/create-kit-modal/step-components";
import type { ComponentRow } from "@/components/shared/create-kit-modal/types";
import { STATUS_LABELS, type ItemStatus } from "@/lib/constants";
import { useCart, buildCartItem, toDispenseableItem, type DispenseSearchItem } from "@/components/dispense/cart-context";
import {
  assembleKit, cancelKitSet, confirmKitSetChecked, fetchKit, fetchKitSet, updateKitBom,
  type KitComponent, type KitDetail, type KitSetContents,
} from "@/lib/api";

/**
 * ชุดประกอบ tab for a KIT item — the recipe and the sets built from it. A KIT Item never
 * holds stock of its own: every row under "ชุดที่ประกอบไว้" is one physical set, and a set
 * is permanent. It is borrowed, returned and borrowed again; only ยกเลิกชุด ends one.
 *
 * The tab's real job is the รอตรวจ gate. The system never counts the consumables in a box —
 * the recipe says ชิ้น and the stock says กล่อง, and nothing converts between them — so it
 * tracks the one thing it can know for certain: whether the set has been used since a human
 * last confirmed it was complete. Until someone presses ยืนยัน, the set cannot be lent.
 */

const KIND_LABEL: Record<string, string> = {
  TRACKED: "รายชิ้น",
  COUNT: "คงทน",
  CONSUMABLE: "สิ้นเปลือง",
};

export function KitSetsPanel({ itemId, canAct, onChanged }: { itemId: string; canAct: boolean; onChanged: () => void }) {
  const [data, setData] = useState<KitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [assembleOpen, setAssembleOpen] = useState(false);
  const [bomOpen, setBomOpen] = useState(false);
  const [checkSetId, setCheckSetId] = useState<string | null>(null);
  const [cancelSetId, setCancelSetId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await fetchKit(itemId)); } catch { setData(null); }
    setLoading(false);
  }, [itemId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { const d = await fetchKit(itemId); if (!cancelled) setData(d); } catch { if (!cancelled) setData(null); }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [itemId]);

  const refresh = () => { load(); onChanged(); };

  if (loading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (!data) return <p className="text-sm text-muted-foreground">โหลดข้อมูลชุดไม่สำเร็จ</p>;

  const liveSets = data.sets;
  const pendingCount = liveSets.filter((s) => s.needsCheck).length;

  return (
    <div className="space-y-5">
      {/* ── สูตร ── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">ส่วนประกอบต่อ 1 ชุด ({data.components.length})</h3>
            <p className="text-xs text-muted-foreground">
              สต๊อกตอนนี้ประกอบได้อีก {data.maxSets} ชุด · ของสิ้นเปลืองไม่นับ ต้องเบิกใส่เอง
            </p>
          </div>
          {canAct && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setBomOpen(true)}>
                <Wrench className="size-3.5" />แก้ส่วนประกอบ
              </Button>
              <Button size="sm" disabled={data.maxSets < 1 || data.components.length === 0} onClick={() => setAssembleOpen(true)}>
                <Plus className="size-3.5" />ประกอบชุด
              </Button>
            </div>
          )}
        </div>

        {/* The recipe counts in its own unit; assemble subtracts that number straight off the
            item's stock, so a คงทน line in a smaller unit than the item is stocked in would
            cut boxes instead of pieces. Assemble refuses — say which line, here, up front. */}
        {data.unitMismatches.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
            <span className="text-muted-foreground">
              <span className="font-medium text-destructive">หน่วยในสูตรไม่ตรงกับหน่วยจ่าย</span> — ประกอบชุดไม่ได้จนกว่าจะแก้:{" "}
              {data.unitMismatches.map((m) => `${m.name} (สูตร ${m.bomUnitName}, คลัง ${m.unitName})`).join(" · ")}
            </span>
          </div>
        )}

        {data.unlinked.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
            <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground">รายการจากเอกสาร ({data.unlinked.length})</span> — ชื่อที่ import มาจาก Excel
              ไว้ดูว่าชุดนี้ควรมีอะไรบ้าง ระบบไม่ตัดสต๊อกให้: {data.unlinked.map((u) => `${u.name} ${u.quantity} ${u.unit.name}`).join(" · ")}
            </span>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border bg-card">
          {/* Desktop: table. Mobile: one stacked card per component — five fixed columns
              squeeze ชื่อ down to nothing under ~600px. */}
          <Table grid zebra className="hidden table-fixed md:table">
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-32 px-2">รหัส</TableHead>
                <TableHead className="px-2">ชื่อ</TableHead>
                <TableHead className="w-24 px-2">ประเภท</TableHead>
                <TableHead className="w-28 px-2">คงเหลือ</TableHead>
                <TableHead className="w-28 px-2 text-right">จำนวน/ชุด</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.components.map((c) => (
                <TableRow key={c.itemId}>
                  <TableCell className="px-2 font-mono text-xs text-muted-foreground"><span className="block truncate">{c.code}</span></TableCell>
                  <TableCell className="px-2 font-medium"><span className="min-w-0 truncate">{c.name}</span></TableCell>
                  <TableCell className="px-2"><Badge variant="outline" className="text-[10px]">{KIND_LABEL[c.kind]}</Badge></TableCell>
                  <TableCell className="px-2 text-muted-foreground">
                    {/* A consumable's stock is never compared against the recipe: the two count
                        in different units, so "ไม่พอ" would be a guess dressed up as a fact. */}
                    <span className={cn(c.kind !== "CONSUMABLE" && c.availableQty < c.perSet && "font-medium text-destructive")}>
                      {c.availableQty} {c.unitName}
                    </span>
                  </TableCell>
                  <TableCell className="px-2 text-right tabular-nums">{c.perSet} <span className="text-muted-foreground">{c.bomUnitName}</span></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="divide-y md:hidden">
            {data.components.map((c) => (
              <div key={c.itemId} className="flex items-start gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{c.code}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-[10px]">{KIND_LABEL[c.kind]}</Badge>
                    <span>คงเหลือ <span className={cn("tabular-nums", c.kind !== "CONSUMABLE" && c.availableQty < c.perSet && "font-medium text-destructive")}>{c.availableQty}</span> {c.unitName}</span>
                  </p>
                </div>
                <span className="shrink-0 text-right text-sm tabular-nums">
                  {c.perSet} <span className="text-muted-foreground">{c.bomUnitName}</span>
                  <span className="block text-[10px] text-muted-foreground">ต่อชุด</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ชุดที่ประกอบไว้ ── */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">ชุดที่ประกอบไว้ ({liveSets.length})</h3>
          <p className="text-xs text-muted-foreground">
            ชุดอยู่ถาวร — ยืมแล้วคืนแล้วยืมใหม่ได้ ทุกครั้งที่คืนจะขึ้น <span className="font-medium text-warning-700 dark:text-warning-200">รอตรวจ</span> ให้เปิดกล่องดูแล้วกดยืนยันก่อนปล่อยยืมรอบหน้า
            {pendingCount > 0 && ` · ตอนนี้รอตรวจ ${pendingCount} ชุด`}
          </p>
        </div>
        {liveSets.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-10 text-center">
            <Boxes className="size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">ยังไม่เคยประกอบชุดนี้</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table grid zebra className="hidden table-fixed md:table">
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-24 px-2">ชุดที่</TableHead>
                  <TableHead className="w-32 px-2">สถานะ</TableHead>
                  <TableHead className="px-2">ของรายชิ้นในชุด</TableHead>
                  <TableHead className="w-44 px-2" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {liveSets.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="px-2 font-mono text-xs">{s.subCode}</TableCell>
                    <TableCell className="px-2 text-xs"><SetStatus set={s} /></TableCell>
                    <TableCell className="px-2 text-xs text-muted-foreground">
                      {s.kitContents.length === 0 ? "—" : s.kitContents.map((k) => `${k.item.name} ${k.subCode}`).join(", ")}
                    </TableCell>
                    <TableCell className="px-2 text-right">
                      <SetActions
                        set={s} canAct={canAct}
                        onCheck={() => setCheckSetId(s.id)}
                        onCancel={() => setCancelSetId(s.id)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="divide-y md:hidden">
              {liveSets.map((s) => (
                <div key={s.id} className="space-y-1.5 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{s.subCode}</span>
                    <SetStatus set={s} />
                    <div className="ml-auto">
                      <SetActions
                        set={s} canAct={canAct}
                        onCheck={() => setCheckSetId(s.id)}
                        onCancel={() => setCancelSetId(s.id)}
                      />
                    </div>
                  </div>
                  <p className="text-xs break-words text-muted-foreground">
                    {s.kitContents.length === 0 ? "—" : s.kitContents.map((k) => `${k.item.name} ${k.subCode}`).join(", ")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <AssembleDialog open={assembleOpen} onOpenChange={setAssembleOpen} kit={data} onDone={refresh} />
      {bomOpen && <EditBomDialog onClose={() => setBomOpen(false)} kit={data} onDone={refresh} />}
      {checkSetId && <CheckSetDialog setId={checkSetId} onClose={() => setCheckSetId(null)} onDone={refresh} />}
      {cancelSetId && <CancelSetDialog setId={cancelSetId} onClose={() => setCancelSetId(null)} onDone={refresh} />}
    </div>
  );
}

type SetRow = KitDetail["sets"][number];

/** รอตรวจ beats the ItemStatus: the set really is AVAILABLE on the shelf, but that is not the
 *  answer to the question the row is asked, which is whether it can go out. */
function SetStatus({ set }: { set: SetRow }) {
  if (set.needsCheck) {
    return (
      <Badge variant="outline" className="border-warning/40 bg-warning/10 text-[10px] text-warning-700 dark:text-warning-200">
        รอตรวจ
      </Badge>
    );
  }
  return <span className="text-xs text-muted-foreground">{STATUS_LABELS[set.status as ItemStatus] ?? set.status}</span>;
}

function SetActions({ set, canAct, onCheck, onCancel }: { set: SetRow; canAct: boolean; onCheck: () => void; onCancel: () => void }) {
  if (!canAct || set.status === "ON_LOAN") return null;
  return (
    <div className="flex items-center justify-end gap-1">
      {set.needsCheck && (
        <Button size="sm" className="text-xs" onClick={onCheck}>
          <ClipboardCheck className="size-3.5" />ตรวจชุด
        </Button>
      )}
      <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={onCancel}>
        <Trash2 className="size-3.5" />ยกเลิกชุด
      </Button>
    </div>
  );
}

// ── ประกอบชุด ──
function AssembleDialog({ open, onOpenChange, kit, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; kit: KitDetail; onDone: () => void }) {
  const [sets, setSets] = useState(1);
  const [packed, setPacked] = useState(false);
  const [saving, setSaving] = useState(false);
  const tooMany = sets > kit.maxSets;

  const cut = kit.components.filter((c) => c.kind !== "CONSUMABLE");
  const consumables = kit.components.filter((c) => c.kind === "CONSUMABLE");

  const submit = async () => {
    setSaving(true);
    try {
      // ponytail: auto-pick only. The server chooses AVAILABLE copies of tracked components
      // in sub-code order and accepts explicit picks — a swap UI lands when staff ask for it.
      const res = await assembleKit(kit.kit.id, { sets });
      toast.success(`ประกอบ ${res.assembledQty} ชุดแล้ว`);
      onOpenChange(false);
      setSets(1);
      setPacked(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ประกอบชุดไม่สำเร็จ");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={DIALOG_SHELL}>
        <DialogTitle>ประกอบชุด {kit.kit.name}</DialogTitle>
        <DialogDescription>ตัดสต๊อกของคงทนทันที — ของสิ้นเปลืองต้องใส่เอง ระบบไม่ตัดให้</DialogDescription>
        <div className={cn(DIALOG_BODY, "space-y-4 py-2")}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Label htmlFor="assemble-sets">จำนวนชุด</Label>
            <NumericInput
              id="assemble-sets"
              value={sets}
              onCommit={setSets}
              min={1}
              className="h-9 w-20 rounded-md border bg-background text-center text-sm font-semibold tabular-nums"
            />
            <span className="text-xs text-muted-foreground">ประกอบได้สูงสุด {kit.maxSets} ชุด</span>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">ระบบจะตัดให้</p>
            <div className="space-y-1 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
              {cut.length === 0 && <p className="text-muted-foreground">ไม่มี — ชุดนี้มีแต่ของสิ้นเปลือง</p>}
              {cut.map((c) => (
                <div key={c.itemId} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate text-muted-foreground">{c.name}</span>
                  <span className={cn("shrink-0 tabular-nums", c.perSet * sets > c.availableQty ? "text-destructive" : "text-foreground")}>
                    −{c.perSet * sets} {c.unitName}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* The one thing a human has to answer. The system cannot tell whether the gauze went
              in — it does not know how many pieces a box holds — so this checkbox IS the check,
              the same act ตรวจชุด asks for after every return. */}
          {consumables.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground">ของสิ้นเปลือง — ใส่เองก่อนกดยืนยัน</p>
              <div className="space-y-1 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
                {consumables.map((c) => (
                  <div key={c.itemId} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate text-muted-foreground">{c.name}</span>
                    <span className="shrink-0 tabular-nums text-foreground">
                      {c.perSet} × {sets} = {c.perSet * sets} {c.bomUnitName}
                    </span>
                  </div>
                ))}
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={packed}
                  onChange={(e) => setPacked(e.target.checked)}
                  className="size-4 accent-primary"
                />
                ใส่ของสิ้นเปลืองลงชุดครบแล้ว
              </label>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button disabled={saving || sets < 1 || tooMany || (consumables.length > 0 && !packed)} onClick={submit}>
            {saving ? "กำลังประกอบ..." : `ประกอบ ${sets} ชุด`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── แก้ส่วนประกอบ ──
function EditBomDialog({ onClose, kit, onDone }: { onClose: () => void; kit: KitDetail; onDone: () => void }) {
  // Mounted only while open (see the caller), so the current BOM seeds the state once.
  const [rows, setRows] = useState<ComponentRow[]>(() =>
    kit.components.map((c) => ({
      componentItemId: c.itemId, code: c.code, name: c.name,
      availableQty: c.availableQty, unitName: c.unitName, quantity: c.perSet,
    })),
  );
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await updateKitBom(kit.kit.id, rows.map((r) => ({ componentItemId: r.componentItemId, quantity: r.quantity })));
      toast.success("บันทึกส่วนประกอบแล้ว");
      onClose();
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={cn(DIALOG_SHELL_FIT, "sm:max-w-2xl")}>
        <DialogTitle>แก้ส่วนประกอบ {kit.kit.name}</DialogTitle>
        <DialogDescription>ผูกรายการในสูตรกับพัสดุจริง แก้ได้ตลอด — ชุดที่ประกอบไปแล้วเทียบกับสูตรล่าสุดเสมอ</DialogDescription>
        <div className={cn(DIALOG_BODY, "py-2")}>
          <StepComponents
            components={rows}
            onAdd={(row) => setRows((s) => (s.some((c) => c.componentItemId === row.componentItemId) ? s : [...s, row]))}
            onRemove={(id) => setRows((s) => s.filter((c) => c.componentItemId !== id))}
            onQtyChange={(id, qty) => setRows((s) => s.map((c) => (c.componentItemId === id ? { ...c, quantity: qty } : c)))}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
          <Button disabled={saving || rows.length === 0} onClick={submit}>{saving ? "กำลังบันทึก..." : "บันทึก"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── ตรวจชุด ──
/**
 * Read-only on purpose. It lists what the box is supposed to hold and takes one confirmation;
 * it checks nothing, cuts nothing and fixes nothing. Anything actually missing or broken is
 * handled on the screens that already own those jobs — เบิก for stock, แจ้งชำรุด for damage —
 * and the admin comes back and presses ยืนยัน once the box is right. The only shortcut offered
 * is loading the consumables into the cart, because finding them one by one is the tedious part.
 */
function CheckSetDialog({ setId, onClose, onDone }: { setId: string; onClose: () => void; onDone: () => void }) {
  const [contents, setContents] = useState<KitSetContents | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const { addItem } = useCart();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    fetchKitSet(setId).then((c) => { if (!cancelled) setContents(c); }).catch(() => {});
    return () => { cancelled = true; };
  }, [setId]);

  const submit = async () => {
    setSaving(true);
    try {
      const res = await confirmKitSetChecked(setId, { note: note.trim() || undefined });
      toast.success(`ชุด ${res.setLabel} พร้อมให้ยืมแล้ว`);
      onClose();
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ยืนยันไม่สำเร็จ");
    }
    setSaving(false);
  };

  const label = contents ? `${contents.set.item.code}-${contents.set.subCode}` : "";

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={DIALOG_SHELL}>
        <DialogTitle>ตรวจชุด {label}</DialogTitle>
        <DialogDescription>เปิดกล่องเทียบกับรายการนี้ ถ้าของครบแล้วกดยืนยันเพื่อให้ยืมได้</DialogDescription>
        <div className={cn(DIALOG_BODY, "space-y-3 py-2")}>
          {!contents ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              <ExpectedContents contents={contents} />
              {contents.consumables.length > 0 && (
                <PrefillCartButton
                  consumables={contents.consumables}
                  onFilled={() => { onClose(); router.push("/cart"); }}
                  addItem={addItem}
                />
              )}
              <div>
                <Label htmlFor="check-note" className="text-xs">หมายเหตุ</Label>
                <Textarea id="check-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 bg-card" />
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>ปิด</Button>
          <Button disabled={saving || !contents} onClick={submit}>
            {saving ? "กำลังบันทึก..." : "ยืนยัน — ของครบ พร้อมยืม"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Load the kit's consumables into the เบิก cart, one line each at qty 1, and hand over to the
 * normal เบิก screen. Deliberately no quantity: the recipe counts ชิ้น while the item is
 * stocked in กล่อง, so any number this button filled in would be a guess. What it saves is
 * the search — the part that is actually tedious — and the person at the cart knows the rest.
 */
function PrefillCartButton({
  consumables, onFilled, addItem,
}: {
  consumables: KitComponent[];
  onFilled: () => void;
  addItem: ReturnType<typeof useCart>["addItem"];
}) {
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const ids = consumables.map((c) => c.itemId).join(",");
      const res = await fetch(`/api/dispense/items?ids=${encodeURIComponent(ids)}&perPage=100`);
      if (!res.ok) throw new Error("โหลดรายการไม่สำเร็จ");
      const { items } = (await res.json()) as { items: DispenseSearchItem[] };

      let added = 0;
      for (const item of items) {
        const built = buildCartItem(toDispenseableItem(item), new Set());
        if (built.ok) { addItem(built.cartItem); added++; }
      }
      if (added === 0) { toast.error("ของสิ้นเปลืองในชุดนี้ไม่มีสต๊อกเหลือ"); return; }
      toast.success(`ใส่ตะกร้าแล้ว ${added} รายการ — ใส่จำนวนที่หน้าเบิก`);
      onFilled();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ใส่ตะกร้าไม่สำเร็จ");
    }
    setLoading(false);
  };

  return (
    <Button variant="outline" size="sm" className="w-full" disabled={loading} onClick={run}>
      <ShoppingCart className="size-3.5" />
      {loading ? "กำลังใส่ตะกร้า..." : "ใส่ของสิ้นเปลืองลงตะกร้าเบิก"}
    </Button>
  );
}

// ── ยกเลิกชุด ──
function CancelSetDialog({ setId, onClose, onDone }: { setId: string; onClose: () => void; onDone: () => void }) {
  const [contents, setContents] = useState<KitSetContents | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchKitSet(setId).then((c) => { if (!cancelled) setContents(c); }).catch(() => {});
    return () => { cancelled = true; };
  }, [setId]);

  const submit = async () => {
    setSaving(true);
    try {
      const res = await cancelKitSet(setId, { note: note.trim() || undefined });
      toast.success(
        res.consumables.length
          ? `ยกเลิกชุด ${res.setLabel} แล้ว — ของสิ้นเปลืองที่ยังอยู่ในกล่องให้นำเข้าคลังเอง`
          : `ยกเลิกชุด ${res.setLabel} แล้ว`,
      );
      onClose();
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ยกเลิกชุดไม่สำเร็จ");
    }
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={DIALOG_SHELL}>
        <DialogTitle>ยกเลิกชุด{contents ? ` ${contents.set.item.code}-${contents.set.subCode}` : ""}</DialogTitle>
        <DialogDescription>
          ชุดนี้จะหายไปถาวร ของคงทนกลับเข้าคลัง — ใช้เมื่อเลิกใช้ชุดนี้แล้วเท่านั้น ไม่ใช่ขั้นตอนปกติของการคืน
        </DialogDescription>
        <div className={cn(DIALOG_BODY, "space-y-3 py-2")}>
          {!contents ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <>
              <ContentRows
                rows={[
                  ...contents.tracked.map((t) => ({ key: t.id, label: `${t.item.name} ${t.subCode}`, sub: t.item.code })),
                  ...contents.durables.map((d) => ({ key: d.itemId, label: d.name, sub: `${d.perSet} ${d.bomUnitName}` })),
                ]}
              />
              {contents.consumables.length > 0 && (
                <p className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-muted-foreground">
                  ของสิ้นเปลือง ({contents.consumables.map((c) => c.name).join(", ")}) ระบบไม่เคยตัดให้ จึงไม่คืนกลับ — ที่ยังอยู่ในกล่องให้นำเข้าคลังเอง
                </p>
              )}
              <div>
                <Label htmlFor="cancel-note" className="text-xs">หมายเหตุ</Label>
                <Textarea id="cancel-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 bg-card" />
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>ปิด</Button>
          <Button variant="destructive" disabled={saving || !contents} onClick={submit}>
            {saving ? "กำลังยกเลิก..." : "ยืนยันยกเลิกชุด"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** What the box should hold: the tracked pieces it actually has, the slots it is short of, and
 *  the qty lines from the recipe. Consumables carry no "remaining" — nobody counted them. */
function ExpectedContents({ contents }: { contents: KitSetContents }) {
  return (
    <div className="space-y-2">
      <ContentRows
        rows={[
          ...contents.tracked.map((t) => ({ key: t.id, label: `${t.item.name} ${t.subCode}`, sub: t.item.code })),
          ...contents.durables.map((d) => ({ key: d.itemId, label: d.name, sub: `${d.perSet} ${d.bomUnitName}` })),
          ...contents.consumables.map((c) => ({ key: c.itemId, label: c.name, sub: `${c.perSet} ${c.bomUnitName}` })),
        ]}
      />
      {contents.missingTracked.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
          <span className="text-muted-foreground">
            <span className="font-medium text-destructive">ขาดของรายชิ้น</span> — {contents.missingTracked.map((m) => `${m.name} ${m.missing}`).join(" · ")}
            {" "}(ถูกแจ้งชำรุดหรือย้ายออกไป) ใส่ชิ้นใหม่โดยประกอบชุดใหม่ หรือยืนยันไปก่อนถ้ายอมรับได้
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * The checklist shown on the รับคืน screen. Receiving a set does NOT open it: the box comes
 * back whole and its contents are untouched, so this is here only to tell staff what should be
 * in it. The set lands รอตรวจ and someone opens it later, on the ชุดประกอบ tab.
 */
export function KitSetContentsPicker({ subItemId }: { subItemId: string }) {
  const [contents, setContents] = useState<KitSetContents | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchKitSet(subItemId).then((c) => { if (!cancelled) setContents(c); }).catch(() => {});
    return () => { cancelled = true; };
  }, [subItemId]);

  if (!contents) return <Skeleton className="h-16 w-full" />;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        ของในชุด — รับคืนทั้งกล่อง ไม่ต้องแกะ ชุดจะขึ้น <span className="font-medium">รอตรวจ</span> ให้ไปเปิดดูและกดยืนยันที่หน้าชุดก่อนปล่อยยืมรอบหน้า
      </p>
      <ContentRows
        rows={[
          ...contents.tracked.map((t) => ({ key: t.id, label: `${t.item.name} ${t.subCode}`, sub: t.item.code })),
          ...contents.durables.map((d) => ({ key: d.itemId, label: d.name, sub: `${d.perSet} ${d.bomUnitName}` })),
        ]}
      />
      {contents.consumables.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          ของสิ้นเปลือง ({contents.consumables.map((c) => c.name).join(", ")}) ไม่ต้องคืน — ที่เหลือให้นำเข้าคลังเอง
        </p>
      )}
    </div>
  );
}

function ContentRows({ rows }: { rows: { key: string; label: string; sub: string }[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">ไม่มีรายการ</p>;
  return (
    <div className="divide-y rounded-lg border bg-card">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-3 px-3 py-2">
          <Check className="size-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-foreground">{r.label}</p>
            <p className="text-xs text-muted-foreground">{r.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
