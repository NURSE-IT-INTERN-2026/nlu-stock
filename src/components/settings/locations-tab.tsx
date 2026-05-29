"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

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

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/settings/locations");
    const data = await res.json();
    setLocations(data);
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

    if (editing) {
      const res = await fetch(`/api/settings/locations/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const err = await res.json(); toast.error(err.error || "Failed to update"); return; }
      toast.success("Location updated");
    } else {
      const res = await fetch("/api/settings/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const err = await res.json(); toast.error(err.error || "Failed to create"); return; }
      toast.success("Location created");
    }
    setDialogOpen(false);
    fetchLocations();
  }

  async function handleDelete(loc: Location) {
    if (!confirm(`Delete "${[loc.building, loc.floor, loc.room, loc.detail].filter(Boolean).join(" / ")}"?`)) return;
    const res = await fetch(`/api/settings/locations/${loc.id}`, { method: "DELETE" });
    if (!res.ok) { const err = await res.json(); toast.error(err.error || "Failed to delete"); return; }
    toast.success("Location deleted");
    fetchLocations();
  }

  if (loading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Locations</h3>
        <Button size="sm" onClick={() => openCreate()}><Plus className="h-4 w-4 mr-1" />Add</Button>
      </div>

      <div className="space-y-1">
        {sortedLocations.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No locations</p>
        ) : sortedLocations.map((loc) => (
          <div key={loc.id} className="flex items-center justify-between px-3 py-2 border rounded-md text-sm">
            <span className="font-medium">
              {[loc.building, loc.floor, loc.room, loc.detail].filter(Boolean).join(" / ")}
            </span>
            <div className="flex items-center gap-1">
              <Badge variant="outline">{loc._count.items}</Badge>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(loc)}><Pencil className="h-3 w-3" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(loc)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Location" : "Add Location"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Building</Label>
              <Input value={form.building} onChange={(e) => setForm({ ...form, building: e.target.value })} />
            </div>
            <div>
              <Label>Floor</Label>
              <Input value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} />
            </div>
            <div>
              <Label>Room</Label>
              <Input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} />
            </div>
            <div>
              <Label>Detail</Label>
              <Input value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.building || !form.floor || !form.room}>{editing ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
