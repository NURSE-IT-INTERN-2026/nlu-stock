"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Package, QrCode, ShoppingCart, ArrowDownToLine,
  Flag, Undo2, Pencil,
  Hash, Tag, Layers, MapPin, ClipboardList, FolderTree,
  Printer, SearchX, Trash2,
} from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatSubCode, CONDITION_LABELS, STATUS_LABELS } from "@/lib/constants";

import { QrPrintDialog, type QrPrintItem } from "@/components/shared/qr-print-dialog";
import { ActionTile } from "@/components/items/action-tile";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { returnItem } from "@/lib/api";
import { useCart, buildCartItem } from "@/components/dispense/cart-context";

interface SubItemRecord {
  id: string;
  subCode: string;
  status: string;
  condition: string | null;
  serialNumber: string | null;
}

interface CategoryType { id: string; name: string; profile: { dispenseType: "CONSUMABLE" | "COUNT" | "ITEM"; name: string } | null }
interface LocationType { id: string; building: string; floor: string; room: string; detail: string | null }

interface ItemData {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  category: CategoryType;
  trackIndividually: boolean;
  status: string;
  issueUnit: { id: string; name: string };
  minThreshold: number;
  location: LocationType | null;
  imageUrl: string | null;
  description: string | null;
  storageRequirements: string | null;
  availableQty: number;
  totalQty: number;
  subItems: SubItemRecord[];
  lots: { id: string; lotNumber: string; expiryDate: string | null; remainingQty: number }[];
  images: string[];
}

interface Props {
  item: ItemData;
  userRole: string;
  onAdjust: () => void;
  onReportDamage: () => void;
  onReportStatus: (status: "LOST" | "DISPOSED") => void;
  onMoveLocation: () => void;
  onEdit: () => void;
  onRefresh: () => void;
}

export function ItemDetailOverview({ item, userRole, onAdjust, onReportDamage, onReportStatus, onMoveLocation, onEdit, onRefresh }: Props) {
  const canAct = userRole === "ADMIN" || userRole === "STAFF";
  const { addItem, items: cartItems } = useCart();
  const router = useRouter();

  // Add to dispense cart with the same smart defaults as the dispense grid
  // (FIFO lot / next sub-item), then toast with a shortcut to review the cart.
  const handleDispense = () => {
    const usedSubIds = new Set(cartItems.filter((c) => c.itemId === item.id).map((c) => c.subItemId));
    const result = buildCartItem(
      {
        id: item.id,
        code: item.code,
        name: item.name,
        imageUrl: item.imageUrl,
        categoryName: item.category.name,
        dispenseType: item.category.profile?.dispenseType ?? "COUNT",
        trackIndividually: item.trackIndividually,
        issueUnit: item.issueUnit.name,
        availableQty: item.availableQty,
        location: item.location
          ? { building: item.location.building, floor: item.location.floor, room: item.location.room, detail: item.location.detail }
          : null,
        lots: (item.lots ?? []).map((l) => ({ id: l.id, lotNumber: l.lotNumber, expiryDate: l.expiryDate, remainingQty: l.remainingQty })),
        subItems: item.subItems.map((s) => ({ id: s.id, subCode: s.subCode })),
      },
      usedSubIds,
    );
    if (!result.ok) {
      toast.error(result.reason === "no-sub" ? "ไม่มีหน่วยย่อยให้เบิกเพิ่ม" : "สต๊อกหมดแล้ว", { id: result.reason });
      return;
    }
    addItem(result.cartItem);
    toast.success(`เพิ่ม "${item.name}" เข้าตะกร้า`, {
      action: { label: "ดูตะกร้า", onClick: () => router.push("/cart") },
    });
  };

  const checkedOutSubs = useMemo(
    () => item.subItems.filter((s) => s.status === "ON_LOAN"),
    [item.subItems],
  );

  const statusSummary = useMemo(() => {
    if (!item.trackIndividually || item.subItems.length <= 1) return null;
    return item.subItems.reduce((acc, s) => {
      acc[s.status] = (acc[s.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [item.trackIndividually, item.subItems]);

  // ── QR ──
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [printOpen, setPrintOpen] = useState(false);

  const printItems: QrPrintItem[] = useMemo(
    () => [{ code: item.code, name: item.name }],
    [item.code, item.name],
  );

  useEffect(() => {
    QRCode.toDataURL(item.code, { width: 128, margin: 1 }).then(setQrDataUrl);
  }, [item.code]);

  // ── Handlers ──
  const handleReturn = async (subItemId: string) => {
    try {
      await returnItem(item.id, { subItemId });
      toast.success("คืนแล้ว"); onRefresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "คืนไม่สำเร็จ"); }
  };

  const handleReturnQty = async () => {
    const qty = prompt("ระบุจำนวนที่จะคืน");
    if (!qty) return;
    try {
      await returnItem(item.id, { quantity: parseInt(qty) });
      toast.success("คืนแล้ว"); onRefresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "คืนไม่สำเร็จ"); }
  };

  const locationStr = item.location
    ? [item.location.building, item.location.floor, item.location.room, item.location.detail].filter(Boolean).join(" / ")
    : "-";

  const detailRows: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; mono?: boolean }[] = [
    { icon: Hash, label: "รหัส", value: item.code, mono: true },
    { icon: Tag, label: "ประเภท", value: item.category.profile?.name ?? item.category.name },
    { icon: FolderTree, label: "หมวดหมู่", value: item.category.name },
    { icon: Layers, label: "หน่วยเบิก", value: item.issueUnit.name },
    { icon: MapPin, label: "ที่ตั้ง", value: locationStr },
    ...(item.storageRequirements
      ? [{ icon: ClipboardList, label: "การเก็บรักษา", value: item.storageRequirements }]
      : []),
    ...(item.trackIndividually && item.subItems.length === 1 && item.subItems[0].serialNumber
      ? [{ icon: Hash, label: "หมายเลขซีเรียล", value: item.subItems[0].serialNumber, mono: true }]
      : []),
    ...(item.trackIndividually && item.subItems.length === 1 && item.subItems[0].condition
      ? [{ icon: ClipboardList, label: "สภาพ", value: CONDITION_LABELS[item.subItems[0].condition] ?? item.subItems[0].condition }]
      : []),
  ];

  const qrBlock = (
    <div className="border-t border-border p-4 sm:p-5 grid grid-cols-[auto_1fr] gap-4 sm:gap-5 items-center bg-muted/20">
      <div className="size-20 sm:size-24 shrink-0 rounded-xl border border-border bg-card p-2 grid place-items-center">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt={`QR for ${item.code}`} className="size-full rounded-md" />
        ) : (
          <QrCode className="size-12 text-foreground animate-pulse" />
        )}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground">QR code</div>
        <div className="text-sm text-muted-foreground mt-1 truncate">สแกนเพื่อค้นหาพัสดุ</div>
        <div className="font-mono text-sm font-semibold mt-0.5 truncate">{item.code}</div>
        <button
          onClick={() => setPrintOpen(true)}
          className="inline-flex items-center gap-1.5 mt-2 text-xs px-2.5 py-1.5 rounded-md border border-border bg-card hover:bg-muted transition-colors"
        >
          <Printer className="size-3.5" /> พิมพ์
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-5 items-start">
        {/* ── Details ── */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <SectionHeader eyebrow="ข้อมูลพัสดุ" title="รายละเอียด" />
          <div className="divide-y divide-border">
            {detailRows.map((d, i) => {
              const Icon = d.icon;
              return (
                <div
                  key={i}
                  className={cn(
                    "grid grid-cols-[auto_1fr_auto] items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5",
                    i % 2 === 1 && "bg-muted/30",
                  )}
                >
                  <span className="size-8 shrink-0 rounded-lg bg-primary/5 border border-primary/10 grid place-items-center text-primary">
                    <Icon className="size-4" />
                  </span>
                  <span className="text-sm text-muted-foreground min-w-0 truncate">{d.label}</span>
                  <span className={cn("text-sm text-foreground font-medium text-right min-w-0 truncate", d.mono && "font-mono")}>
                    {d.value}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Manage (staff) or QR (viewer) ── */}
        {canAct ? (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <SectionHeader eyebrow="การจัดการ" title="จัดการสต็อก" />
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <ActionTile icon={ShoppingCart} label="เพิ่มเข้าตะกร้า" tone="primary" onClick={handleDispense} />
              <ActionTile icon={ArrowDownToLine} label="รับเข้า" tone="default" onClick={() => { window.location.href = `/receive?item=${item.id}`; }} />
              {item.trackIndividually ? (
                <DropdownMenu>
                  <DropdownMenuTrigger render={<ActionTile icon={Package} label="ปรับสต็อก" tone="default" />} />
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => onReportStatus("LOST")}>
                      <SearchX className="size-4" />สูญหาย
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onReportStatus("DISPOSED")}>
                      <Trash2 className="size-4" />ตัดจำหน่าย
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <ActionTile icon={Package} label="ปรับสต็อก" tone="default" onClick={onAdjust} />
              )}
              <ActionTile icon={Flag} label="แจ้งชำรุด" tone="destructive" onClick={onReportDamage} />
              <ActionTile icon={MapPin} label="ย้ายที่ตั้ง" tone="default" onClick={onMoveLocation} />
              <ActionTile icon={Pencil} label="แก้ไขข้อมูล" tone="default" onClick={onEdit} />
              {!item.trackIndividually && item.category.profile?.dispenseType !== "CONSUMABLE" && item.availableQty < item.totalQty && (
                <Button variant="outline" className="sm:col-span-2" onClick={handleReturnQty}>
                  <Undo2 className="h-4 w-4 mr-1" />คืนตามจำนวน
                </Button>
              )}
            </div>
            {qrBlock}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <SectionHeader title="QR code" />
            {qrBlock}
          </div>
        )}
      </section>

      {/* ── Status summary ── */}
      {statusSummary && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <SectionHeader eyebrow="พัสดุย่อย" title="สรุปสถานะ" />
          <div className="p-4 sm:p-5 flex flex-wrap gap-2">
            {Object.entries(statusSummary).map(([status, count]) => (
              <Badge key={status} variant={status === "AVAILABLE" ? "default" : "secondary"} className="text-xs">
                {STATUS_LABELS[status] ?? status.replace(/_/g, " ")}: {count}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* ── Checked out ── */}
      {canAct && checkedOutSubs.length > 0 && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <SectionHeader eyebrow="การเบิก" title={`เบิกออกแล้ว (${checkedOutSubs.length})`} />
          <div className="p-4 sm:p-5 space-y-2">
            {checkedOutSubs.map((sub) => (
              <div key={sub.id} className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-3 transition-colors hover:bg-muted/40">
                <span className="font-mono text-sm">{formatSubCode(item.code, sub.subCode)}</span>
                <Button size="sm" variant="outline" onClick={() => handleReturn(sub.id)}>
                  <Undo2 className="h-3.5 w-3.5 mr-1" />คืน
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <QrPrintDialog open={printOpen} onClose={() => setPrintOpen(false)} items={printItems} />
    </div>
  );
}

// ── Sub-components ──

function SectionHeader({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="px-4 sm:px-5 py-4 border-b border-border grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{eyebrow}</div>}
        <h2 className="text-lg font-semibold leading-tight mt-0.5 truncate">{title}</h2>
      </div>
      {right}
    </div>
  );
}
