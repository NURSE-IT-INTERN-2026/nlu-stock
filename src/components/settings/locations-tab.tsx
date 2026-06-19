"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { getLocations, createLocation, updateLocation, deleteLocation } from "@/lib/api";
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

interface Location {
  id: string;
  building: string;
  floor: string;
  room: string;
  detail: string | null;
  _count: { items: number };
}

export function LocationsTab() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [form, setForm] = useState({ building: "", floor: "", room: "", detail: "" });
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
    setDialogOpen(true);
  }

  function openEdit(loc: Location) {
    setEditing(loc);
    setForm({ building: loc.building, floor: loc.floor, room: loc.room, detail: loc.detail || "" });
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

      <div className="rounded-2xl border overflow-hidden bg-card shadow-sm divide-y divide-border">
        {sortedLocations.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <MapPin className="h-8 w-8 text-muted-foreground/40" />
              <div>
                <p className="text-sm font-medium text-foreground">ยังไม่มีสถานที่</p>
                <p className="text-xs text-muted-foreground mt-0.5">เพิ่มสถานที่จัดเก็บเพื่อติดตามตำแหน่งพัสดุ</p>
              </div>
              <Button size="sm" variant="outline" onClick={openCreate}><Plus className="h-3.5 w-3.5 mr-1" />เพิ่มสถานที่</Button>
            </div>
        ) : sortedLocations.map((loc) => (
          <div key={loc.id} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-muted/40 transition-colors">
            <span className="font-medium">
              {[loc.building, loc.floor, loc.room, loc.detail].filter(Boolean).join(" / ")}
            </span>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground tabular-nums mr-1">{loc._count.items} รายการ</span>
              <TooltipProvider>
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(loc)} aria-label="แก้ไข" />}>
                      <Pencil className="h-3 w-3" />
                    </TooltipTrigger>
                    <TooltipContent>แก้ไข</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(loc)} aria-label="ลบ" />}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </TooltipTrigger>
                    <TooltipContent>ลบ</TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "แก้ไขสถานที่" : "เพิ่มสถานที่"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="loc-building">อาคาร</Label>
              <Input id="loc-building" value={form.building} onChange={(e) => setForm({ ...form, building: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="loc-floor">ชั้น</Label>
              <Input id="loc-floor" value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="loc-room">ห้อง</Label>
              <Input id="loc-room" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="loc-detail">รายละเอียดเพิ่มเติม</Label>
              <Input id="loc-detail" value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} placeholder="ไม่จำเป็น" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>ยกเลิก</Button>
            <Button onClick={handleSave} disabled={!form.building || !form.floor || !form.room}>{editing ? "บันทึก" : "สร้าง"}</Button>
          </DialogFooter>
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
