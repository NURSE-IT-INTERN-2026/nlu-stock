"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, MapPin, ChevronRight, Eye, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { getLocations, createLocation, updateLocation, deleteLocation, getItems } from "@/lib/api";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

interface Location {
  id: string;
  building: string;
  floor: string;
  room: string;
  detail: string | null;
  _count: { items: number };
}

// ponytail: tree built client-side from already-sorted flat list; no backend change
interface TreeRow {
  key: string;
  label: string;
  depth: number;
  loc?: Location;
  children: TreeRow[];
  count: number;
}

function groupBy<T>(arr: T[], key: (t: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const x of arr) {
    const k = key(x);
    const list = m.get(k);
    if (list) list.push(x);
    else m.set(k, [x]);
  }
  return [...m.entries()];
}

function buildLocationTree(locs: Location[]): TreeRow[] {
  const leaf = (key: string, label: string, depth: number, loc: Location): TreeRow =>
    ({ key, label, depth, loc, children: [], count: loc._count.items });
  const group = (key: string, label: string, depth: number, children: TreeRow[]): TreeRow =>
    ({ key, label, depth, children, count: children.reduce((s, c) => s + c.count, 0) });

  return groupBy(locs, (l) => l.building).map(([building, bLocs]) =>
    group(building, building, 0,
      groupBy(bLocs, (l) => l.floor).map(([floor, fLocs]) =>
        group(`${building}|${floor}`, floor, 1,
          groupBy(fLocs, (l) => l.room).map(([room, rLocs]) => {
            // no room: detail identifies the spot — show at room level
            if (!room) {
              if (rLocs.length === 1 && rLocs[0].detail) return leaf(rLocs[0].id, rLocs[0].detail, 2, rLocs[0]);
              return group(`${building}|${floor}|`, "(ไม่มีห้อง)", 2,
                rLocs.map((l) => leaf(l.id, l.detail || "(ไม่มีรายละเอียด)", 3, l)));
            }
            // single room with no detail → room itself is the leaf
            if (rLocs.length === 1 && !rLocs[0].detail) return leaf(rLocs[0].id, room, 2, rLocs[0]);
            return group(`${building}|${floor}|${room}`, room, 2,
              rLocs.map((l) => leaf(l.id, l.detail || "(ไม่มีรายละเอียด)", 3, l)));
          })
        )
      )
    )
  );
}

function LocationTree({
  rows,
  onEdit,
  onDelete,
}: {
  rows: TreeRow[];
  onEdit: (loc: Location) => void;
  onDelete: (loc: Location) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const renderRow = (row: TreeRow): ReactNode => {
    const isLeaf = !!row.loc;
    const isOpen = expanded.has(row.key);
    return (
      <div key={row.key}>
        <div
          className={cn(
            "flex items-center justify-between border-b border-border last:border-b-0 transition-colors",
            isLeaf ? "hover:bg-muted/40" : "bg-muted/30"
          )}
          style={{ paddingLeft: 12 + row.depth * 20, paddingRight: 16 }}
        >
          {isLeaf ? (
            <>
              <span className="font-medium py-2.5 text-sm">{row.label}</span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground tabular-nums mr-1">{row.count} รายการ</span>
                <LocationPeek locationId={row.loc!.id} label={row.label} />
                <TooltipProvider>
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(row.loc!)} aria-label="แก้ไข" />}>
                        <Pencil className="h-3 w-3" />
                      </TooltipTrigger>
                      <TooltipContent>แก้ไข</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(row.loc!)} aria-label="ลบ" />}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </TooltipTrigger>
                      <TooltipContent>ลบ</TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => toggle(row.key)}
              className="flex items-center gap-2 w-full py-2.5 text-left text-sm font-semibold"
            >
              <ChevronRight className={cn("h-4 w-4 shrink-0 transition-transform", isOpen && "rotate-90")} />
              <span>{row.label}</span>
              <span className="text-xs font-normal text-muted-foreground tabular-nums">{row.count} รายการ</span>
            </button>
          )}
        </div>
        {!isLeaf && isOpen && <div>{row.children.map(renderRow)}</div>}
      </div>
    );
  };

  return <>{rows.map(renderRow)}</>;
}

interface ItemPreview {
  id: string;
  code: string;
  name: string;
  availableQty: number;
  issueUnit?: { name: string } | null;
}

// ponytail: lazy-fetch on open; no need to preload every row
function LocationPeek({ locationId, label }: { locationId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ItemPreview[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    getItems({ locationId })
      .then((res) => { if (active) setItems(res.items as ItemPreview[]); })
      .catch(() => { if (active) toast.error("โหลดรายการไม่สำเร็จ"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, locationId]);

  return (
    <>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(true)} aria-label="ดูรายการในตำแหน่งนี้">
        <Eye className="h-3 w-3" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md sm:rounded-2xl">
          <div className="flex items-center gap-3 border-b border-border bg-card px-6 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Eye className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold text-foreground">{label}</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {loading ? "กำลังโหลด…" : `${items.length} รายการในตำแหน่งนี้`}
              </DialogDescription>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto divide-y divide-border bg-secondary/40">
            {loading ? (
              <div className="space-y-2 p-5">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
              </div>
            ) : items.length === 0 ? (
              <p className="px-6 py-12 text-center text-sm text-muted-foreground">ไม่มีรายการในตำแหน่งนี้</p>
            ) : items.map((it) => (
              <div key={it.id} className="flex items-center justify-between gap-3 px-6 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{it.name}</p>
                  <p className="text-xs text-muted-foreground">{it.code}</p>
                </div>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {it.availableQty}{it.issueUnit?.name ? ` ${it.issueUnit.name}` : ""}
                </span>
              </div>
            ))}
          </div>

          <div className="flex justify-end border-t border-border bg-card px-6 py-4">
            <Button variant="outline" onClick={() => setOpen(false)}>ปิด</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function LocationsTab() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [form, setForm] = useState({ building: "", floor: "", room: "", detail: "" });
  const [noRoom, setNoRoom] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Location | null>(null);

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getLocations();
      setLocations(data as Location[]);
    } catch {
      toast.error("โหลดข้อมูลไม่สำเร็จ");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchLocations(); }, [fetchLocations]);

  const sortedLocations = [...locations].sort((a, b) => {
    const cmp = a.building.localeCompare(b.building);
    if (cmp !== 0) return cmp;
    const cmpF = a.floor.localeCompare(b.floor);
    if (cmpF !== 0) return cmpF;
    const cmpR = a.room.localeCompare(b.room);
    if (cmpR !== 0) return cmpR;
    return (a.detail || "").localeCompare(b.detail || "");
  });

  function openCreate() {
    setEditing(null);
    setForm({ building: "", floor: "", room: "", detail: "" });
    setNoRoom(false);
    setDialogOpen(true);
  }

  function openEdit(loc: Location) {
    setEditing(loc);
    // legacy room="" stored the spot in detail; migrate into room (new model) on edit.
    const legacyNoRoom = !loc.room;
    setForm({ building: loc.building, floor: loc.floor, room: legacyNoRoom ? (loc.detail || "") : loc.room, detail: legacyNoRoom ? "" : (loc.detail || "") });
    setNoRoom(legacyNoRoom);
    setDialogOpen(true);
  }

  async function handleSave() {
    const payload = {
      building: form.building,
      floor: form.floor,
      room: form.room,
      detail: form.detail || null,
    };

    try {
      if (editing) {
        await updateLocation(editing.id, payload);
        toast.success("อัปเดตสถานที่สำเร็จ");
      } else {
        await createLocation(payload);
        toast.success("สร้างสถานที่สำเร็จ");
      }
      setDialogOpen(false);
      fetchLocations();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  }

  async function handleDelete(loc: Location) {
    setDeleteTarget(loc);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteLocation(deleteTarget.id);
      toast.success("ลบสถานที่สำเร็จ");
      fetchLocations();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
    setDeleteTarget(null);
  }

  if (loading) return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-8 w-16" />
      </div>
      <div className="rounded-2xl border overflow-hidden bg-card divide-y divide-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-2.5">
            <Skeleton className="h-4 w-48" />
            <div className="flex items-center gap-1">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-7 w-7 rounded-md" />
              <Skeleton className="h-7 w-7 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => openCreate()}><Plus className="h-4 w-4 mr-1" />เพิ่ม</Button>
      </div>

      <div className="rounded-2xl border overflow-hidden bg-card shadow-sm">
        {sortedLocations.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <MapPin className="h-8 w-8 text-muted-foreground/40" />
              <div>
                <p className="text-sm font-medium text-foreground">ยังไม่มีสถานที่</p>
                <p className="text-xs text-muted-foreground mt-0.5">เพิ่มสถานที่จัดเก็บเพื่อติดตามตำแหน่งพัสดุ</p>
              </div>
              <Button size="sm" variant="outline" onClick={openCreate}><Plus className="h-3.5 w-3.5 mr-1" />เพิ่มสถานที่</Button>
            </div>
        ) : (
          <LocationTree rows={buildLocationTree(sortedLocations)} onEdit={openEdit} onDelete={handleDelete} />
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg sm:rounded-2xl">
          <div className="flex items-center gap-3 border-b border-border bg-card px-6 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MapPin className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold text-foreground">
                {editing ? "แก้ไขสถานที่" : "เพิ่มสถานที่"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {editing ? "ปรับปรุงตำแหน่งจัดเก็บ" : "ระบุตำแหน่งจัดเก็บพัสดุ"}
              </DialogDescription>
            </div>
          </div>

          <div className="space-y-6 bg-secondary/40 px-6 py-6">
            <div className="space-y-2">
              <Label htmlFor="loc-building">อาคาร <span className="text-destructive">*</span></Label>
              <Input id="loc-building" value={form.building} onChange={(e) => setForm({ ...form, building: e.target.value })} placeholder="เช่น อาคาร 2" className="bg-card" autoFocus={!editing} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="loc-floor">ชั้น <span className="text-destructive">*</span></Label>
                <Input id="loc-floor" value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} placeholder="เช่น 4" className="bg-card" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="loc-room">
                  {noRoom ? "ตำแหน่ง" : "ห้อง"} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="loc-room"
                  value={form.room}
                  onChange={(e) => setForm({ ...form, room: e.target.value })}
                  placeholder={noRoom ? "เช่น ล็อคเกอร์หน้าห้อง 402" : "เช่น 402"}
                  className="bg-card"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setNoRoom(!noRoom)}
              aria-pressed={noRoom}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all",
                noRoom ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:border-primary/40",
              )}
            >
              <Switch checked={noRoom} tabIndex={-1} className="pointer-events-none" aria-hidden />
              <span className="flex-1">
                <span className="block text-sm font-medium text-foreground">ไม่มีห้องเฉพาะ</span>
                <span className="block text-xs text-muted-foreground">ระบุตำแหน่งแทน เช่น ล็อคเกอร์หน้าห้อง</span>
              </span>
            </button>

            <div className="space-y-2">
              <Label htmlFor="loc-detail">รายละเอียดเพิ่มเติม</Label>
              <Input
                id="loc-detail"
                value={form.detail}
                onChange={(e) => setForm({ ...form, detail: e.target.value })}
                placeholder="ไม่จำเป็น เช่น ชั้นบนของตู้"
                className="bg-card"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border bg-card px-6 py-4">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>ยกเลิก</Button>
            <Button onClick={handleSave} disabled={!form.building || !form.floor || !form.room.trim()} className="gap-1.5">
              <Check className="h-4 w-4" />
              {editing ? "บันทึก" : "สร้างสถานที่"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบสถานที่</AlertDialogTitle>
            <AlertDialogDescription>
              ต้องการลบ &ldquo;{deleteTarget ? [deleteTarget.building, deleteTarget.floor, deleteTarget.room, deleteTarget.detail].filter(Boolean).join(" / ") : ""}&rdquo; ใช่หรือไม่?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmDelete}>ลบ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
