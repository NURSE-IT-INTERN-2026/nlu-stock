"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { fmtDate, TH_DATE } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ArrowDownUp, Loader2, MapPin, Pencil, Search, Send, Undo2, User, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { ItemThumb } from "@/components/shared/item-thumb";
import { cancelQtyDamage, getPendingRepairDamage, getSubItemsByStatus, sendQtyDamageToRepair, updateItemStatus, type PendingRepairDamage, type SubItemByStatus } from "@/lib/api";
import { effectiveCode, locationLabel } from "@/lib/constants";
import { MaintenanceFormDialog } from "@/components/items/maintenance-form-dialog";
import { FileUploadList } from "@/components/shared/file-upload";
import { AttachmentList } from "@/components/shared/attachment-list";
import { Pagination } from "@/components/shared/pagination";
import { useClientPage } from "@/hooks/use-client-page";
import { PAGE_SIZE } from "@/lib/pagination-constants";

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
const fmtDay = (iso: string) => fmtDate(iso, TH_DATE);
// "23 ก.ค. 2569 · 7 วัน" — the dialogs show the age spelled out; the table column shows the date
// alone and lets the sort do the comparing.
const sentAtLabel = (iso: string) => `${fmtDay(iso)} · ${daysSince(iso) === 0 ? "วันนี้" : `${daysSince(iso)} วัน`}`;

// [badge label, badge classes, bare label for label:value lists]
const VENUE_BADGE = {
  EXTERNAL: ["ส่งซ่อมภายนอก", "bg-purple-500/10 text-purple-700 dark:text-purple-300", "ภายนอก"],
  INTERNAL: ["ส่งซ่อมภายใน", "bg-sky-500/10 text-sky-700 dark:text-sky-300", "ภายใน"],
  NONE: ["ไม่ระบุที่ซ่อม", "bg-muted text-muted-foreground", "ไม่ระบุ"],
} as const;

// ภายใน / ภายนอก toggle — shared by send-to-repair and the edit-repair-details dialog.
function VenuePicker({ value, onChange }: { value: "INTERNAL" | "EXTERNAL" | ""; onChange: (v: "INTERNAL" | "EXTERNAL") => void }) {
  return (
    <div className="flex gap-2">
      {([["INTERNAL", "ภายใน"], ["EXTERNAL", "ภายนอก"]] as const).map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={
            "flex-1 rounded-lg border px-3 py-2 text-sm transition-colors " +
            (value === v
              ? "border-primary bg-primary/10 text-primary font-medium"
              : "border-border bg-card text-muted-foreground hover:text-foreground")
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// The two stages a repair job sits in while it is still open — the shape of the DATA.
export type RepairStage = "DAMAGED" | "UNDER_REPAIR";

// What a row is WAITING FOR — the shape the worklist is read in, and what its badge says.
// ส่งซ่อมภายใน and ส่งซ่อมภายนอก are the same status but not the same job: the first is work
// someone here still has to do, the second is a parcel to chase. Splitting them costs nothing —
// the venue is already on the trip — and it is the split the person working the queue makes
// anyway. ไม่ระบุที่ซ่อม falls in with กำลังซ่อม: unknown venue is still ours until told otherwise.
type Bucket = "DAMAGED" | "IN_SHOP" | "AWAITING";

const BUCKET_META = {
  DAMAGED: { label: "รอส่งซ่อม", cls: "bg-warning/10 text-warning-700 dark:text-warning-200" },
  IN_SHOP: { label: "กำลังซ่อม", cls: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  AWAITING: { label: "รอรับคืน", cls: "bg-muted text-muted-foreground" },
} as const satisfies Record<Bucket, { label: string; cls: string }>;

// Sort order, รอส่งซ่อม first: it is the only bucket where the next move is ours and nothing is
// in motion. It is the whole reason the list is not a plain date sort.
const BUCKET_ORDER: Bucket[] = ["DAMAGED", "IN_SHOP", "AWAITING"];

const bucketOf = (stage: RepairStage, venue: "INTERNAL" | "EXTERNAL" | null): Bucket =>
  stage === "DAMAGED" ? "DAMAGED" : venue === "EXTERNAL" ? "AWAITING" : "IN_SHOP";

function BucketBadge({ bucket }: { bucket: Bucket }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", BUCKET_META[bucket].cls)}>
      {BUCKET_META[bucket].label}
    </span>
  );
}

/**
 * One open repair job, whatever it is made of.
 *
 * A tracked piece walks SubItem.status; a batch of qty stock walks a StockAdjustment booking.
 * They are stored nothing alike and they are the same job to the person holding the broken
 * thing, so the worklist normalises both into this before anything is rendered — one row shape,
 * one set of dialogs, one place where "which API closes this" is decided.
 */
type WorkRow = {
  key: string;
  kind: "sub" | "qty";
  /** subItemId for a piece, adjustmentId for a qty booking — what the write endpoints take. */
  id: string;
  stage: RepairStage;
  bucket: Bucket;
  itemId: string;
  code: string;
  name: string;
  imageUrl: string | null;
  qty: number;
  unit: string;
  place: string | null;
  damageNote: string | null;
  repairNote: string | null;
  repairVenue: "INTERNAL" | "EXTERNAL" | null;
  /** วันที่แจ้งชำรุด on a DAMAGED row, วันที่ส่งซ่อม once it is out. Same column, same question:
   *  how long has this been sitting there. */
  at: string | null;
  by: string | null;
  cycleMonths: number;
  /** Where new หลักฐาน is appended, or null when the job has no record to hang files on. */
  attachTo: { recordType: "ItemStatusLog" | "StockAdjustment"; recordId: string } | null;
  evidenceUrls: string[];
};

const fromSub = (row: SubItemByStatus, stage: RepairStage): WorkRow => ({
  key: `s${row.id}`,
  kind: "sub",
  id: row.id,
  stage,
  bucket: bucketOf(stage, row.repairVenue),
  itemId: row.item.id,
  code: effectiveCode(row.item.code, row.subCode, row.item._count.subItems),
  name: row.item.name,
  imageUrl: row.item.imageUrl,
  qty: 1,
  unit: row.item.issueUnit.name,
  // Prefer the piece's own location; fall back to the spec's location when unset.
  place: (row.location ?? row.item.location) && locationLabel(row.location ?? row.item.location!),
  damageNote: row.damageNote,
  repairNote: row.repairNote,
  repairVenue: row.repairVenue,
  at: row.repairSentAt,
  by: row.by,
  cycleMonths: row.item.maintenanceCycleMonths,
  attachTo: row.evidenceLogId ? { recordType: "ItemStatusLog", recordId: row.evidenceLogId } : null,
  evidenceUrls: row.evidenceUrls,
});

const fromQty = (row: PendingRepairDamage, stage: RepairStage): WorkRow => ({
  key: `q${row.id}`,
  kind: "qty",
  id: row.id,
  stage,
  bucket: bucketOf(stage, row.repairVenue),
  itemId: row.item.id,
  code: row.item.code,
  name: row.item.name,
  imageUrl: row.item.imageUrl,
  qty: row.qty,
  unit: row.item.issueUnit.name,
  place: row.item.location && locationLabel(row.item.location),
  // A qty booking keeps its symptom in `notes` — there is no sub_items row to stamp it on.
  damageNote: row.notes,
  repairNote: row.repairNote,
  repairVenue: row.repairVenue,
  at: row.repairSentAt ?? row.adjustedAt,
  by: row.by,
  cycleMonths: row.item.maintenanceCycleMonths,
  // The booking itself owns its files — it exists from แจ้งชำรุด onwards, so there is always
  // somewhere to put them.
  attachTo: { recordType: "StockAdjustment", recordId: row.id },
  evidenceUrls: row.imageEvidenceUrls,
});

/** Which dialog is open, and on which rows. `send` takes 1 row or a bulk selection. */
type Action =
  | { type: "send"; rows: WorkRow[] }
  | { type: "edit" | "cancel" | "receive"; rows: [WorkRow] }
  | null;

// Generic worklist for open repair jobs in a fixed stage (DAMAGED = reported broken, awaiting a
// send-to-repair decision; UNDER_REPAIR = at the shop) or "ALL" for the combined ค้างซ่อม queue.
// DAMAGED → UNDER_REPAIR (ส่งซ่อม), UNDER_REPAIR → AVAILABLE (รับคืน, through the maintenance form
// so ผล and ค่าใช้จ่าย land in maintenance_records).
//
// IN_USE used to be handled here too, which is exactly what hid COUNT stock: sub_items has no
// row for a non-tracked item. คืนเข้าคลัง now uses InUsePanel (records, not statuses) so both
// kinds show up. Don't add IN_USE back.
//
// The repair lifecycle has the same blind spot, so the panel pulls a second list: the open
// แจ้งชำรุด bookings of qty stock (/api/repairs), which have no sub_items row to hold a status.
// Both kinds are folded into WorkRow before anything is drawn, so qty walks ชำรุด → ส่งซ่อม →
// รับคืน like a piece does and neither renderer has to know which it is looking at.
export function SubItemStatusPanel({
  status,
  emptyText,
  onCount,
}: {
  /** One stage, or "ALL" for the combined งานซ่อมที่ค้าง worklist. */
  status: RepairStage | "ALL";
  emptyText: string;
  onCount?: (n: number) => void;
}) {
  const [rows, setRows] = useState<WorkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [oldestFirst, setOldestFirst] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<Action>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // Every row carries the stage it came from — the merged worklist has no other way to tell a
    // piece waiting to be sent from one already at the shop, and the buttons differ.
    const stages: RepairStage[] = status === "ALL" ? ["DAMAGED", "UNDER_REPAIR"] : [status];
    try {
      const per = await Promise.all(
        stages.map(async (st) => {
          const [subs, qty] = await Promise.all([
            getSubItemsByStatus(st),
            getPendingRepairDamage(st === "DAMAGED" ? "damaged" : "repair"),
          ]);
          return [...subs.subItems.map((r) => fromSub(r, st)), ...qty.rows.map((r) => fromQty(r, st))];
        }),
      );
      setRows(per.flat());
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
      setSelected(new Set());
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  // The tab badge upstream counts open jobs, so it reports the whole list, not the search hit
  // count — a filter typed into the box must not make the badge say the backlog shrank.
  useEffect(() => {
    onCount?.(rows.length);
  }, [rows.length, onCount]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    const hit = (r: WorkRow) =>
      !q ||
      r.name.toLowerCase().includes(q) ||
      r.code.toLowerCase().includes(q) ||
      (r.place?.toLowerCase().includes(q) ?? false) ||
      (r.damageNote?.toLowerCase().includes(q) ?? false);
    return rows
      .filter(hit)
      .sort(
        (a, b) =>
          BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket) ||
          (oldestFirst ? (a.at ?? "").localeCompare(b.at ?? "") : (b.at ?? "").localeCompare(a.at ?? "")),
      );
  }, [rows, q, oldestFirst]);

  const { page, setPage, paged, total: pageTotal } = useClientPage(visible, PAGE_SIZE.DEFAULT, `${q}${oldestFirst}`);

  // Only a รอส่งซ่อม row has a bulk step: ส่งซ่อม is the one action in this flow that asks the
  // same three answers of every row. รับคืน needs a per-item result and cost, so it never bulks.
  const bulkable = paged.filter((r) => r.stage === "DAMAGED");
  const picked = visible.filter((r) => selected.has(r.key));
  const allPickedOnPage = bulkable.length > 0 && bulkable.every((r) => selected.has(r.key));

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of bulkable) {
        if (allPickedOnPage) next.delete(r.key);
        else next.add(r.key);
      }
      return next;
    });

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
          {status === "DAMAGED" ? <Send className="h-6 w-6 text-muted-foreground" /> : <Wrench className="h-6 w-6 text-muted-foreground" />}
        </div>
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      </div>
    );
  }

  return (
    <Card className="flex flex-col max-h-full min-h-0 overflow-hidden">
      <CardContent className="flex flex-col flex-1 min-h-0 gap-3">
        <div className="shrink-0 flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ค้นหาชื่อพัสดุ / รหัส / สถานที่…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 pl-9 text-sm"
            />
          </div>
          <p className="ml-auto text-xs text-muted-foreground whitespace-nowrap">{visible.length} รายการ</p>
          {/* Disabled rather than hidden: the checkboxes are visible from the start, so a button
              that appears out of nowhere the moment one is ticked reads as a different screen. */}
          <Button size="sm" className="h-9" disabled={picked.length === 0} onClick={() => setAction({ type: "send", rows: picked })}>
            <Send className="size-3.5" />
            ส่งซ่อมที่เลือก{picked.length > 0 && ` (${picked.length})`}
          </Button>
        </div>

        <Separator className="shrink-0" />

        {visible.length === 0 ? (
          <p className="flex-1 text-center text-sm text-muted-foreground py-10">ไม่พบรายการที่ค้นหา</p>
        ) : (
          <>
            {/* Desktop: the queue is read by comparing rows — how long has this been out, how
                many are waiting on the same shop — and a card list makes every comparison a
                scroll. Mobile keeps the cards: eleven columns on a phone is a horizontal scroll
                nobody discovers. */}
            {/* overflow-auto alone both scrolls and clips the corners — pairing it with
                overflow-hidden on the same element is what breaks one or the other. */}
            <div className="hidden md:block flex-1 min-h-0 overflow-auto rounded-xl border">
              <Table grid zebra className="table-fixed">
                <TableHeader sticky>
                  <TableRow>
                    <TableHead className="w-10 px-2">
                      <Checkbox
                        checked={allPickedOnPage}
                        disabled={bulkable.length === 0}
                        onCheckedChange={toggleAll}
                        aria-label="เลือกทั้งหน้า"
                      />
                    </TableHead>
                    <TableHead className="w-14 px-2">รูป</TableHead>
                    <TableHead className="w-32 px-2">รหัสพัสดุ</TableHead>
                    {/* The only column with no width: table-fixed hands it whatever the others
                        leave, so the fixed ones have to stay honest or this collapses to nothing.
                        At 1440px with the sidebar open there is ~1100px to divide. */}
                    <TableHead className="px-2">ชื่อพัสดุ</TableHead>
                    <TableHead className="w-24 px-2">สถานะ</TableHead>
                    <TableHead className="w-32 px-2">ตำแหน่งจัดเก็บ</TableHead>
                    <TableHead className="w-40 px-2">อาการ / หมายเหตุ</TableHead>
                    <TableHead className="w-24 px-2">
                      <button
                        type="button"
                        onClick={() => setOldestFirst((v) => !v)}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        วันที่แจ้ง
                        <ArrowDownUp className="size-3" />
                      </button>
                    </TableHead>
                    <TableHead className="w-28 px-2">ผู้แจ้ง</TableHead>
                    <TableHead className="w-24 px-2">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((r) => (
                    <TableRow key={r.key} data-state={selected.has(r.key) ? "selected" : undefined}>
                      <TableCell className="px-2">
                        <Checkbox
                          checked={selected.has(r.key)}
                          disabled={r.stage !== "DAMAGED"}
                          onCheckedChange={() => toggle(r.key)}
                          aria-label={`เลือก ${r.name}`}
                        />
                      </TableCell>
                      <TableCell className="px-2">
                        <div className="size-9 overflow-hidden rounded-md bg-muted">
                          <ItemThumb src={r.imageUrl} alt={r.name} />
                        </div>
                      </TableCell>
                      <TableCell className="px-2 font-mono text-xs break-all">{r.code}</TableCell>
                      {/* Thai has no spaces, so a long ชื่อพัสดุ is one unbreakable "word" to the
                          browser: with table-fixed it ran straight over จำนวน and สถานะ. Three
                          utilities, none of them optional — whitespace-normal undoes the nowrap
                          every cell inherits from TableCell, break-words lets the wrap land
                          mid-word, and line-clamp caps the row at two lines. */}
                      <TableCell className="px-2 text-sm font-medium">
                        <p className="line-clamp-2 whitespace-normal break-words">
                          {r.name}
                          {/* A tracked piece is always 1, so a whole column of "1" bought nothing
                              and cost the name the room it needed. Only a qty booking says how many. */}
                          {r.qty > 1 && <span className="ml-1.5 rounded bg-muted px-1 text-xs tabular-nums text-muted-foreground">×{r.qty}</span>}
                        </p>
                      </TableCell>
                      <TableCell className="px-2"><BucketBadge bucket={r.bucket} /></TableCell>
                      <TableCell className="px-2 text-xs text-muted-foreground">
                        {r.place ? (
                          <span className="flex items-start gap-1">
                            <MapPin className="size-3 mt-0.5 shrink-0 text-primary/80" />
                            <span className="min-w-0 line-clamp-2 whitespace-normal break-words">{r.place}</span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      {/* อาการ is why the job exists and the repair note only says where it went,
                          so both share a cell with the symptom leading. */}
                      <TableCell className="px-2 text-xs">
                        <p className="line-clamp-2 whitespace-normal break-words">{r.damageNote || <span className="text-muted-foreground">—</span>}</p>
                        {r.repairNote && <p className="line-clamp-1 whitespace-normal break-all text-muted-foreground">{r.repairNote}</p>}
                      </TableCell>
                      <TableCell className="px-2 text-xs tabular-nums">{r.at ? fmtDay(r.at) : "—"}</TableCell>
                      <TableCell className="px-2 text-xs text-muted-foreground">
                        <p className="truncate">{r.by ?? "—"}</p>
                      </TableCell>
                      <TableCell className="px-2">
                        <div className="flex items-center gap-1">
                          <RowActions row={r} onAct={setAction} iconOnly />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="md:hidden flex-1 min-h-0 overflow-y-auto divide-y divide-border">
              {paged.map((r) => (
                <div key={r.key} className="flex gap-3 py-3">
                  <Checkbox
                    className="mt-1 shrink-0"
                    checked={selected.has(r.key)}
                    disabled={r.stage !== "DAMAGED"}
                    onCheckedChange={() => toggle(r.key)}
                    aria-label={`เลือก ${r.name}`}
                  />
                  <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                    <ItemThumb src={r.imageUrl} alt={r.name} />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-start gap-2">
                      <p className="min-w-0 flex-1 text-sm font-semibold leading-snug break-words">{r.name}</p>
                      <span className="shrink-0 rounded-md bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">×{r.qty}</span>
                    </div>
                    <p className="font-mono text-xs text-muted-foreground break-all">{r.code}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <BucketBadge bucket={r.bucket} />
                      {r.place && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          <MapPin className="size-3 text-primary/80" />
                          {r.place}
                        </span>
                      )}
                    </div>
                    {r.damageNote && <p className="text-sm break-words">{r.damageNote}</p>}
                    {r.repairNote && <p className="text-xs text-muted-foreground break-words">{r.repairNote}</p>}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {r.at && <span className="tabular-nums">{fmtDay(r.at)}</span>}
                      {r.by && (
                        <span className="inline-flex items-center gap-1">
                          <User className="size-3" />
                          {r.by}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <RowActions row={r} onAct={setAction} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* -mx-4 กิน px-4 ของ CardContent คืน ให้เส้น border-t พาดเต็มการ์ด */}
        {visible.length > 0 && (
          <div className="shrink-0 -mx-4">
            <Pagination page={page} total={pageTotal} pageSize={PAGE_SIZE.DEFAULT} onChange={setPage} />
          </div>
        )}
      </CardContent>

      {/* One set of dialogs for the whole list, not one per row: they were duplicated across the
          tracked and qty renderers, which is what made a table impossible — a <tr> cannot hold
          an <AlertDialog>'s trigger tree the way a <Card> could. */}
      <RepairDialogs action={action} onClose={() => setAction(null)} onDone={load} />
    </Card>
  );
}

/** ยกเลิกชำรุด / ส่งซ่อม on a รอส่งซ่อม row; แก้ข้อมูลส่งซ่อม / รับคืน once it is out. Two either way. */
function RowActions({ row, onAct, iconOnly }: { row: WorkRow; onAct: (a: Action) => void; iconOnly?: boolean }) {
  const isDamaged = row.stage === "DAMAGED";
  const [secondary, primary] = isDamaged
    ? ([
        { type: "cancel", label: "ยกเลิกชำรุด", Icon: Undo2 },
        { type: "send", label: "ส่งซ่อม", Icon: Send },
      ] as const)
    : ([
        { type: "edit", label: "แก้ข้อมูลส่งซ่อม", Icon: Pencil },
        { type: "receive", label: "รับคืนจากส่งซ่อม", Icon: Wrench },
      ] as const);

  return (
    <>
      {[secondary, primary].map(({ type, label, Icon }, i) => (
        <Button
          key={type}
          size={iconOnly ? "icon" : "sm"}
          variant={i === 0 ? "outline" : "default"}
          className={iconOnly ? "size-8" : "h-9 flex-1"}
          title={label}
          aria-label={label}
          onClick={() => onAct({ type, rows: [row] } as Action)}
        >
          <Icon className="size-3.5" />
          {!iconOnly && label}
        </Button>
      ))}
    </>
  );
}

/**
 * Every write the worklist can make, in one place.
 *
 * ส่งซ่อม, แก้ข้อมูลส่งซ่อม and ยกเลิกชำรุด all ask a piece and a qty booking the same questions;
 * only the endpoint at the end differs, so the branch lives in `apply` and nowhere else. ส่งซ่อม
 * is the one that takes a selection: the venue and the shop note are the same answer for all of
 * them, which is exactly why it is worth bulking and why รับคืน (a per-item result and cost) is not.
 */
function RepairDialogs({ action, onClose, onDone }: { action: Action; onClose: () => void; onDone: () => void }) {
  const [venue, setVenue] = useState<"INTERNAL" | "EXTERNAL" | "">("");
  const [repairNote, setRepairNote] = useState("");
  const [damage, setDamage] = useState("");
  const [note, setNote] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  // ปุ่มบันทึกต้องปิดระหว่างอัปโหลด — FileUploadList push URL เข้า onChange หลัง putFile เสร็จ
  // กดทันก่อนหน้านั้นจะบันทึกไปด้วยรายการไฟล์ว่าง แล้วหลักฐานหายเงียบๆ ทั้งที่เลือกไฟล์แล้ว
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const rows = action?.rows ?? [];
  const one = rows.length === 1 ? rows[0] : null;
  const type = action?.type;

  // Editing, not re-entering: a correction to the venue must not mean retyping the whole note,
  // and on ส่งซ่อม the symptom is already on record from แจ้งชำรุด (rarely the same day) — an
  // empty box there quietly overwrote it. Bulk starts blank: there is no single row to read from.
  useEffect(() => {
    if (!action) return;
    setVenue(one?.repairVenue ?? "");
    setRepairNote(one?.repairNote ?? "");
    setDamage(one?.damageNote ?? "");
    setNote("");
    setPhotoUrls(one?.evidenceUrls ?? []);
  }, [action, one]);

  if (!action || !type) return null;

  const label = one ? `${one.name}${one.qty > 1 ? ` ${one.qty} ${one.unit}` : ""}` : `${rows.length} รายการ`;

  const apply = async (fn: (r: WorkRow) => Promise<unknown>, successMsg: string) => {
    setSaving(true);
    const results = await Promise.allSettled(rows.map(fn));
    setSaving(false);
    const failed = results.filter((r) => r.status === "rejected").length;
    // Partial success is the normal outcome of a bulk write, so it gets counted, not swallowed:
    // reporting "ส่งซ่อมเรียบร้อย" after three of ten went through is how rows go missing.
    if (failed === rows.length) {
      const first = results[0];
      toast.error(first?.status === "rejected" && first.reason instanceof Error ? first.reason.message : "บันทึกไม่สำเร็จ");
    } else if (failed > 0) {
      toast.warning(`${successMsg} ${rows.length - failed} รายการ · ไม่สำเร็จ ${failed} รายการ`);
    } else {
      toast.success(successMsg);
    }
    onClose();
    onDone();
  };

  const send = () =>
    apply((r) => {
      // A row that already carries its own symptom keeps it — the shared box is a fill-in for
      // the ones that never got one, not an overwrite of what the reporter wrote.
      const sym = r.damageNote?.trim() || damage.trim();
      return r.kind === "sub"
        ? updateItemStatus(r.itemId, {
            newStatus: "UNDER_REPAIR",
            subItemId: r.id,
            notes: sym,
            // Only when the files have nowhere else to live: otherwise AttachmentList already
            // wrote them onto the แจ้งชำรุด row, and repeating them here stores the same photo
            // twice under two dates.
            imageUrls: !r.attachTo ? photoUrls : undefined,
            repairVenue: venue || undefined,
            repairNote: repairNote.trim(),
            // The ส่งซ่อม note IS the symptom this trip is about — stamp it on the row so later
            // edits have something to correct instead of reading it back out of `reason`.
            damageNote: sym,
          })
        : sendQtyDamageToRepair({
            adjustmentId: r.id,
            venue: venue as "INTERNAL" | "EXTERNAL",
            repairNote: repairNote.trim(),
            damageNote: sym || undefined,
          });
    }, "ส่งซ่อมเรียบร้อย");

  // Still ส่งซ่อม, only the repair details change (ซ่อมภายในไม่ได้ → ส่งภายนอกต่อ). Writes a fresh
  // UNDER_REPAIR → UNDER_REPAIR row so the trail shows both trips, not just the last.
  const edit = () =>
    apply((r) =>
      r.kind === "sub"
        ? updateItemStatus(r.itemId, {
            newStatus: "UNDER_REPAIR",
            subItemId: r.id,
            notes: `แก้ข้อมูลการส่งซ่อม${repairNote.trim() ? ` · ${repairNote.trim()}` : ""}`,
            repairVenue: venue || undefined,
            repairNote: repairNote.trim(),
            damageNote: damage.trim() || undefined,
          })
        : sendQtyDamageToRepair({
            adjustmentId: r.id,
            venue: venue as "INTERNAL" | "EXTERNAL",
            repairNote: repairNote.trim(),
            damageNote: damage.trim() || undefined,
          }),
    "แก้ข้อมูลการส่งซ่อมแล้ว");

  // The piece turned out not to be broken, so the ชำรุด report is withdrawn and the stock goes
  // straight back on the shelf.
  const cancel = () =>
    apply((r) =>
      r.kind === "sub"
        ? updateItemStatus(r.itemId, { newStatus: "AVAILABLE", subItemId: r.id, notes: `ยกเลิกคำขอชำรุด · ${note.trim()}` })
        : cancelQtyDamage({ adjustmentId: r.id, note: note.trim() }),
    "ยกเลิกคำขอชำรุดแล้ว");

  // รับคืนจากส่งซ่อม — the full maintenance form, so ผล and ค่าใช้จ่าย are logged. One row only.
  if (type === "receive" && one) {
    return (
      <MaintenanceFormDialog
        open
        onOpenChange={(v) => !v && onClose()}
        itemId={one.itemId}
        itemLabel={one.name}
        {...(one.kind === "sub"
          ? { subItemId: one.id, subItemLabel: one.code }
          : { adjustmentId: one.id, subItemLabel: `${one.qty} ${one.unit}`, subItemLabelTitle: "จำนวน" })}
        maintenanceCycleMonths={one.cycleMonths}
        fromRepair
        repairInfo={{
          damage: one.damageNote,
          venue: VENUE_BADGE[one.repairVenue ?? "NONE"][2],
          note: one.repairNote,
          sentAt: one.at && sentAtLabel(one.at),
        }}
        onSuccess={() => {
          onClose();
          onDone();
        }}
      />
    );
  }

  if (type === "cancel") {
    return (
      <AlertDialog open onOpenChange={(v) => !v && onClose()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยกเลิกคำขอชำรุด</AlertDialogTitle>
            <AlertDialogDescription>
              คืน <span className="font-medium text-foreground">{label}</span> กลับเป็น &ldquo;พร้อมใช้งาน&rdquo; — ใช้เมื่อแจ้งชำรุดผิดหรือตรวจแล้วของไม่ได้เสีย
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* Direct child of AlertDialogContent (not Header) so the separator's -mx-4 reaches
              both dialog edges (Header is a centered grid → clips). */}
          <div className="w-full space-y-3 text-left">
            <div className="-mx-4"><Separator /></div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground" required>เหตุผลที่ยกเลิก</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="เช่น ตรวจแล้วใช้งานได้ปกติ แจ้งผิดชิ้น…"
                rows={2}
                className="bg-card"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>ปิด</AlertDialogCancel>
            <AlertDialogAction disabled={saving || !note.trim()} onClick={cancel}>
              {saving && <Loader2 className="size-3.5 animate-spin" />}ยืนยันยกเลิก
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  // ส่งซ่อม and แก้ข้อมูลส่งซ่อม collect the same three answers in the same order — one dialog,
  // two headings. The symptom is required on a single row (there is exactly one to describe) and
  // optional in bulk, where it only fills the gaps left by rows that never got one.
  const missingSymptom = rows.filter((r) => !r.damageNote?.trim()).length;
  const symptomRequired = type === "edit" || !!one || missingSymptom > 0;
  const ok = !!venue && !!repairNote.trim() && (!symptomRequired || !!damage.trim());

  return (
    <AlertDialog open onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{type === "edit" ? "แก้ข้อมูลการส่งซ่อม" : "ยืนยันการส่งซ่อม"}</AlertDialogTitle>
          <AlertDialogDescription>
            {type === "edit" ? (
              <>
                <span className="font-medium text-foreground">{label}</span> ยังอยู่ระหว่างส่งซ่อมเหมือนเดิม — แก้เฉพาะข้อมูลการส่งซ่อม ระบบจะบันทึกเป็นประวัติเพิ่ม ไม่ทับของเดิม
              </>
            ) : (
              <>
                ส่ง <span className="font-medium text-foreground">{label}</span> ไปซ่อม เมื่อซ่อมเสร็จ กรุณากด &ldquo;รับคืนจากส่งซ่อม&rdquo; ที่หน้าซ่อมแซม
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="w-full space-y-3 text-left">
          <div className="-mx-4"><Separator /></div>

          {/* When the trip started is a fact, not an edit — the rest of the dialog is. */}
          {type === "edit" && (
            <dl className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm">
              <div className="flex gap-2">
                <dt className="shrink-0 text-muted-foreground">วันที่ส่งซ่อม:</dt>
                <dd className="min-w-0 text-foreground">{(one?.at && sentAtLabel(one.at)) || "—"}</dd>
              </div>
            </dl>
          )}

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground" required={symptomRequired}>
              {one || type === "edit" ? "อาการที่ชำรุด" : `อาการที่ชำรุด (ใช้กับ ${missingSymptom} รายการที่ยังไม่ได้ระบุ)`}
            </Label>
            <Textarea
              value={damage}
              onChange={(e) => setDamage(e.target.value)}
              placeholder="เช่น จอแตก ปุ่มหลุด สายชาร์จขาด…"
              rows={2}
              className="bg-card"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground" required>รายละเอียดการส่งซ่อม</Label>
            <Textarea
              value={repairNote}
              onChange={(e) => setRepairNote(e.target.value)}
              placeholder={type === "edit" ? "เช่น ซ่อมภายในไม่ได้ ส่งต่อร้าน ABC…" : "เช่น ส่งซ่อมร้าน ABC…"}
              rows={2}
              className="bg-card"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground" required>ส่งซ่อมที่</Label>
            <VenuePicker value={venue} onChange={setVenue} />
          </div>

          {/* Attachments belong to one job's record, so bulk skips them: there is no single pile
              to append to, and copying the same photo onto N rows is a lie about N pieces. */}
          {one && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">หลักฐานแนบ</Label>
              {one.attachTo ? (
                // Writes onto the record the moment a file lands, not when the dialog is confirmed
                // — the record already exists (แจ้งชำรุด created it), and a picker that holds files
                // until submit is what made these photos unfixable afterwards.
                <AttachmentList urls={photoUrls} target={one.attachTo} canEdit onChange={setPhotoUrls} />
              ) : (
                // No record to hang them on (data old enough to predate the log) — the ส่งซ่อม row
                // this confirm writes becomes the record instead.
                <FileUploadList value={photoUrls} onChange={setPhotoUrls} label="แนบรูป/เอกสาร" onUploadingChange={setUploading} />
              )}
            </div>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
          <AlertDialogAction disabled={saving || uploading || !ok} onClick={type === "edit" ? edit : send}>
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            {type === "edit" ? "บันทึก" : "ยืนยัน"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
