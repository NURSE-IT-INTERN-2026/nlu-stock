"use client";

import React, { useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2,
  QrCode, Package, Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { SubCodesManager } from "./sub-codes-manager";
import { QrPrintDialog } from "@/components/shared/qr-print-dialog";
import { EditItemDialog } from "@/components/shared/edit-item-dialog";
import { locationLabel, statusDisplay, type ItemStatus } from "@/lib/constants";
import { getSettingsItems, deleteSettingsItem } from "@/lib/api";
import { AddItemModal } from "@/components/shared/add-item-modal";
import type { CategoryOption, LocationOption, ProfileOption, UnitOption } from "@/lib/api";
import { useCategories, useLocations } from "@/hooks/use-lookup-data";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { usePagedList } from "@/hooks/use-paged-list";
import { Pagination } from "@/components/shared/pagination";
import { PAGE_SIZE } from "@/lib/pagination-constants";
import { ItemsFilterBar, EMPTY_FILTER, type FilterState } from "@/components/items/items-filter-bar";
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


interface ItemRecord {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  categoryId: string;
  category: CategoryOption;
  trackIndividually: boolean;
  status: ItemStatus;
  issueUnitId: string;
  issueUnit: UnitOption;
  minThreshold: number;
  locationId: string | null;
  location: LocationOption | null;
  imageUrl: string | null;
  description: string | null;
  isActive: boolean;
  totalQty: number;
  availableQty: number;
  _count: { subItems: number; dispenseRecords: number; receiveRecords: number };
  model: string | null;
  purchaseDate: string | null;
  purchasePrice: number | null;
  vendorCompany: string | null;
  vendorContact: string | null;
  vendorPhone: string | null;
  warrantyMonths: number;
  maintenanceCycleMonths: number;
  storageRequirements: string | null;
  setSize: number;
  borrowable: boolean;
}

export function ItemsMasterTab() {
  const isMobile = useIsMobile();
  const { categories } = useCategories();
  const { locations } = useLocations();
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
  const perPage = PAGE_SIZE.DEFAULT;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [editing, setEditing] = useState<ItemRecord | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [printOpen, setPrintOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ItemRecord | null>(null);

  // derive profiles from categories (each carries its profile) — mirrors /items page.
  const profiles = useMemo<ProfileOption[]>(() => {
    const map = new Map<string, ProfileOption>();
    for (const c of categories) if (c.profile) map.set(c.profile.id, c.profile);
    return [...map.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [categories]);

  const handleFilterChange = useCallback((next: FilterState) => {
    setFilter(next);
    setSelectedIds(new Set());
  }, []);

  const fetchPage = useCallback(async (p: number) => {
    const params: Record<string, string> = {
      page: String(p),
      perPage: String(perPage),
    };
    if (filter.query) params.search = filter.query;
    if (filter.profileId) params.profileId = filter.profileId;
    if (filter.categoryId) params.categoryId = filter.categoryId;
    if (filter.status.length) params.status = filter.status.join(",");
    if (filter.location.building) params.building = filter.location.building;
    if (filter.location.floor) params.floor = filter.location.floor;
    if (filter.location.room) params.room = filter.location.room;
    if (filter.location.detail) params.detail = filter.location.detail;

    const data = await getSettingsItems(params);
    return { items: (data.items || []) as ItemRecord[], total: data.total || 0 };
  }, [filter, perPage]);

  const {
    items, total, page, loading, isLoadingMore, hasNext, loadMore, setPage, refetch,
  } = usePagedList<ItemRecord>({ fetchPage, pageSize: perPage, isMobile });

  const goToPage = useCallback((p: number) => {
    setSelectedIds(new Set());
    setPage(p);
  }, [setPage]);

  function openCreate() {
    setAddItemOpen(true);
  }

  function openEdit(item: ItemRecord) {
    setEditing(item);
    setDialogOpen(true);
  }

  async function handleDelete(item: ItemRecord) {
    setDeleteTarget(item);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteSettingsItem(deleteTarget.id);
      toast.success("ปิดใช้งานพัสดุแล้ว");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
    setDeleteTarget(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <ItemsFilterBar
        profiles={profiles}
        categories={categories}
        locations={locations}
        alerts={{ lowStock: 0, nearExpiry: 0, overdueMaintenance: 0 }}
        value={filter}
        onChange={handleFilterChange}
        resultCount={total}
        onScanQR={() => {}}
        hideScan
        hideAlertPicker
        allStatuses
        trailingAction={
          <div className="flex gap-2 w-full">
            {selectedIds.size > 0 && (
              <Button type="button" variant="outline" onClick={() => setPrintOpen(true)} className="h-11 sm:h-12 px-3 sm:px-4 rounded-xl gap-2 flex-1 justify-center">
                <QrCode className="size-5" />
                <span className="font-medium">พิมพ์ QR ({selectedIds.size})</span>
              </Button>
            )}
            <Button type="button" onClick={openCreate} className="h-11 sm:h-12 px-3 sm:px-4 rounded-xl gap-2 flex-1 justify-center">
              <Plus className="size-5" />
              <span className="font-medium">เพิ่มรายการ</span>
            </Button>
          </div>
        }
      />
      {/* Table — hero zone, most visual weight */}
      <div className="rounded-2xl border bg-card shadow-sm flex flex-col md:overflow-clip">
        <div className="hidden md:block">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="sticky top-0 z-10 bg-card border-b border-border shadow-[0_1px_3px_rgba(0,0,0,0.08)] [&>th]:h-8 [&>th]:py-0 [&>th]:text-xs [&>th]:text-muted-foreground">
              <TableHead className="w-[48px] pl-4">
                <Checkbox
                  checked={items.length > 0 && items.every((i) => selectedIds.has(i.id))}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedIds(new Set(items.map((i) => i.id)));
                    } else {
                      setSelectedIds(new Set());
                    }
                  }}
                  aria-label="เลือกทั้งหมด"
                />
              </TableHead>
              <TableHead className="w-28 px-2">รหัส</TableHead>
              <TableHead className="px-2">ชื่อพัสดุ</TableHead>
              <TableHead className="w-40 px-2 hidden xl:table-cell">หมวดหมู่</TableHead>
              <TableHead className="w-24 px-2 hidden xl:table-cell">หน่วย</TableHead>
              <TableHead className="w-44 px-2">สถานที่</TableHead>
              <TableHead className="w-32 px-2">สถานะ</TableHead>
              <TableHead className="w-[100px] px-2">จัดการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="py-12">
                <div className="flex flex-col items-center gap-3 text-center">
                  <Package className="h-8 w-8 text-muted-foreground/40" />
                  <div>
                    <p className="text-sm font-medium text-foreground">ไม่พบรายการพัสดุ</p>
                    <p className="text-xs text-muted-foreground mt-0.5">ลองปรับตัวกรองหรือเพิ่มรายการใหม่</p>
                  </div>
                </div>
              </TableCell></TableRow>
            ) : items.map((item) => (
              <React.Fragment key={item.id}>
                <TableRow
                  className={`group h-9 [&>td]:py-1 ${!item.isActive ? "opacity-50" : ""} ${item.trackIndividually && item._count.subItems > 1 ? "cursor-pointer hover:bg-muted/40" : ""}`}
                  onClick={(e) => {
                    if (!(e.target as HTMLElement).closest("input[type='checkbox'], button, a")) {
                      if (item.trackIndividually && item._count.subItems > 1) {
                        setExpandedRow(expandedRow === item.id ? null : item.id);
                      }
                    }
                  }}
                >
                  <TableCell className="pl-4">
                    <Checkbox
                      checked={selectedIds.has(item.id)}
                      onCheckedChange={(checked) => {
                        const next = new Set(selectedIds);
                        checked ? next.add(item.id) : next.delete(item.id);
                        setSelectedIds(next);
                      }}
                      aria-label={`เลือก ${item.code}`}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs px-2">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="block truncate">{item.code}</span>
                    </div>
                  </TableCell>
                  <TableCell className="px-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate min-w-0"><span className="font-medium">{item.name}</span>{item.nameEn && <span className="text-muted-foreground ml-1">({item.nameEn})</span>}</span>
                      {item.trackIndividually && item._count.subItems > 1 && <Badge variant="outline" className="shrink-0 h-4 gap-0.5 px-1 text-[10px] bg-orange-50 text-orange-700 border-orange-200"><Layers className="size-2.5" />{item._count.subItems}</Badge>}
                      {item.trackIndividually && item._count.subItems === 0 && <Badge variant="outline" className="shrink-0 h-4 px-1 text-[10px] bg-amber-50 text-amber-700 border-amber-200">ไม่มี SubItem</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="px-2 hidden xl:table-cell"><Badge variant="outline" className="px-1.5 py-0 leading-5 text-[11px]">{item.category.profile?.name ?? item.category.name}</Badge></TableCell>
                  <TableCell className="text-xs px-2 hidden xl:table-cell"><span className="block truncate">{item.issueUnit.name}</span></TableCell>
                  <TableCell className="text-xs px-2"><span className="block truncate">{item.location ? locationLabel(item.location) : "-"}</span></TableCell>
                  <TableCell className="px-2">
                    <span className={`inline-flex items-center rounded-full border px-1.5 py-0 leading-5 text-[11px] font-medium ${statusDisplay(item).cls}`}>
                      {statusDisplay(item).label}
                    </span>
                  </TableCell>
                  <TableCell className="px-2">
                    <TooltipProvider>
                      <div className="flex gap-1">
                        <Tooltip>
                          <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={() => openEdit(item)} aria-label="แก้ไข" />}>
                            <Pencil className="h-3.5 w-3.5" />
                          </TooltipTrigger>
                          <TooltipContent>แก้ไข</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={() => handleDelete(item)} aria-label="ลบ" />}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </TooltipTrigger>
                          <TooltipContent>ลบ</TooltipContent>
                        </Tooltip>
                      </div>
                    </TooltipProvider>
                  </TableCell>
                </TableRow>
                {expandedRow === item.id && item.trackIndividually && item._count.subItems > 1 && (
                  <TableRow key={`${item.id}-expand`}>
                    <TableCell colSpan={8} className="bg-muted/30 p-4">
                      <SubCodesManager itemId={item.id} itemCode={item.code} />
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
        </div>

        {/* Mobile: stacked cards (no horizontal scroll) */}
        <div className="divide-y divide-border md:hidden">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-4 py-3"><Skeleton className="h-12 w-full" /></div>
            ))
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Package className="h-8 w-8 text-muted-foreground/40" />
              <div>
                <p className="text-sm font-medium text-foreground">ไม่พบรายการพัสดุ</p>
                <p className="text-xs text-muted-foreground mt-0.5">ลองปรับตัวกรองหรือเพิ่มรายการใหม่</p>
              </div>
            </div>
          ) : items.map((item) => {
            const canExpand = item.trackIndividually && item._count.subItems > 1;
            return (
              <div key={item.id} className={!item.isActive ? "opacity-50" : ""}>
                <div className="flex items-start gap-2.5 px-4 py-2.5">
                  <Checkbox
                    checked={selectedIds.has(item.id)}
                    onCheckedChange={(checked) => {
                      const next = new Set(selectedIds);
                      checked ? next.add(item.id) : next.delete(item.id);
                      setSelectedIds(next);
                    }}
                    aria-label={`เลือก ${item.code}`}
                    className="mt-1"
                  />
                  <button
                    type="button"
                    onClick={() => canExpand && setExpandedRow(expandedRow === item.id ? null : item.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs text-muted-foreground">{item.code}</span>
                    </div>
                    <div className="mt-0.5 font-medium leading-tight flex flex-wrap items-center gap-1.5">
                      <span className="truncate">{item.name}</span>
                      {item.nameEn && <span className="text-muted-foreground"> ({item.nameEn})</span>}
                      {canExpand && <Badge variant="outline" className="gap-0.5 px-1.5 py-0 text-[11px] bg-orange-50 text-orange-700 border-orange-200"><Layers className="size-3" />{item._count.subItems}</Badge>}
                      {item.trackIndividually && item._count.subItems === 0 && <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-orange-200">ไม่มี SubItem</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{item.category.profile?.name ?? item.category.name}</span>
                      <span>· {item.issueUnit.name}</span>
                      {item.location && <span>· {locationLabel(item.location)}</span>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusDisplay(item).cls}`}>
                        {statusDisplay(item).label}
                      </span>
                    </div>
                  </button>
                  <div className="flex shrink-0 flex-col gap-1">
                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => openEdit(item)} aria-label="แก้ไข">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => handleDelete(item)} aria-label="ลบ">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                {expandedRow === item.id && canExpand && (
                  <div className="bg-muted/30 px-4 py-3">
                    <SubCodesManager itemId={item.id} itemCode={item.code} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Pagination — desktop numbered, mobile load-more */}
        {isMobile ? (
          items.length > 0 && (
            <Pagination
              mode="loadMore"
              shown={items.length}
              total={total}
              hasMore={hasNext}
              isLoading={isLoadingMore}
              onLoadMore={loadMore}
            />
          )
        ) : (
          <Pagination page={page} total={total} pageSize={perPage} onChange={goToPage} />
        )}
      </div>

      <EditItemDialog
        open={dialogOpen}
        itemId={editing?.id ?? null}
        onOpenChange={setDialogOpen}
        onSaved={refetch}
      />

      <QrPrintDialog
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        items={items.filter((i) => selectedIds.has(i.id)).map((i) => ({ code: i.code, name: i.name }))}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ปิดใช้งานพัสดุ</AlertDialogTitle>
            <AlertDialogDescription>
              ต้องการปิดใช้งาน &ldquo;{deleteTarget?.name}&rdquo; ({deleteTarget?.code}) ใช่หรือไม่? พัสดุจะหายไปจากระบบ แต่ยังเก็บประวัติทั้งหมดไว้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmDelete}>ปิดใช้งาน</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddItemModal
        open={addItemOpen}
        onClose={() => setAddItemOpen(false)}
        onCreated={() => {
          setAddItemOpen(false);
          refetch();
        }}
      />
    </div>
  );
}
