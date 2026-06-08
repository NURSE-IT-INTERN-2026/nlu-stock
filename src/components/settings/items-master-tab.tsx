"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight,
  ChevronDown, ChevronRight as ExpandIcon, QrCode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { SubCodesManager } from "./sub-codes-manager";
import { QrPrintDialog, type QrPrintItem } from "@/components/shared/qr-print-dialog";
import { FileUpload } from "@/components/shared/file-upload";
import { Category, CATEGORY_LABELS, locationLabel } from "@/lib/constants";
import { getSettingsItems, getUnits, deleteSettingsItem, saveSettingsItem } from "@/lib/api";
import type { CategoryOption, LocationOption, UnitOption } from "@/lib/api";
import { useCategories, useLocations } from "@/hooks/use-lookup-data";
import { usePagination } from "@/hooks/use-pagination";


interface ItemRecord {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  categoryId: string;
  category: CategoryOption;
  trackIndividually: boolean;
  status: string;
  issueUnitId: string;
  issueUnit: UnitOption;
  subUnitId: string;
  subUnit: UnitOption;
  conversionFactor: number;
  minThreshold: number;
  locationId: string | null;
  location: LocationOption | null;
  imageUrl: string | null;
  description: string | null;
  isActive: boolean;
  totalQty: number;
  availableQty: number;
  _count: { subItems: number };
  model: string | null;
  purchaseDate: string | null;
  purchasePrice: number | null;
  vendorCompany: string | null;
  vendorContact: string | null;
  vendorPhone: string | null;
  warrantyMonths: number;
  maintenanceCycleMonths: number;
  storageRequirements: string | null;
}

const defaultForm = {
  code: "", name: "", nameEn: "", categoryId: "", trackIndividually: false,
  issueUnitId: "", subUnitId: "", conversionFactor: 1, minThreshold: 0,
  locationId: "", description: "", isActive: true,
  imageUrl: null as string | null,
  model: "", purchaseDate: "", purchasePrice: "",
  vendorCompany: "", vendorContact: "", vendorPhone: "",
  warrantyMonths: 0, maintenanceCycleMonths: 12,
  storageRequirements: "",
};

export function ItemsMasterTab() {
  const [items, setItems] = useState<ItemRecord[]>([]);
  const { categories } = useCategories();
  const { locations } = useLocations();
  const [units, setUnits] = useState<UnitOption[]>([]);
  const { page, setPage, perPage, total, setTotal, totalPages } = usePagination(20);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ItemRecord | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [printOpen, setPrintOpen] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = {
      page: String(page),
      perPage: String(perPage),
    };
    if (search) params.search = search;
    if (filterCategory) params.categoryId = filterCategory;
    if (filterStatus === "INACTIVE") {
      params.active = "false";
    } else if (filterStatus) {
      params.status = filterStatus;
    }

    const data = await getSettingsItems(params);
    setItems((data.items || []) as ItemRecord[]);
    setTotal(data.total || 0);
    setLoading(false);
  }, [page, perPage, search, filterCategory, filterStatus]);

  useEffect(() => { getUnits().then(setUnits); }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => { setSelectedIds(new Set()); }, [page, search, filterCategory, filterStatus]);

  function openCreate() {
    setEditing(null);
    setForm(defaultForm);
    setDialogOpen(true);
  }

  function openEdit(item: ItemRecord) {
    setEditing(item);
    setForm({
      code: item.code,
      name: item.name,
      nameEn: item.nameEn || "",
      categoryId: item.categoryId,
      trackIndividually: item.trackIndividually,
      issueUnitId: item.issueUnitId,
      subUnitId: item.subUnitId,
      conversionFactor: item.conversionFactor,
      minThreshold: item.minThreshold,
      locationId: item.locationId || "",
      description: item.description || "",
      isActive: item.isActive,
      imageUrl: item.imageUrl,
      model: item.model || "",
      purchaseDate: item.purchaseDate ? item.purchaseDate.split("T")[0] : "",
      purchasePrice: item.purchasePrice != null ? String(item.purchasePrice) : "",
      vendorCompany: item.vendorCompany || "",
      vendorContact: item.vendorContact || "",
      vendorPhone: item.vendorPhone || "",
      warrantyMonths: item.warrantyMonths ?? 0,
      maintenanceCycleMonths: item.maintenanceCycleMonths,
      storageRequirements: item.storageRequirements || "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    const payload = {
      ...form,
      nameEn: form.nameEn || null,
      locationId: form.locationId || null,
      description: form.description || null,
      imageUrl: form.imageUrl || null,
      conversionFactor: Number(form.conversionFactor),
      minThreshold: Number(form.minThreshold),
      maintenanceCycleMonths: Number(form.maintenanceCycleMonths),
      warrantyMonths: Number(form.warrantyMonths),
      purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : null,
      purchaseDate: form.purchaseDate || null,
      model: form.model || null,
      vendorCompany: form.vendorCompany || null,
      vendorContact: form.vendorContact || null,
      vendorPhone: form.vendorPhone || null,
      storageRequirements: form.storageRequirements || null,
    };

    try {
      await saveSettingsItem(payload, editing?.id);
      toast.success(editing ? "Item updated" : "Item created");
      setDialogOpen(false);
      fetchItems();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
    setSaving(false);
  }

  async function handleDelete(item: ItemRecord) {
    if (!confirm(`Delete "${item.name}"? This cannot be undone if no transactions exist.`)) return;
    try {
      await deleteSettingsItem(item.id);
      toast.success("Item deleted");
      fetchItems();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  const selectedCategory = categories.find((c) => c.id === form.categoryId);
  const isFixedAsset = selectedCategory?.category === "KRU" || selectedCategory?.category === "ELE";
  const isConsumable = selectedCategory?.category === "CON" || selectedCategory?.category === "MED";
  const isBook = selectedCategory?.category === "BOOK";
  const trackForced = selectedCategory ? (
    ["KRU", "ELE", "BOOK", "TOY"].includes(selectedCategory.category) ? true
    : ["CON", "MED"].includes(selectedCategory.category) ? false
    : undefined
  ) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Items Master</h3>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <Button size="sm" variant="outline" onClick={() => setPrintOpen(true)}>
              <QrCode className="h-4 w-4 mr-1" />Print QR ({selectedIds.size})
            </Button>
          )}
          <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Add Item</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search code, name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-8"
          />
        </div>
        <Select value={filterCategory || "__all__"} onValueChange={(v) => { setFilterCategory(!v || v === "__all__" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Categories">
              {(value: string | null) => {
                if (!value || value === "__all__") return "All Categories";
                const cat = categories.find((c) => c.id === value);
                return cat?.name ?? "All Categories";
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Categories</SelectItem>
            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus || "__all__"} onValueChange={(v) => { setFilterStatus(!v || v === "__all__" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Status">
              {(value: string | null) => {
                if (!value || value === "__all__") return "All Status";
                return value.replace(/_/g, " ");
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Status</SelectItem>
            <SelectItem value="AVAILABLE">Available</SelectItem>
            <SelectItem value="CHECKED_OUT">Checked Out</SelectItem>
            <SelectItem value="DAMAGED">Damaged</SelectItem>
            <SelectItem value="UNDER_REPAIR">Under Repair</SelectItem>
            <SelectItem value="LOST">Lost</SelectItem>
            <SelectItem value="DISPOSED">Disposed</SelectItem>
            <SelectSeparator />
            <SelectItem value="INACTIVE">Inactive (hidden)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <input
                  type="checkbox"
                  checked={items.length > 0 && items.every((i) => selectedIds.has(i.id))}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds(new Set(items.map((i) => i.id)));
                    } else {
                      setSelectedIds(new Set());
                    }
                  }}
                  className="rounded"
                />
              </TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Available / Total</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No items found</TableCell></TableRow>
            ) : items.map((item) => (
              <React.Fragment key={item.id}>
                <TableRow className={!item.isActive ? "opacity-50" : ""}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={(e) => {
                        const next = new Set(selectedIds);
                        e.target.checked ? next.add(item.id) : next.delete(item.id);
                        setSelectedIds(next);
                      }}
                      className="rounded"
                    />
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    <div className="flex items-center gap-1">
                      {item.trackIndividually && item._count.subItems > 1 && (
                        <button onClick={() => setExpandedRow(expandedRow === item.id ? null : item.id)} className="p-0.5 hover:bg-muted rounded">
                          {expandedRow === item.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ExpandIcon className="h-3.5 w-3.5" />}
                        </button>
                      )}
                      {item.code}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <span className="font-medium">{item.name}</span>
                      {item.nameEn && <span className="text-muted-foreground ml-1">({item.nameEn})</span>}
                    </div>
                    {item.trackIndividually && item._count.subItems > 1 && <Badge variant="secondary" className="text-xs mt-0.5">Tracked ({item._count.subItems})</Badge>}
                  </TableCell>
                  <TableCell><Badge variant="outline">{CATEGORY_LABELS[item.category.category as Category] || item.category.name}</Badge></TableCell>
                  <TableCell className="text-right">
                    <span className={item.availableQty < item.minThreshold ? "text-destructive font-medium" : ""}>{item.availableQty}</span>
                    <span className="text-muted-foreground"> / {item.totalQty}</span>
                  </TableCell>
                  <TableCell className="text-sm">{item.issueUnit.name}</TableCell>
                  <TableCell className="text-sm">{item.location ? locationLabel(item.location) : "-"}</TableCell>
                  <TableCell><Badge variant={item.status === "AVAILABLE" ? "default" : "secondary"}>{item.status}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(item)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
                {expandedRow === item.id && item.trackIndividually && item._count.subItems > 1 && (
                  <TableRow key={`${item.id}-expand`}>
                    <TableCell colSpan={9} className="bg-muted/30 p-4">
                      <SubCodesManager itemId={item.id} itemCode={item.code} />
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {total} items, page {page} of {totalPages}
          </p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Item" : "Add Item"}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="basic">
            <TabsList className="w-full">
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="tracking">Tracking & Units</TabsTrigger>
              <TabsTrigger value="stock">Stock & Location</TabsTrigger>
              {isFixedAsset && <TabsTrigger value="asset">Fixed Asset</TabsTrigger>}
            </TabsList>

            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Code *</Label>
                  <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
                </div>
                <div>
                  <Label>Category *</Label>
                  <Select value={form.categoryId} onValueChange={(v) => {
                    const cat = categories.find((c) => c.id === v);
                    const forced = cat ? (
                      ["KRU", "ELE", "BOOK", "TOY"].includes(cat.category) ? true
                      : ["CON", "MED"].includes(cat.category) ? false
                      : undefined
                    ) : undefined;
                    setForm({ ...form, categoryId: v ?? "", ...(forced !== undefined ? { trackIndividually: forced } : {}) });
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label>ชื่อ (EN)</Label>
                <Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </TabsContent>

            <TabsContent value="tracking" className="space-y-4 mt-4">
              <div className="flex items-center gap-3">
                <Switch
                  checked={trackForced !== undefined ? trackForced : form.trackIndividually}
                  onCheckedChange={trackForced !== undefined ? undefined : (v) => setForm({ ...form, trackIndividually: v })}
                  disabled={trackForced !== undefined}
                />
                <Label>
                  Track individually (sub-codes)
                  {trackForced === true && <span className="text-muted-foreground text-xs ml-1">(required for this category)</span>}
                  {trackForced === false && <span className="text-muted-foreground text-xs ml-1">(not applicable for this category)</span>}
                </Label>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Issue Unit *</Label>
                  <Select value={form.issueUnitId} onValueChange={(v) => setForm({ ...form, issueUnitId: v ?? "" })}>
                    <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                    <SelectContent>
                      {units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Sub Unit *</Label>
                  <Select value={form.subUnitId} onValueChange={(v) => setForm({ ...form, subUnitId: v ?? "" })}>
                    <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                    <SelectContent>
                      {units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Conversion Factor (1 issue = ? sub)</Label>
                <Input type="number" value={form.conversionFactor} onChange={(e) => setForm({ ...form, conversionFactor: parseInt(e.target.value) || 1 })} />
              </div>
            </TabsContent>

            <TabsContent value="stock" className="space-y-4 mt-4">
              <div>
                <Label>Min Threshold</Label>
                <Input type="number" value={form.minThreshold} onChange={(e) => setForm({ ...form, minThreshold: parseInt(e.target.value) || 0 })} />
              </div>
              <div>
                <Label>Location</Label>
                <Select value={form.locationId} onValueChange={(v) => setForm({ ...form, locationId: v === "__none__" ? "" : (v ?? "") })}>
                  <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No location</SelectItem>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>{locationLabel(loc)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isConsumable && (
                <div>
                  <Label>Storage Requirements</Label>
                  <Textarea value={form.storageRequirements} onChange={(e) => setForm({ ...form, storageRequirements: e.target.value })} placeholder="e.g. เก็บในตู้เย็น ไม่เกิน 30°C" />
                </div>
              )}
              <div className="flex items-center gap-3">
                <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
                <Label>Active</Label>
              </div>
              <div>
                <Label>Image</Label>
                <FileUpload
                  value={form.imageUrl}
                  onChange={(url) => setForm({ ...form, imageUrl: url })}
                  accept="image/*"
                  label="Upload Image"
                />
              </div>
            </TabsContent>

            {isFixedAsset && (
              <TabsContent value="asset" className="space-y-4 mt-4">
                <div>
                  <Label>Model</Label>
                  <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Purchase Date</Label>
                    <Input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} />
                  </div>
                  <div>
                    <Label>Purchase Price</Label>
                    <Input type="number" step="0.01" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>บริษัท</Label>
                    <Input value={form.vendorCompany} onChange={(e) => setForm({ ...form, vendorCompany: e.target.value })} placeholder="Company name" />
                  </div>
                  <div>
                    <Label>ตัวแทน</Label>
                    <Input value={form.vendorContact} onChange={(e) => setForm({ ...form, vendorContact: e.target.value })} placeholder="Contact person" />
                  </div>
                  <div>
                    <Label>เบอร์โทร</Label>
                    <Input value={form.vendorPhone} onChange={(e) => setForm({ ...form, vendorPhone: e.target.value })} placeholder="Phone number" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>รับประกัน (เดือน)</Label>
                    <Input type="number" value={form.warrantyMonths} onChange={(e) => setForm({ ...form, warrantyMonths: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <Label>Maintenance Cycle (months)</Label>
                    <Input type="number" value={form.maintenanceCycleMonths} onChange={(e) => setForm({ ...form, maintenanceCycleMonths: parseInt(e.target.value) || 12 })} />
                  </div>
                </div>
              </TabsContent>
            )}
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.code || !form.name || !form.categoryId || !form.issueUnitId || !form.subUnitId}>
              {saving ? "Saving..." : editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QrPrintDialog
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        items={items.filter((i) => selectedIds.has(i.id)).map((i) => ({ code: i.code, name: i.name }))}
      />
    </div>
  );
}
