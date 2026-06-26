"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Package, QrCode, ShoppingCart, ArrowDownToLine,
  Flag, Undo2,
  Hash, Tag, Layers, MapPin, ClipboardList, FolderTree,
  Printer,
} from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatSubCode } from "@/lib/constants";

import { QrPrintDialog, type QrPrintItem } from "@/components/shared/qr-print-dialog";
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
  onRefresh: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "พร้อมใช้",
  CHECKED_OUT: "เบิกออก",
  DAMAGED: "ชำรุด",
  UNDER_REPAIR: "อยู่ระหว่างซ่อม",
  LOST: "สูญหาย",
  PENDING_MAINTENANCE: "รอบำรุงรักษา",
  DISPOSED: "ตัดจำหน่าย",
};

const CONDITION_LABELS: Record<string, string> = {
  NEW: "ใหม่",
  OLD: "เก่า",
  USABLE: "ใช้งานได้",
  FAIR: "สภาพพอใช้",
  UNUSABLE: "ใช้งานไม่ได้",
  DAMAGED: "ชำรุด",
};

export function ItemDetailOverview({ item, userRole, onAdjust, onReportDamage, onRefresh }: Props) {
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
      action: { label: "ดูตะกร้า", onClick: () => router.push("/dispense/cart") },
    });
  };

  const checkedOutSubs = useMemo(
    () => item.subItems.filter((s) => s.status === "CHECKED_OUT"),
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
      toast.success("Returned"); onRefresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Return failed"); }
  };

  const handleReturnQty = async () => {
    const qty = prompt("Enter quantity to return:");
    if (!qty) return;
    try {
      await returnItem(item.id, { quantity: parseInt(qty) });
      toast.success("Returned"); onRefresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Return failed"); }
  };

  const locationStr = item.location
    ? [item.location.building, item.location.floor, item.location.room, item.location.detail].filter(Boolean).join(" / ")
    : "-";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-10">
      {/* ═══ LEFT COLUMN ═══ */}
      <div className="space-y-10">
        {/* ── Item info — flat divider rows (shown first: most-wanted on entry) ── */}
        <section className="animate-in fade-in slide-in-from-2 duration-300">
          <SectionHeading eyebrow="ข้อมูลพัสดุ" title="รายละเอียด" />
          <dl className="divide-y divide-border">
            <SpecRow icon={Hash} label="รหัส" value={<span className="font-mono">{item.code}</span>} />
            <SpecRow icon={Tag} label="ประเภท" value={item.category.profile?.name ?? item.category.name} />
            <SpecRow icon={FolderTree} label="หมวดหมู่" value={item.category.name} />
            <SpecRow icon={Layers} label="หน่วยเบิก" value={item.issueUnit.name} />
            <SpecRow icon={MapPin} label="ที่ตั้ง" value={locationStr} />
            {item.storageRequirements && (
              <SpecRow icon={ClipboardList} label="การเก็บรักษา" value={item.storageRequirements} />
            )}
            {item.trackIndividually && item.subItems.length === 1 && item.subItems[0].serialNumber && (
              <SpecRow icon={Hash} label="หมายเลขซีเรียล" value={<span className="font-mono">{item.subItems[0].serialNumber}</span>} />
            )}
            {item.trackIndividually && item.subItems.length === 1 && item.subItems[0].condition && (
              <SpecRow icon={ClipboardList} label="สภาพ" value={CONDITION_LABELS[item.subItems[0].condition] ?? item.subItems[0].condition} />
            )}
          </dl>
        </section>

        {/* ── Status summary ── */}
        {statusSummary && (
          <section className="animate-in fade-in slide-in-from-2 duration-300" style={{ animationDelay: "100ms" }}>
            <SectionHeading eyebrow="พัสดุย่อย" title="สรุปสถานะ" />
            <div className="flex flex-wrap gap-2">
              {Object.entries(statusSummary).map(([status, count]) => (
                <Badge key={status} variant={status === "AVAILABLE" ? "default" : "secondary"} className="text-xs">
                  {STATUS_LABELS[status] ?? status.replace(/_/g, " ")}: {count}
                </Badge>
              ))}
            </div>
          </section>
        )}

        {/* ── Checked out ── */}
        {canAct && checkedOutSubs.length > 0 && (
          <section className="animate-in fade-in slide-in-from-2 duration-300" style={{ animationDelay: "150ms" }}>
            <SectionHeading eyebrow="การเบิก" title={`เบิกออกแล้ว (${checkedOutSubs.length})`} />
            <div className="space-y-2">
              {checkedOutSubs.map((sub) => (
                <div key={sub.id} className="flex items-center justify-between rounded-xl border p-3 transition-colors hover:bg-muted/50">
                  <span className="font-mono text-sm">{formatSubCode(item.code, sub.subCode)}</span>
                  <Button size="sm" variant="outline" onClick={() => handleReturn(sub.id)}>
                    <Undo2 className="h-3.5 w-3.5 mr-1" />คืน
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ═══ RIGHT COLUMN ═══ */}
      <div className="space-y-10">
        {/* ── Quick actions ── */}
        {canAct && (
          <section className="animate-in fade-in slide-in-from-2 duration-300">
            <SectionHeading eyebrow="การจัดการ" title="จัดการสต็อก" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ActionTile icon={ShoppingCart} label="เพิ่มเข้าตะกร้า" tone="primary" onClick={handleDispense} />
              <ActionTile icon={ArrowDownToLine} label="รับเข้า" tone="default" onClick={() => { window.location.href = `/receive?item=${item.id}`; }} />
              <ActionTile icon={Package} label="ปรับสต็อก" tone="default" onClick={onAdjust} />
              <ActionTile icon={Flag} label="แจ้งชำรุด" tone="destructive" onClick={onReportDamage} />
            </div>

            {!item.trackIndividually && item.category.profile?.dispenseType !== "CONSUMABLE" && item.availableQty < item.totalQty && (
              <Button variant="outline" className="mt-3 w-full" onClick={handleReturnQty}>
                <Undo2 className="h-4 w-4 mr-1" />คืนตามจำนวน
              </Button>
            )}
          </section>
        )}

        {/* ── QR code ── */}
        <section className="animate-in fade-in slide-in-from-2 duration-300" style={{ animationDelay: "50ms" }}>
          <SectionHeading title="QR code" />
          <div className="flex gap-4 sm:gap-5 items-start">
            <div className="size-28 sm:size-36 rounded-2xl border border-border bg-card grid place-items-center shrink-0">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt={`QR for ${item.code}`} className="size-24 sm:size-32 rounded-lg" />
              ) : (
                <QrCode className="size-20 sm:size-24 text-foreground animate-pulse" />
              )}
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <div className="text-sm text-muted-foreground">สแกนเพื่อค้นหาพัสดุ</div>
              <div className="font-mono font-medium mt-1 truncate">{item.code}</div>
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setPrintOpen(true)}>
                  <Printer className="size-3.5" /> พิมพ์
                </Button>
              </div>
            </div>
          </div>
        </section>

      </div>

      <QrPrintDialog open={printOpen} onClose={() => setPrintOpen(false)} items={printItems} />
    </div>
  );
}

// ── Sub-components ──

function SectionHeading({ eyebrow, title, hint }: { eyebrow?: string; title: string; hint?: string }) {
  return (
    <div className="mb-4 flex items-end justify-between">
      <div>
        {eyebrow && <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</div>}
        <h2 className="text-lg font-semibold mt-0.5">{title}</h2>
      </div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function SpecRow({ icon: Icon, label, value }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 py-3.5">
      <span className="grid place-items-center size-8 rounded-lg bg-muted text-muted-foreground shrink-0">
        <Icon className="size-4" />
      </span>
      <dt className="text-sm text-muted-foreground shrink-0 md:w-32">{label}</dt>
      <dd className="text-sm font-medium ml-auto text-right min-w-0 truncate">{value}</dd>
    </div>
  );
}

function ActionTile({ icon: Icon, label, tone, onClick }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone: "primary" | "default" | "destructive";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0",
        tone === "primary" && "bg-primary text-primary-foreground border-primary hover:bg-primary/90",
        tone === "default" && "bg-card border-border hover:border-primary/40",
        tone === "destructive" && "bg-card border-border text-destructive hover:bg-destructive/5 hover:border-destructive/40",
      )}
    >
      <span
        className={cn(
          "grid place-items-center size-10 rounded-xl shrink-0",
          tone === "primary" && "bg-primary-foreground/15",
          tone === "default" && "bg-primary/10 text-primary",
          tone === "destructive" && "bg-destructive/10 text-destructive",
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="text-sm font-semibold">{label}</span>
    </button>
  );
}
