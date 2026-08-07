"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Minus, X, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter, DialogHeader,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/use-debounce";
import {
  getDispenseTemplates, getDispenseTemplate, createDispenseTemplate,
  updateDispenseTemplate, deleteDispenseTemplate, searchDispenseItems,
  type TemplateSummary,
} from "@/lib/api";

interface EditorLine {
  itemId: string;
  code: string;
  name: string;
  quantity: number;
}

// Minimal shape from /api/dispense/items we actually read here.
interface SearchHit {
  id: string;
  code: string;
  name: string;
  issueUnit: { name: string };
}

export function TemplatesTab() {
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [lines, setLines] = useState<EditorLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TemplateSummary | null>(null);

  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 300);
  const [hits, setHits] = useState<SearchHit[]>([]);

  const refresh = useCallback(async () => {
    try {
      const d = await getDispenseTemplates();
      setTemplates(d.templates);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "โหลดเทมเพลตไม่สำเร็จ");
      setTemplates([]);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  // Live item search inside the editor.
  useEffect(() => {
    if (!editorOpen || !debounced.trim()) { setHits([]); return; }
    let cancelled = false;
    void (async () => {
      try {
        const d = await searchDispenseItems({ q: debounced, perPage: "20" });
        if (!cancelled) setHits(d.items as SearchHit[]);
      } catch { /* ignore transient search errors */ }
    })();
    return () => { cancelled = true; };
  }, [debounced, editorOpen]);

  const openCreate = () => {
    setEditingId(null);
    setName("");
    setLines([]);
    setQuery("");
    setHits([]);
    setEditorOpen(true);
  };

  const openEdit = async (id: string) => {
    setEditingId(id);
    setQuery("");
    setHits([]);
    setEditorOpen(true);
    setLines([]);
    try {
      const t = await getDispenseTemplate(id);
      setName(t.name);
      setLines(t.lines.map((l) => ({ itemId: l.item.id, code: l.item.code, name: l.item.name, quantity: l.quantity })));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "โหลดเทมเพลตไม่สำเร็จ");
      setEditorOpen(false);
    }
  };

  const addLine = (hit: SearchHit) => {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.itemId === hit.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { itemId: hit.id, code: hit.code, name: hit.name, quantity: 1 }];
    });
    setQuery("");
    setHits([]);
  };

  const setQty = (itemId: string, qty: number) =>
    setLines((prev) => prev.map((l) => (l.itemId === itemId ? { ...l, quantity: Math.max(1, qty) } : l)));
  const removeLine = (itemId: string) => setLines((prev) => prev.filter((l) => l.itemId !== itemId));

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) { toast.error("ต้องมีชื่อเทมเพลต"); return; }
    if (lines.length === 0) { toast.error("ต้องมีอย่างน้อย 1 รายการ"); return; }
    setSaving(true);
    try {
      const payload = { name: trimmed, lines: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity })) };
      if (editingId) await updateDispenseTemplate(editingId, payload);
      else await createDispenseTemplate(payload);
      toast.success(editingId ? "บันทึกการแก้ไขแล้ว" : "สร้างเทมเพลตแล้ว");
      setEditorOpen(false);
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDispenseTemplate(deleteTarget.id);
      toast.success("ลบเทมเพลตแล้ว");
      setDeleteTarget(null);
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">ชุดรายการเบิกที่บันทึกไว้ใช้ซ้ำ — ใช้งานได้ทั้งทีม</p>
        <Button onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" />
          สร้างเทมเพลต
        </Button>
      </div>

      {templates === null ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <ClipboardList className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">ยังไม่มีเทมเพลต — สร้างจากที่นี่ หรือกด &ldquo;บันทึกเทมเพลต&rdquo; ในตะกร้า</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs font-medium text-muted-foreground">ชื่อ</TableHead>
                <TableHead className="w-24 text-xs font-medium text-muted-foreground">รายการ</TableHead>
                <TableHead className="w-40 text-xs font-medium text-muted-foreground">ผู้สร้าง</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id} className="cursor-pointer" onClick={() => void openEdit(t.id)}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.lineCount} รายการ</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.createdByName}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void openEdit(t.id)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(t)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Editor */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "แก้ไขเทมเพลต" : "สร้างเทมเพลต"}</DialogTitle>
            <DialogDescription>เก็บเฉพาะพัสดุ + จำนวน — lot/ชิ้นจะเลือกจากสต็อกตอนโหลดเข้าตะกร้า</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Input
              placeholder="ชื่อเทมเพลต เช่น ชุดเบิกประจำห้องแล็บ"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-sm"
            />

            {/* item search */}
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="ค้นหาพัสดุเพื่อเพิ่ม..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-8 text-sm"
                />
              </div>
              {hits.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md">
                  {hits.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => addLine(h)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      <span className="font-mono text-xs text-muted-foreground">{h.code}</span>
                      <span className="min-w-0 truncate">{h.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* lines */}
            {lines.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">ยังไม่มีรายการ — ค้นหาด้านบนเพื่อเพิ่ม</p>
            ) : (
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {lines.map((l) => (
                  <div key={l.itemId} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                    <div className="min-w-0 flex-1">
                      <span className="block font-mono text-xs text-muted-foreground">{l.code}</span>
                      <span className="block truncate text-sm">{l.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setQty(l.itemId, l.quantity - 1)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Input
                        type="number"
                        min={1}
                        value={l.quantity}
                        onChange={(e) => setQty(l.itemId, Number(e.target.value) || 1)}
                        className="h-7 w-14 text-center text-sm"
                      />
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setQty(l.itemId, l.quantity + 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeLine(l.itemId)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>ยกเลิก</Button>
            <Button onClick={() => void handleSave()} disabled={saving}>บันทึก</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบเทมเพลต?</AlertDialogTitle>
            <AlertDialogDescription>
              ลบ &ldquo;{deleteTarget?.name}&rdquo; ถาวร — พัสดุและสต็อกไม่ได้รับผลกระทบ
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>ลบ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
