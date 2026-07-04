"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, XCircle, Undo2, Package, Clock, Wrench, Info, Hash, Tag, FolderTree, Layers, MapPin, ClipboardList, QrCode, Image as ImageIcon, ShoppingCart, Flag, ArrowDownToLine, Pencil, SearchX, Trash2 } from "lucide-react";
import { pic } from "@/lib/image";
import QRCode from "qrcode";
import { toast } from "sonner";
import { useSession } from "@/components/layout/auth-guard";
import { usePageHeader } from "@/components/layout/page-header-context";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, locationLabel, formatSubCode } from "@/lib/constants";
import { getSubItem, getSubItems, returnItem, updateSubItem } from "@/lib/api";
import { ActionTile } from "@/components/items/action-tile";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MaintenanceFormDialog } from "@/components/items/maintenance-form-dialog";
import { ReportStatusDialog } from "@/components/items/report-status-dialog";
import { MoveLocationDialog } from "@/components/items/move-location-dialog";
import { EditItemDialog } from "@/components/shared/edit-item-dialog";
import { ItemDetailMedia } from "@/components/items/item-detail-media";

interface ParentItem {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  trackIndividually: boolean;
  category: { id: string; name: string; profile: { name: string } | null };
  location: { id: string; building: string; floor: string; room: string; detail: string | null } | null;
  issueUnit: { id: string; name: string };
}

interface DispenseRecord {
  id: string;
  quantity: number;
  dispensedAt: string;
  returnedAt: string | null;
  usageType: string | null;
  usageNote: string | null;
  notes: string | null;
  staff: { name: string };
}

interface StatusLog {
  id: string;
  previousStatus: string;
  newStatus: string;
  reason: string | null;
  changedAt: string;
  imageUrl: string | null;
  changer: { name: string };
}

interface MaintenanceRecord {
  id: string;
  type: string;
  result: string;
  performedAt: string;
  issue: string | null;
  description: string | null;
  cost: number | null;
  performer: { name: string };
  attachmentUrls: string[];
}

interface SubItemData {
  id: string;
  subCode: string;
  name: string | null;
  status: string;
  condition: string | null;
  serialNumber: string | null;
  notes: string | null;
  imageUrl: string | null;
  images: string[];
  createdAt: string;
  updatedAt: string;
  item: ParentItem;
  dispenseRecords: DispenseRecord[];
  statusLogs: StatusLog[];
  maintenanceRecords: MaintenanceRecord[];
}

const TYPE_LABELS: Record<string, string> = { PREVENTIVE: "ป้องกัน", CORRECTIVE: "ซ่อมแก้ไข" };
const RESULT_LABELS: Record<string, string> = { AVAILABLE: "พร้อมใช้งาน", NEEDS_MORE_REPAIR: "ต้องซ่อมเพิ่ม", DISPOSED: "จำหน่าย" };
const CONDITION_LABELS: Record<string, string> = { NEW: "ใหม่", OLD: "เก่า", USABLE: "ใช้ได้", FAIR: "พอใช้", UNUSABLE: "ใช้ไม่ได้", DAMAGED: "ชำรุด" };
const STATUS_DOT: Record<string, string> = { AVAILABLE: "bg-success", ON_LOAN: "bg-blue-500", DAMAGED: "bg-destructive", UNDER_REPAIR: "bg-warning", LOST: "bg-destructive", DISPOSED: "bg-muted-foreground", PENDING_MAINTENANCE: "bg-warning" };

type TabKey = "overview" | "media" | "subcodes" | "history" | "maintenance";

export default function SubItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useSession();
  const itemId = params.id as string;
  const subId = params.subId as string;

  const [sub, setSub] = useState<SubItemData | null>(null);
  const [loading, setLoading] = useState(true);
  const [returning, setReturning] = useState(false);
  const [tab, setTab] = useState<TabKey>("overview");
  const [maintOpen, setMaintOpen] = useState(false);
  const [statusAction, setStatusAction] = useState<"DAMAGED" | "LOST" | "DISPOSED" | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [siblings, setSiblings] = useState<{ id: string; subCode: string; status: string }[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState("");

  const canAct = user?.role === "ADMIN" || user?.role === "STAFF";

  const fetchSub = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSubItem(itemId, subId);
      setSub(data as SubItemData);
    } catch {}
    setLoading(false);
  }, [itemId, subId]);

  useEffect(() => { fetchSub(); }, [fetchSub]);

  const { setDetail } = usePageHeader();
  useEffect(() => {
    setDetail(sub ? formatSubCode(sub.item.code, sub.subCode) : null);
    return () => setDetail(null);
  }, [sub, setDetail]);

  useEffect(() => {
    if (sub) QRCode.toDataURL(formatSubCode(sub.item.code, sub.subCode), { width: 128, margin: 1 }).then(setQrDataUrl).catch(() => {});
  }, [sub]);

  // Sibling copies of the same parent item — for the "รหัสย่อย" tab.
  useEffect(() => {
    if (sub) {
      getSubItems(sub.item.id)
        .then((d) => setSiblings((d as { id: string; subCode: string; status: string }[]).map((s) => ({ id: s.id, subCode: s.subCode, status: s.status }))))
        .catch(() => {});
    }
  }, [sub?.item.id]);

  const activeDispense = useMemo(
    () => sub?.dispenseRecords.find((d) => d.returnedAt === null) ?? null,
    [sub],
  );

  const timeline = useMemo(() => {
    if (!sub) return [];
    const dispense = sub.dispenseRecords.map((d) => ({ kind: "dispense" as const, at: d.dispensedAt, record: d }));
    const status = sub.statusLogs.map((l) => ({ kind: "status" as const, at: l.changedAt, record: l }));
    return [...dispense, ...status].sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
  }, [sub]);

  const tabs: { key: TabKey; label: string; icon: typeof Info }[] = useMemo(() => [
    { key: "overview", label: "ข้อมูลทั่วไป", icon: Info },
    ...(!!(sub?.imageUrl || (sub?.images?.length ?? 0) > 0) || !!canAct ? [{ key: "media" as const, label: "รูปภาพ", icon: ImageIcon }] : []),
    ...(siblings.length > 1 ? [{ key: "subcodes" as const, label: `รหัสย่อย (${siblings.length})`, icon: Hash }] : []),
    { key: "history", label: "ประวัติ", icon: Clock },
    { key: "maintenance", label: `การซ่อมบำรุง${sub?.maintenanceRecords.length ? ` (${sub.maintenanceRecords.length})` : ""}`, icon: Wrench },
  ], [sub?.imageUrl, sub?.images?.length, sub?.maintenanceRecords.length, siblings.length, canAct]);

  const onReturn = async () => {
    if (!sub) return;
    setReturning(true);
    try {
      await returnItem(sub.item.id, { subItemId: sub.id });
      toast.success("คืนพัสดุย่อยแล้ว");
      await fetchSub();
    } catch {
      toast.error("คืนไม่สำเร็จ");
    } finally {
      setReturning(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!sub) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 animate-in fade-in duration-300">
        <div className="grid place-items-center size-16 rounded-2xl bg-muted text-muted-foreground">
          <XCircle className="size-8" />
        </div>
        <p className="text-muted-foreground font-medium">ไม่พบพัสดุย่อย</p>
        <Button variant="outline" onClick={() => router.push("/items")}>
          <ArrowLeft className="h-4 w-4 mr-1" />กลับสู่รายการพัสดุ
        </Button>
      </div>
    );
  }

  const fullCode = formatSubCode(sub.item.code, sub.subCode);
  const cover = sub.imageUrl ?? sub.images?.[0] ?? null;
  const fmtDate = (s: string) => new Date(s).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
  const fmtDay = (s: string) => new Date(s).toLocaleDateString("th-TH");

  return (
    <div>
      <div className="max-w-5xl">
        {/* ── Cover + Title ── */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-8 pb-6 border-b border-border">
          <div className="relative w-full sm:w-64 aspect-[4/3] rounded-2xl overflow-hidden border border-border bg-muted shadow-sm shrink-0">
            <img src={cover ?? pic(fullCode, 640, 480)} alt={sub.name ?? fullCode} className="size-full object-cover" />
            <span className="absolute bottom-2 left-2 text-[10px] uppercase tracking-wider font-semibold bg-background/90 px-2 py-0.5 rounded-full backdrop-blur-sm">Cover</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-2">
              <span className="inline-flex items-center rounded-full border px-2 py-0.5 bg-background">{sub.item.category.profile?.name ?? sub.item.category.name}</span>
              <span>·</span>
              <span className="font-mono">{fullCode}</span>
              <span className="inline-flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", STATUS_DOT[sub.status] || "bg-muted-foreground")} />
                <span>{STATUS_LABELS[sub.status] ?? sub.status.replace(/_/g, " ")}</span>
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-balance">{sub.name ?? sub.item.name}</h1>
            {sub.item.nameEn && <p className="text-sm text-muted-foreground mt-1">{sub.item.nameEn}</p>}
            {(sub.condition || sub.serialNumber) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {sub.condition && (
                  <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium bg-muted/50 text-muted-foreground border-border">
                    สภาพ: {CONDITION_LABELS[sub.condition] ?? sub.condition}
                  </span>
                )}
                {sub.serialNumber && (
                  <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium bg-muted/50 text-muted-foreground border-border font-mono">
                    S/N: {sub.serialNumber}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="mt-6 flex items-center gap-1 border-b border-border">
          {tabs.map((t) => (
            <TabBtn key={t.key} active={tab === t.key} onClick={() => setTab(t.key)} icon={t.icon}>
              {t.label}
            </TabBtn>
          ))}
        </div>

        {/* ── Tab content ── */}
        <div className="mt-8 space-y-6 animate-in fade-in duration-200" key={tab}>
          {tab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-10">
              {/* ═══ LEFT ═══ */}
              <div className="space-y-10">
                <section className="animate-in fade-in slide-in-from-2 duration-300">
                  <SectionHeading eyebrow="ข้อมูลพัสดุย่อย" title="รายละเอียด" />
                  <dl className="divide-y divide-border">
                    <SpecRow icon={Hash} label="รหัส" value={<span className="font-mono">{fullCode}</span>} />
                    <SpecRow icon={Tag} label="ชื่อ" value={sub.name ?? sub.item.name} />
                    <SpecRow icon={FolderTree} label="ประเภท" value={sub.item.category.profile?.name ?? sub.item.category.name} />
                    <SpecRow icon={Layers} label="หมวดหมู่" value={sub.item.category.name} />
                    <SpecRow icon={Hash} label="สถานะ" value={STATUS_LABELS[sub.status] ?? sub.status.replace(/_/g, " ")} />
                    {sub.condition && (
                      <SpecRow icon={ClipboardList} label="สภาพ" value={CONDITION_LABELS[sub.condition] ?? sub.condition} />
                    )}
                    {sub.serialNumber && (
                      <SpecRow icon={Hash} label="หมายเลขซีเรียล" value={<span className="font-mono">{sub.serialNumber}</span>} />
                    )}
                    <SpecRow icon={Layers} label="หน่วยเบิก" value={sub.item.issueUnit.name} />
                    <SpecRow icon={MapPin} label="ที่ตั้ง" value={sub.item.location ? locationLabel(sub.item.location) : "-"} />
                    <SpecRow icon={Clock} label="วันที่สร้าง" value={fmtDay(sub.createdAt)} />
                    {sub.notes && (
                      <SpecRow icon={ClipboardList} label="หมายเหตุ" value={sub.notes} />
                    )}
                  </dl>
                </section>

                {sub.status === "ON_LOAN" && (
                  <section className="animate-in fade-in slide-in-from-2 duration-300">
                    <SectionHeading eyebrow="การเบิก" title="กำลังยืมอยู่" />
                    <div className="rounded-xl border border-blue-200 bg-blue-50/50 dark:bg-blue-950/30 p-4 flex items-center justify-between gap-3">
                      <div className="text-sm">
                        <span className="text-muted-foreground">ผู้ยืม</span>
                        {activeDispense && <span className="ml-2 text-blue-600 font-medium">→ {activeDispense.staff.name}</span>}
                      </div>
                      {canAct && (
                        <Button size="sm" variant="outline" onClick={onReturn} disabled={returning}>
                          <Undo2 className="h-3.5 w-3.5 mr-1" />คืน
                        </Button>
                      )}
                    </div>
                  </section>
                )}

                <section className="animate-in fade-in slide-in-from-2 duration-300">
                  <SectionHeading eyebrow="พัสดุหลัก" title="สังกัด" />
                  <button
                    type="button"
                    onClick={() => router.push(`/items/${sub.item.code}`)}
                    className="w-full text-left rounded-xl border p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Package className="size-4 text-muted-foreground" />
                      <span className="font-medium">{sub.item.name}{sub.item.nameEn && <span className="text-muted-foreground ml-1">({sub.item.nameEn})</span>}</span>
                      <span className="ml-auto font-mono text-xs text-muted-foreground">{sub.item.code}</span>
                    </div>
                  </button>
                </section>
              </div>

              {/* ═══ RIGHT ═══ */}
              <div className="space-y-10">
                {canAct && (
                  <section className="animate-in fade-in slide-in-from-2 duration-300">
                    <SectionHeading eyebrow="การจัดการ" title="จัดการสต็อก" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <ActionTile icon={ShoppingCart} label="เพิ่มเข้าตะกร้า" tone="primary" onClick={() => router.push(`/dispense?item=${sub.item.id}`)} />
                      <ActionTile icon={ArrowDownToLine} label="รับเข้า" tone="default" onClick={() => router.push(`/receive?item=${sub.item.id}`)} />
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<ActionTile icon={Package} label="ปรับสต็อก" tone="default" />} />
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem onClick={() => setStatusAction("LOST")}>
                            <SearchX className="size-4" />สูญหาย
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setStatusAction("DISPOSED")}>
                            <Trash2 className="size-4" />ตัดจำหน่าย
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <ActionTile icon={Flag} label="แจ้งชำรุด" tone="destructive" onClick={() => setStatusAction("DAMAGED")} />
                      <ActionTile icon={MapPin} label="ย้ายที่ตั้ง" tone="default" onClick={() => setMoveOpen(true)} />
                      <ActionTile icon={Pencil} label="แก้ไขข้อมูล" tone="default" onClick={() => setEditOpen(true)} />
                    </div>
                  </section>
                )}

                <section className="animate-in fade-in slide-in-from-2 duration-300">
                  <SectionHeading title="QR code" />
                  <div className="flex gap-5 items-start">
                    <div className="size-36 rounded-2xl border border-border bg-card grid place-items-center shrink-0">
                      {qrDataUrl ? (
                        <img src={qrDataUrl} alt={`QR for ${fullCode}`} className="size-32 rounded-lg" />
                      ) : (
                        <QrCode className="size-24 text-foreground animate-pulse" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pt-1">
                      <div className="text-sm text-muted-foreground">สแกนเพื่อค้นหาพัสดุย่อย</div>
                      <div className="font-mono font-medium mt-1 break-all">{fullCode}</div>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          )}

          {tab === "media" && (
            <ItemDetailMedia
              item={{ id: sub.id, imageUrl: sub.imageUrl, images: sub.images }}
              canAct={!!canAct}
              onRefresh={fetchSub}
              onSave={(id, data) => updateSubItem(id, data)}
            />
          )}

          {tab === "subcodes" && (
            <div className="rounded-xl border p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="font-medium">รหัสย่อย ({siblings.length})</h2>
                <Button size="sm" variant="outline" onClick={() => router.push(`/items/${sub.item.code}`)}>
                  <Package className="h-3.5 w-3.5 mr-1" />พัสดุหลัก
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {siblings.map((s) => {
                  const isCurrent = s.id === sub.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => router.push(`/items/${sub.item.code}/sub/${s.subCode}`)}
                      className={cn(
                        "flex flex-col items-start rounded-lg border p-2.5 text-left transition-colors",
                        isCurrent ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                      )}
                    >
                      <span className="font-mono text-sm">{formatSubCode(sub.item.code, s.subCode)}</span>
                      <span className="text-[11px] text-muted-foreground mt-0.5">{STATUS_LABELS[s.status] ?? s.status.replace(/_/g, " ")}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "history" && (
            <div className="rounded-xl border p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="size-4 text-muted-foreground" />
                <h2 className="font-medium">ประวัติ</h2>
              </div>
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">ไม่มีประวัติ</p>
              ) : (
                <ol className="relative border-l border-border ml-1.5 space-y-4">
                  {timeline.map((e) => (
                    <li key={`${e.kind}-${e.record.id}`} className="ml-4 relative">
                      <span className="absolute -left-[1.55rem] top-1 size-2.5 rounded-full bg-primary/60 ring-4 ring-background" />
                      {e.kind === "dispense" ? (
                        <div className="text-sm space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">เบิกออก</span>
                            <span className="text-muted-foreground">→ {e.record.staff.name}</span>
                            {e.record.returnedAt && (
                              <span className="rounded-full bg-emerald-100 text-emerald-700 px-1.5 text-[10px]">คืนแล้ว</span>
                            )}
                          </div>
                          {e.record.usageNote && <p className="text-muted-foreground">{e.record.usageNote}</p>}
                          <p className="text-xs text-muted-foreground">{fmtDate(e.at)}</p>
                        </div>
                      ) : (
                        <div className="text-sm space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">
                              {STATUS_LABELS[e.record.previousStatus] ?? e.record.previousStatus}
                              {" → "}
                              {STATUS_LABELS[e.record.newStatus] ?? e.record.newStatus}
                            </span>
                            <span className="text-muted-foreground">โดย {e.record.changer.name}</span>
                          </div>
                          {e.record.reason && <p className="text-muted-foreground">{e.record.reason}</p>}
                          {e.record.imageUrl && <img src={e.record.imageUrl} alt="" className="mt-1 size-16 rounded-md object-cover border" />}
                          <p className="text-xs text-muted-foreground">{fmtDate(e.at)}</p>
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {tab === "maintenance" && (
            <div className="rounded-xl border p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="font-medium">ประวัติการซ่อมบำรุง</h2>
                {canAct && (
                  <Button size="sm" onClick={() => setMaintOpen(true)}>
                    <Wrench className="h-3.5 w-3.5 mr-1" />บันทึกการซ่อม
                  </Button>
                )}
              </div>
              {sub.maintenanceRecords.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">ยังไม่มีบันทึกการซ่อมบำรุง</p>
              ) : (
                <div className="space-y-2">
                  {sub.maintenanceRecords.map((rec, idx) => (
                    <div key={rec.id} className={cn("p-3 rounded-lg border", idx % 2 === 1 && "bg-muted/20")}>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">{TYPE_LABELS[rec.type] ?? rec.type}</Badge>
                        <Badge variant={rec.result === "AVAILABLE" ? "default" : "secondary"} className="text-xs">
                          {RESULT_LABELS[rec.result] ?? rec.result}
                        </Badge>
                        <span className="text-xs text-muted-foreground ml-auto">{fmtDay(rec.performedAt)}</span>
                      </div>
                      {rec.issue && <p className="text-sm font-medium">{rec.issue}</p>}
                      {rec.description && <p className="text-sm text-muted-foreground">{rec.description}</p>}
                      <div className="text-xs text-muted-foreground mt-1">
                        โดย {rec.performer.name}{rec.cost != null ? ` · ฿${rec.cost.toLocaleString()}` : ""}
                      </div>
                      {rec.attachmentUrls.length > 0 && (
                        <div className="flex gap-2 mt-1">
                          {rec.attachmentUrls.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">
                              {url.endsWith(".pdf") ? `PDF ${i + 1}` : `รูป ${i + 1}`}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <MaintenanceFormDialog
        open={maintOpen}
        onOpenChange={setMaintOpen}
        itemId={sub.item.id}
        itemLabel={sub.item.name}
        subItemId={sub.id}
        subItemLabel={fullCode}
        onSuccess={fetchSub}
      />

      <ReportStatusDialog
        open={statusAction !== null}
        onOpenChange={(o) => { if (!o) setStatusAction(null); }}
        itemId={sub.item.id}
        itemCode={sub.item.code}
        status={statusAction ?? "DAMAGED"}
        trackIndividually
        subItems={[{ id: sub.id, subCode: sub.subCode, status: sub.status }]}
        onSuccess={fetchSub}
      />

      <MoveLocationDialog
        key={moveOpen ? "open" : "closed"}
        open={moveOpen}
        onOpenChange={setMoveOpen}
        items={[{ id: sub.item.id, code: sub.item.code, name: sub.item.name }]}
        currentLocationId={sub.item.location?.id ?? null}
        onSuccess={fetchSub}
      />

      <EditItemDialog
        open={editOpen}
        itemId={sub.item.id}
        onOpenChange={setEditOpen}
        onSaved={fetchSub}
      />
    </div>
  );
}

function TabBtn({
  active, onClick, icon: Icon, children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
      {children}
      {active && (
        <motion.span
          layoutId="item-detail-tab"
          transition={{ type: "spring", stiffness: 450, damping: 35 }}
          className="absolute -bottom-px left-2 right-2 h-0.5 bg-primary rounded-full"
        />
      )}
    </button>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <div className="mb-4">
      {eyebrow && <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</div>}
      <h2 className="text-lg font-semibold mt-0.5">{title}</h2>
    </div>
  );
}

function SpecRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-4 py-3.5">
      <span className="grid place-items-center size-8 rounded-lg bg-muted text-muted-foreground shrink-0">
        <Icon className="size-4" />
      </span>
      <dt className="text-sm text-muted-foreground md:w-32">{label}</dt>
      <dd className="text-sm font-medium md:ml-auto md:text-right">{value}</dd>
    </div>
  );
}
