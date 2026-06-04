"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Package, QrCode, AlertTriangle, ShoppingCart, ArrowDownToLine,
  Flag, Undo2, Upload, X, ImageIcon, ImagePlus,
  Hash, Tag, Layers, MapPin, Calendar, ClipboardList,
  Printer, CheckCircle2, ChevronLeft, ChevronRight,
  Inbox, PackageX,
} from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { QrPrintDialog, type QrPrintItem } from "@/components/shared/qr-print-dialog";

interface SubItemRecord {
  id: string;
  subCode: string;
  status: string;
  condition: string | null;
  serialNumber: string | null;
}

interface CategoryType { id: string; name: string; category: string }
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
  subUnit: { id: string; name: string };
  conversionFactor: number;
  minThreshold: number;
  location: LocationType | null;
  imageUrl: string | null;
  description: string | null;
  storageRequirements: string | null;
  availableQty: number;
  totalQty: number;
  subItems: SubItemRecord[];
  images: string[];
}

const CATEGORY_LABELS: Record<string, string> = {
  KRU: "ครุภัณฑ์",
  ELE: "อิเล็กทรอนิกส์",
  BOOK: "หนังสือ",
  TOY: "ของเล่น",
  DUR: "วัสดุคงทน",
  CON: "วัสดุสิ้นเปลือง",
  MED: "ยา",
  KIT: "อุปกรณ์ประกอบวิชา",
};

interface Props {
  item: ItemData;
  userRole: string;
  onAdjust: () => void;
  onReportDamage: () => void;
  onRefresh: () => void;
}

export function ItemDetailOverview({ item, userRole, onAdjust, onReportDamage, onRefresh }: Props) {
  const canAct = userRole === "ADMIN" || userRole === "STAFF";

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

  // ── Image Upload ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pendingImages, setPendingImages] = useState<{ localUrl: string; file: File }[]>([]);
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const allImages = useMemo(() => {
    const server = item.imageUrl ? [item.imageUrl] : [];
    const serverExtras = item.images || [];
    return [...server, ...serverExtras, ...uploadedUrls, ...pendingImages.map((p) => p.localUrl)].slice(0, 8);
  }, [item.imageUrl, item.images, uploadedUrls, pendingImages]);

  // cleanup blob URLs on unmount
  useEffect(() => {
    return () => { pendingImages.forEach((p) => URL.revokeObjectURL(p.localUrl)); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    // create local previews immediately
    const pending = imageFiles.map((f) => ({
      localUrl: URL.createObjectURL(f),
      file: f,
    }));
    setPendingImages((prev) => [...prev, ...pending].slice(0, 8));

    // upload each file
    setUploading(true);
    const newUrls: string[] = [];
    for (const p of pending) {
      try {
        const formData = new FormData();
        formData.append("file", p.file);
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (!res.ok) throw new Error("Upload failed");
        const { url } = await res.json();
        newUrls.push(url);
      } catch {
        toast.error(`Failed to upload ${p.file.name}`);
      }
    }
    // move from pending → uploaded
    setPendingImages((prev) => prev.filter((p) => !pending.includes(p)));
    setUploadedUrls((prev) => [...prev, ...newUrls]);
    pending.forEach((p) => URL.revokeObjectURL(p.localUrl));
    setUploading(false);
  }, []);

  const removeImage = useCallback((idx: number) => {
    // allImages = [imageUrl?, ...item.images, ...uploadedUrls, ...pendingLocal]
    const coverOffset = item.imageUrl ? 1 : 0;
    const serverExtras = item.images || [];

    // idx 0 = cover image
    if (idx === 0 && item.imageUrl) {
      // promote first server extra to cover, or clear
      const newCover = serverExtras[0] || null;
      const newExtras = serverExtras.slice(1);
      fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: newCover, images: newExtras }),
      }).then(() => { onRefresh(); });
      return;
    }

    const serverExtraIdx = idx - coverOffset;

    // inside server extras (item.images)?
    if (serverExtraIdx < serverExtras.length) {
      const newExtras = serverExtras.filter((_, i) => i !== serverExtraIdx);
      fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: newExtras }),
      }).then(() => { onRefresh(); });
      return;
    }

    // inside uploadedUrls?
    const uploadedIdx = serverExtraIdx - serverExtras.length;
    if (uploadedIdx < uploadedUrls.length) {
      setUploadedUrls((prev) => prev.filter((_, i) => i !== uploadedIdx));
      return;
    }

    // inside pending
    const pendingIdx = uploadedIdx - uploadedUrls.length;
    setPendingImages((prev) => {
      const removed = prev[pendingIdx];
      if (removed) URL.revokeObjectURL(removed.localUrl);
      return prev.filter((_, i) => i !== pendingIdx);
    });
  }, [item.id, item.imageUrl, item.images, onRefresh, uploadedUrls.length]);

  // ── Lightbox ──
  const [lightboxIdx, setLightboxIdx] = useState(-1);
  const lightboxOpen = lightboxIdx >= 0;

  const lightboxNav = useCallback((dir: -1 | 1) => {
    setLightboxIdx((prev) => {
      const next = prev + dir;
      if (next < 0) return allImages.length - 1;
      if (next >= allImages.length) return 0;
      return next;
    });
  }, [allImages.length]);

  // ── Handlers ──
  const handleReturn = async (subItemId: string) => {
    const res = await fetch(`/api/items/${item.id}/return`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subItemId }),
    });
    if (res.ok) { toast.success("Returned"); onRefresh(); }
    else { const err = await res.json(); toast.error(err.error ?? "Return failed"); }
  };

  const handleReturnQty = async () => {
    const qty = prompt("Enter quantity to return:");
    if (!qty) return;
    const res = await fetch(`/api/items/${item.id}/return`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: parseInt(qty) }),
    });
    if (res.ok) { toast.success("Returned"); onRefresh(); }
    else { const err = await res.json(); toast.error(err.error ?? "Return failed"); }
  };

  const locationStr = item.location
    ? [item.location.building, item.location.floor, item.location.room, item.location.detail].filter(Boolean).join(" / ")
    : "-";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-10">
      {/* ═══ LEFT COLUMN ═══ */}
      <div className="space-y-10">
        {/* ── Image uploader ── */}
        {canAct && (
          <section className="animate-in fade-in slide-in-from-2 duration-300">
            <SectionHeading eyebrow="Media" title="Photos" hint={`${allImages.length}/8`} />

            <div className={cn(
              "grid gap-3",
              allImages.length > 0 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1",
            )}>
              {/* Drop zone — hidden when full */}
              {allImages.length < 8 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
                  className={cn(
                    "rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 text-center px-3 transition-all",
                    allImages.length > 0 ? "aspect-square" : "py-10",
                    dragOver
                      ? "border-primary bg-primary/5 scale-[1.01]"
                      : "border-border hover:border-primary/50 hover:bg-accent/40",
                  )}
                >
                  <span className="grid place-items-center size-10 rounded-full bg-primary/10 text-primary">
                    <ImagePlus className="size-5" />
                  </span>
                  {allImages.length === 0 ? (
                    <>
                      <span className="text-sm font-medium">No photos yet</span>
                      <span className="text-[11px] text-muted-foreground">Drop or click to upload · PNG, JPG up to 5MB</span>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-medium">Drop or click</span>
                      <span className="text-[11px] text-muted-foreground">PNG, JPG</span>
                    </>
                  )}
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
                disabled={uploading}
              />

              {allImages.map((src, i) => (
                <div
                  key={src}
                  role="button"
                  tabIndex={0}
                  onClick={() => setLightboxIdx(i)}
                  onKeyDown={(e) => { if (e.key === "Enter") setLightboxIdx(i); }}
                  className="relative group aspect-square rounded-2xl overflow-hidden border border-border bg-muted focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all hover:ring-2 hover:ring-primary/30 cursor-pointer"
                >
                  <img src={src} alt={`Photo ${i + 1}`} className="size-full object-cover" />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                    className="absolute top-2 right-2 size-7 grid place-items-center rounded-full bg-background/90 text-foreground shadow opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
                    aria-label="Remove photo"
                  >
                    <X className="size-3.5" />
                  </button>
                  {i === 0 && (
                    <span className="absolute bottom-2 left-2 text-[10px] uppercase tracking-wider font-semibold bg-background/90 px-2 py-0.5 rounded-full">
                      Cover
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Item info — flat divider rows ── */}
        <section className="animate-in fade-in slide-in-from-2 duration-300" style={{ animationDelay: "50ms" }}>
          <SectionHeading eyebrow="Item info" title="Specification" />
          <dl className="divide-y divide-border">
            <SpecRow icon={Hash} label="Code" value={<span className="font-mono">{item.code}</span>} />
            <SpecRow icon={Tag} label="Category" value={CATEGORY_LABELS[item.category.category] ?? item.category.category} />
            <SpecRow icon={Layers} label="Issue unit" value={item.issueUnit.name} />
            {item.subUnit && (
              <SpecRow icon={Layers} label="Sub unit" value={`${item.subUnit.name} (1 ${item.issueUnit.name} = ${item.conversionFactor} ${item.subUnit.name})`} />
            )}
            <SpecRow icon={MapPin} label="Location" value={locationStr} />
            {item.storageRequirements && (
              <SpecRow icon={ClipboardList} label="Storage" value={item.storageRequirements} />
            )}
            {item.trackIndividually && item.subItems.length === 1 && item.subItems[0].serialNumber && (
              <SpecRow icon={Hash} label="Serial No." value={<span className="font-mono">{item.subItems[0].serialNumber}</span>} />
            )}
            {item.trackIndividually && item.subItems.length === 1 && item.subItems[0].condition && (
              <SpecRow icon={ClipboardList} label="Condition" value={item.subItems[0].condition} />
            )}
          </dl>
        </section>

        {/* ── Status summary ── */}
        {statusSummary && (
          <section className="animate-in fade-in slide-in-from-2 duration-300" style={{ animationDelay: "100ms" }}>
            <SectionHeading eyebrow="Sub-items" title="Status breakdown" />
            <div className="flex flex-wrap gap-2">
              {Object.entries(statusSummary).map(([status, count]) => (
                <Badge key={status} variant={status === "AVAILABLE" ? "default" : "secondary"} className="text-xs">
                  {status.replace(/_/g, " ")}: {count}
                </Badge>
              ))}
            </div>
          </section>
        )}

        {/* ── Checked out ── */}
        {canAct && checkedOutSubs.length > 0 && (
          <section className="animate-in fade-in slide-in-from-2 duration-300" style={{ animationDelay: "150ms" }}>
            <SectionHeading eyebrow="Loans" title={`Checked out (${checkedOutSubs.length})`} />
            <div className="space-y-2">
              {checkedOutSubs.map((sub) => (
                <div key={sub.id} className="flex items-center justify-between rounded-xl border p-3 transition-colors hover:bg-muted/50">
                  <span className="font-mono text-sm">{sub.subCode}</span>
                  <Button size="sm" variant="outline" onClick={() => handleReturn(sub.id)}>
                    <Undo2 className="h-3.5 w-3.5 mr-1" />Return
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
            <SectionHeading eyebrow="Quick actions" title="Manage stock" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ActionTile icon={ShoppingCart} label="Dispense" tone="primary" onClick={() => { window.location.href = `/dispense?item=${item.id}`; }} />
              <ActionTile icon={ArrowDownToLine} label="Receive" tone="default" onClick={() => { window.location.href = `/receive?item=${item.id}`; }} />
              <ActionTile icon={Package} label="Adjust stock" tone="default" onClick={onAdjust} />
              <ActionTile icon={Flag} label="Report damage" tone="destructive" onClick={onReportDamage} />
            </div>

            {!item.trackIndividually && item.category.category !== "CON" && item.availableQty < item.totalQty && (
              <Button variant="outline" className="mt-3 w-full" onClick={handleReturnQty}>
                <Undo2 className="h-4 w-4 mr-1" />Return Qty
              </Button>
            )}
          </section>
        )}

        {/* ── QR code ── */}
        <section className="animate-in fade-in slide-in-from-2 duration-300" style={{ animationDelay: "50ms" }}>
          <SectionHeading eyebrow="Find faster" title="QR code" />
          <div className="flex gap-5 items-start">
            <div className="size-36 rounded-2xl border border-border bg-card grid place-items-center shrink-0">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt={`QR for ${item.code}`} className="size-32 rounded-lg" />
              ) : (
                <QrCode className="size-24 text-foreground animate-pulse" />
              )}
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <div className="text-sm text-muted-foreground">Scan to find item</div>
              <div className="font-mono font-medium mt-1 truncate">{item.code}</div>
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setPrintOpen(true)}>
                  <Printer className="size-3.5" /> Print
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* ── Recent activity ── */}
        <section className="animate-in fade-in slide-in-from-2 duration-300" style={{ animationDelay: "100ms" }}>
          <SectionHeading eyebrow="Recent activity" title="Last events" />
          <RecentEvents itemId={item.id} />
        </section>
      </div>

      <QrPrintDialog open={printOpen} onClose={() => setPrintOpen(false)} items={printItems} />

      {/* ── Lightbox ── */}
      <Dialog open={lightboxOpen} onOpenChange={(open) => { if (!open) setLightboxIdx(-1); }}>
        <DialogContent showCloseButton={false} className="max-w-4xl sm:max-w-4xl p-0 overflow-hidden bg-black/95 border-none">
          <div className="relative flex items-center justify-center min-h-[60vh]">
            {lightboxOpen && allImages[lightboxIdx] && (
              <img
                src={allImages[lightboxIdx]}
                alt={`Photo ${lightboxIdx + 1}`}
                className="max-h-[80vh] max-w-full object-contain"
              />
            )}

            {/* Close */}
            <button
              onClick={() => setLightboxIdx(-1)}
              className="absolute top-4 right-4 size-10 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              <X className="size-5" />
            </button>

            {/* Prev / Next */}
            {allImages.length > 1 && (
              <>
                <button
                  onClick={() => lightboxNav(-1)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 size-10 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  onClick={() => lightboxNav(1)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 size-10 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                >
                  <ChevronRight className="size-5" />
                </button>
              </>
            )}

            {/* Counter */}
            {allImages.length > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm tabular-nums">
                {lightboxIdx + 1} / {allImages.length}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sub-components ──

function SectionHeading({ eyebrow, title, hint }: { eyebrow: string; title: string; hint?: string }) {
  return (
    <div className="mb-4 flex items-end justify-between">
      <div>
        <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</div>
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
    <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-4 py-3.5">
      <span className="grid place-items-center size-8 rounded-lg bg-muted text-muted-foreground shrink-0">
        <Icon className="size-4" />
      </span>
      <dt className="text-sm text-muted-foreground md:w-32">{label}</dt>
      <dd className="text-sm font-medium md:ml-auto md:text-right">{value}</dd>
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

// ── Recent events ──
function RecentEvents({ itemId }: { itemId: string }) {
  const [events, setEvents] = useState<{ type: string; description: string; date: string; user: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/items/${itemId}/history?perPage=3`)
      .then((r) => r.json())
      .then((d) => { setEvents(d.events || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [itemId]);

  if (loading) {
    return (
      <ol className="relative pl-5 space-y-5">
        <span className="absolute left-1.5 top-1 bottom-1 w-px bg-border" />
        {[0, 1, 2].map((i) => (
          <li key={i} className="space-y-1">
            <div className="h-4 w-32 rounded bg-muted animate-pulse" />
            <div className="h-3 w-48 rounded bg-muted animate-pulse" />
          </li>
        ))}
      </ol>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
        <ClipboardList className="size-8 opacity-40" />
        <span className="text-sm">No recent events</span>
      </div>
    );
  }

  const dotColor = (type: string) => {
    if (type === "RECEIVE") return "bg-success";
    if (type === "DISPENSE") return "bg-primary";
    if (type === "MAINTENANCE") return "bg-info-400";
    if (type === "ADJUSTMENT") return "bg-warning";
    return "bg-muted-foreground";
  };

  return (
    <ol className="relative pl-5 space-y-5">
      <span className="absolute left-1.5 top-1 bottom-1 w-px bg-border" />
      {events.map((e, i) => (
        <li key={i} className="relative animate-in fade-in slide-in-from-2 duration-200" style={{ animationDelay: `${i * 80}ms` }}>
          <span className={cn(
            "absolute -left-[18px] top-1.5 size-3 rounded-full ring-4 ring-background",
            dotColor(e.type),
          )} />
          <div className="text-sm font-medium">{e.description}</div>
          <div className="text-xs text-muted-foreground">
            {e.user} · {new Date(e.date).toLocaleDateString("th-TH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
        </li>
      ))}
    </ol>
  );
}
