"use client";

import { Badge } from "@/components/ui/badge";
import { fmtDate, TH_DATE, TH_DATETIME, TH_DAY } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useMemo } from "react";
import {
  Package, QrCode, ArrowDownToLine, Home,
  Flag, Undo2, Pencil,
  Hash, Tag, Layers, ClipboardList, FolderTree,
  Printer, SearchX, Trash2, ClipboardCheck, CalendarClock, CheckCircle2, Wrench,
} from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { countCycleFor } from "@/lib/stock-count";
import { formatSubCode, qrUrl, CONDITION_LABELS, STATUS_LABELS, type ItemStatus } from "@/lib/constants";
import { canManageStock } from "@/lib/roles";

import { QrPrintDialog, type QrPrintItem } from "@/components/shared/qr-print-dialog";
import { ActionTile } from "@/components/items/action-tile";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { returnItem } from "@/lib/api";
import { StationInRoomDialog } from "@/components/dispense/station-in-room-dialog";
import { DistributionTable, distributionTotal, type DistributionRow } from "@/components/items/distribution-table";
import { RecoverDamageDialog, type OpenDamage } from "@/components/items/recover-damage-dialog";

interface SubItemRecord {
  id: string;
  subCode: string;
  name: string | null;
  status: ItemStatus;
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
  status: ItemStatus;
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
  countCycleMonths: number | null;
  lastCountDate: string | null;
  nextCountDate: string | null;
  images: string[];
  /** Derived server-side (lib/distribution.ts) — where the stock actually is. */
  distribution?: DistributionRow[];
  /** Open แจ้งชำรุด bookings awaiting repair — the rows behind the ชำรุด figure. */
  openDamage?: OpenDamage[];
}

interface Props {
  item: ItemData;
  userRole: string;
  onAdjust: () => void;
  onReportDamage: () => void;
  onReportStatus: (status: "AVAILABLE" | "DAMAGED" | "LOST" | "DISPOSED") => void;
  onEdit: () => void;
  onRefresh: () => void;
}

export function ItemDetailOverview({ item, userRole, onAdjust, onReportDamage, onReportStatus, onEdit, onRefresh }: Props) {
  const canAct = canManageStock(userRole);
  const [stationOpen, setStationOpen] = useState(false);
  const [recoverOpen, setRecoverOpen] = useState(false);
  const openDamage = item.openDamage ?? [];
  // COUNT durable (non-tracked, non-consumable = DUR) → eligible for "นำไปใช้งาน".
  const isCountDurable = !item.trackIndividually && (item.category.profile?.dispenseType ?? "COUNT") !== "CONSUMABLE";

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
    QRCode.toDataURL(qrUrl(item.code), { width: 128, margin: 1 }).then(setQrDataUrl);
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

  // Blank cycle = the profile default (3 months for consumables, 12 otherwise).
  const countCycle = countCycleFor(item.category.profile?.dispenseType ?? "COUNT", item.countCycleMonths);

  // สถานที่จัดเก็บ used to be a row here. One line can only name the item's registered
  // room, which is wrong the moment any of the stock is stationed elsewhere — replaced by
  // DistributionTable below, which lists every place the stock actually is.
  const detailRows: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; mono?: boolean }[] = [
    { icon: Hash, label: "รหัส", value: item.code, mono: true },
    { icon: Tag, label: "ประเภท", value: item.category.profile?.name ?? item.category.name },
    { icon: FolderTree, label: "หมวดหมู่", value: item.category.name },
    { icon: Layers, label: "หน่วยเบิก", value: item.issueUnit.name },
    ...(item.storageRequirements
      ? [{ icon: ClipboardList, label: "การเก็บรักษา", value: item.storageRequirements }]
      : []),
    { icon: ClipboardCheck, label: "รอบตรวจนับ", value: `ทุก ${countCycle} เดือน` },
    {
      icon: CalendarClock,
      label: "ตรวจนับครั้งถัดไป",
      value: item.nextCountDate
        ? fmtDate(item.nextCountDate, TH_DATE)
        : "ยังไม่เคยตรวจนับ",
    },
    ...(item.trackIndividually && item.subItems.length === 1 && item.subItems[0].serialNumber
      ? [{ icon: Hash, label: "หมายเลขซีเรียล", value: item.subItems[0].serialNumber, mono: true }]
      : []),
    ...(item.trackIndividually && item.subItems.length === 1 && item.subItems[0].condition
      ? [{ icon: ClipboardList, label: "สภาพ", value: CONDITION_LABELS[item.subItems[0].condition] ?? item.subItems[0].condition }]
      : []),
  ];

  // withPrint=false for staff — they get a พิมพ์ QR tile in the manage grid instead,
  // and two identical buttons in one card is just noise.
  const qrBlock = (withPrint: boolean) => (
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
        {withPrint && (
          <button
            onClick={() => setPrintOpen(true)}
            className="inline-flex items-center gap-1.5 mt-2 text-xs px-2.5 py-1.5 rounded-md border border-border bg-card hover:bg-muted transition-colors"
          >
            <Printer className="size-3.5" /> พิมพ์
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-5 items-start">
        {/* Left column reads as one thought, top down: what this thing is, then where it is.
            Actions stay on the right, unmoved. The location table lived full-width above this
            section before — at 976px its สถานที่ column stretched to 734px for names needing
            ~180px, so the eye had to cross ~550px of nothing to pair a room with its count.
            Here it gets ~270px: snug, and long room names still fit without truncating.
            Below lg the grid collapses to DOM order, so on a phone this reads
            ข้อมูลพัสดุ → ตำแหน่ง → จัดการ. That reordering is deliberate: the stretch problem
            doesn't exist at 375px, and confirming which item you scanned before reading where
            it sits is the right order on a phone too. */}
        <div className="space-y-5 min-w-0">
          {/* ── Details ── */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <SectionHeader title="ข้อมูลพัสดุ" />
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

          {/* ── Where the stock is ── */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <SectionHeader
              title="ตำแหน่งปัจจุบันของพัสดุ"
              // Summed from the rows, never from totalQty, so the headline can't disagree
              // with the table under it (they differ by design for consumables, whose
              // dispensed stock is used up rather than sitting somewhere).
              right={
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  ทั้งหมด{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    {distributionTotal(item.distribution ?? []).toLocaleString("th-TH")}
                  </span>{" "}
                  {item.issueUnit.name}
                </span>
              }
            />
            <DistributionTable rows={item.distribution ?? []} unit={item.issueUnit.name} />
          </div>
        </div>

        {/* ── Manage (staff) or QR (viewer) ── */}
        {canAct ? (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <SectionHeader title="จัดการพัสดุ" />
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {isCountDurable && (
                <ActionTile icon={Home} label="นำไปใช้งาน" tone="default" onClick={() => setStationOpen(true)} disabled={item.availableQty <= 0} />
              )}
              <ActionTile icon={ArrowDownToLine} label="รับเข้าใหม่" tone="default" onClick={() => { window.location.href = `/receive?item=${item.id}`; }} />
              {/* One tile for every qty correction — the dialog asks WHAT happened
                  (ตรวจนับ / ตัดจำหน่าย / สูญหาย / อื่นๆ) and picks the input from that.
                  Tracked items still book discrepancies per piece, so they keep a menu. */}
              {item.trackIndividually ? (
                <DropdownMenu>
                  <DropdownMenuTrigger render={<ActionTile icon={Package} label="ปรับสต็อก" tone="default" />} />
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={onAdjust}>
                      <ClipboardCheck className="size-4" />ตรวจนับตามรอบ
                    </DropdownMenuItem>
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
              {isCountDurable ? (
                // DUR: damage is usually partial (ตัดจำนวน) but the whole lot can also be
                // pulled from service — that one sets Item.status, which recompute now keeps.
                <DropdownMenu>
                  <DropdownMenuTrigger render={<ActionTile icon={Flag} label="แจ้งชำรุด" tone="destructive" />} />
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={onReportDamage}>
                      <Package className="size-4" />ตัดจำนวนที่ชำรุด
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onReportStatus("DAMAGED")}>
                      <Flag className="size-4" />ทั้งรายการชำรุด
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <ActionTile icon={Flag} label="แจ้งชำรุด" tone="destructive" onClick={onReportDamage} />
              )}
              {openDamage.length > 0 && (
                <ActionTile icon={Wrench} label="รับคืนจากซ่อม" tone="default" onClick={() => setRecoverOpen(true)} />
              )}
              {isCountDurable && item.status !== "AVAILABLE" && item.status !== "ON_LOAN" && (
                <ActionTile icon={CheckCircle2} label="กลับพร้อมใช้งาน" tone="default" onClick={() => onReportStatus("AVAILABLE")} />
              )}
              <ActionTile icon={Pencil} label="แก้ไขข้อมูล" tone="default" onClick={onEdit} />
              <ActionTile icon={Printer} label="พิมพ์ QR Code" tone="default" onClick={() => setPrintOpen(true)} />
              {!item.trackIndividually && item.category.profile?.dispenseType !== "CONSUMABLE" && item.availableQty < item.totalQty && (
                <Button variant="outline" className="sm:col-span-2" onClick={handleReturnQty}>
                  <Undo2 className="h-4 w-4 mr-1" />คืนตามจำนวน
                </Button>
              )}
            </div>
            {qrBlock(false)}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <SectionHeader title="QR code" />
            {qrBlock(true)}
          </div>
        )}
      </section>

      {/* ── Status summary ── */}
      {statusSummary && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <SectionHeader eyebrow="พัสดุย่อย" title="สรุปสถานะ" />
          <div className="p-4 sm:p-5 flex flex-wrap gap-2">
            {(Object.entries(statusSummary) as [ItemStatus, number][]).map(([status, count]) => (
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
                <div className="min-w-0">
                  {sub.name && <p className="text-sm truncate">{sub.name}</p>}
                  <span className="font-mono text-xs text-muted-foreground">{formatSubCode(item.code, sub.subCode)}</span>
                </div>
                <Button size="sm" variant="outline" onClick={() => handleReturn(sub.id)}>
                  <Undo2 className="h-3.5 w-3.5 mr-1" />คืน
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <QrPrintDialog open={printOpen} onClose={() => setPrintOpen(false)} items={printItems} />
      {isCountDurable && (
        <StationInRoomDialog open={stationOpen} onOpenChange={setStationOpen} itemId={item.id} itemCode={item.code} itemName={item.name} availableQty={item.availableQty} issueUnit={item.issueUnit.name} onSuccess={onRefresh} />
      )}
      <RecoverDamageDialog open={recoverOpen} onOpenChange={setRecoverOpen} itemId={item.id} unit={item.issueUnit.name} rows={openDamage} onSuccess={onRefresh} />
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
