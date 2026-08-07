"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ImagePlus, X, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { uploadFile, updateItem } from "@/lib/api";

// 1 cover + 2 extras. Existing items that already hold more are not rewritten —
// the surplus is simply not rendered, and the next save trims it.
const MAX_IMAGES = 3;

interface MediaItem {
  id: string;
  imageUrl: string | null;
  images: string[];
}

interface Props {
  item: MediaItem;
  canAct: boolean;
  onRefresh: () => void;
  // Override persistence (default: updateItem on the parent item). Used by sub-item detail.
  onSave?: (id: string, data: { imageUrl: string | null; images: string[] }) => Promise<unknown>;
}

export function ItemDetailMedia({ item, canAct, onRefresh, onSave }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const save = useCallback((data: { imageUrl: string | null; images: string[] }) => {
    const p = onSave ? onSave(item.id, data) : updateItem(item.id, data);
    return Promise.resolve(p).then(() => onRefresh());
  }, [item.id, onSave, onRefresh]);
  const [dragOver, setDragOver] = useState(false);
  const [pendingImages, setPendingImages] = useState<{ localUrl: string; file: File }[]>([]);
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const allImages = useMemo(() => {
    const server = item.imageUrl ? [item.imageUrl] : [];
    const serverExtras = item.images || [];
    return [...server, ...serverExtras, ...uploadedUrls, ...pendingImages.map((p) => p.localUrl)].slice(0, MAX_IMAGES);
  }, [item.imageUrl, item.images, uploadedUrls, pendingImages]);

  // Slot 0 is the cover, the rest are extras — the same ordering removeImage indexes into.
  const cover = allImages[0] ?? null;
  const extras = allImages.slice(1);

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
    setPendingImages((prev) => [...prev, ...pending].slice(0, MAX_IMAGES));

    // upload each file
    setUploading(true);
    const newUrls: string[] = [];
    for (const p of pending) {
      try {
        const formData = new FormData();
        formData.append("file", p.file);
        const { url } = await uploadFile(formData);
        newUrls.push(url);
      } catch {
        toast.error(`อัปโหลด ${p.file.name} ไม่สำเร็จ`);
      }
    }
    // move from pending → uploaded
    setPendingImages((prev) => prev.filter((p) => !pending.includes(p)));
    pending.forEach((p) => URL.revokeObjectURL(p.localUrl));

    // persist: merge server + newly-uploaded, first slot = cover
    if (newUrls.length > 0) {
      const serverCover = item.imageUrl ? [item.imageUrl] : [];
      const combined = [...serverCover, ...(item.images || []), ...newUrls].slice(0, MAX_IMAGES);
      await save({ imageUrl: combined[0] ?? null, images: combined.slice(1) });
      setUploadedUrls([]);
    }
    setUploading(false);
  }, [item.imageUrl, item.images, save]);

  const removeImage = useCallback((idx: number) => {
    // allImages = [imageUrl?, ...item.images, ...uploadedUrls, ...pendingLocal]
    const coverOffset = item.imageUrl ? 1 : 0;
    const serverExtras = item.images || [];

    // idx 0 = cover image
    if (idx === 0 && item.imageUrl) {
      // promote first server extra to cover, or clear
      const newCover = serverExtras[0] || null;
      const newExtras = serverExtras.slice(1);
      save({ imageUrl: newCover, images: newExtras });
      return;
    }

    const serverExtraIdx = idx - coverOffset;

    // inside server extras (item.images)?
    if (serverExtraIdx < serverExtras.length) {
      const newExtras = serverExtras.filter((_, i) => i !== serverExtraIdx);
      save({ imageUrl: item.imageUrl, images: newExtras });
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
  }, [item.id, item.imageUrl, item.images, save, uploadedUrls.length]);

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

  return (
    <div>
      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <SectionHeader
          eyebrow="แกลเลอรี"
          title="รูปภาพ"
          right={
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              <span className="text-foreground font-semibold">{allImages.length}</span> / {MAX_IMAGES}
            </span>
          }
        />
        <div className="p-4 sm:p-5 space-y-5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
            disabled={uploading}
          />

          {/* ── รูปปก — its own slot, wide, never mixed into the extras grid ── */}
          <div>
            <SlotLabel text="รูปปก" hint="แสดงในรายการพัสดุและผลค้นหา" />
            {cover ? (
              <Thumb
                src={cover}
                alt="รูปปก"
                canAct={canAct}
                onOpen={() => setLightboxIdx(0)}
                onRemove={() => removeImage(0)}
                className="aspect-video"
              />
            ) : (
              <UploadTile
                title="ยังไม่มีรูปปก"
                hint="ลากหรือคลิกเพื่ออัปโหลด · PNG, JPG สูงสุด 5MB"
                className="aspect-video w-full"
                disabled={!canAct}
                dragOver={dragOver}
                setDragOver={setDragOver}
                onPick={() => fileInputRef.current?.click()}
                onFiles={addFiles}
              />
            )}
          </div>

          {/* ── รูปประกอบ ── */}
          <div>
            <SlotLabel text="รูปประกอบ" hint={`สูงสุด ${MAX_IMAGES - 1} รูป`} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
              {extras.map((src, i) => (
                <Thumb
                  key={src}
                  src={src}
                  alt={`รูปประกอบที่ ${i + 1}`}
                  canAct={canAct}
                  onOpen={() => setLightboxIdx(i + 1)}
                  onRemove={() => removeImage(i + 1)}
                  className="aspect-square"
                />
              ))}
              {canAct && cover && allImages.length < MAX_IMAGES && (
                <UploadTile
                  title="ลากหรือคลิก"
                  hint="PNG, JPG"
                  className="aspect-square"
                  dragOver={dragOver}
                  setDragOver={setDragOver}
                  onPick={() => fileInputRef.current?.click()}
                  onFiles={addFiles}
                />
              )}
              {!cover && (
                <p className="col-span-full text-xs text-muted-foreground">อัปโหลดรูปปกก่อน แล้วรูปถัดไปจะมาอยู่ตรงนี้</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Lightbox ── */}
      <Dialog open={lightboxOpen} onOpenChange={(open) => { if (!open) setLightboxIdx(-1); }}>
        <DialogContent showCloseButton={false} className="max-w-4xl sm:max-w-4xl p-0 overflow-hidden bg-black/95 border-none">
          <div className="relative flex items-center justify-center min-h-[60vh]">
            {lightboxOpen && allImages[lightboxIdx] && (
              <img
                src={allImages[lightboxIdx]}
                alt={`รูปที่ ${lightboxIdx + 1}`}
                className="max-h-[80vh] max-w-full object-contain"
              />
            )}

            {/* Close */}
            <button
              type="button"
              aria-label="ปิด"
              onClick={() => setLightboxIdx(-1)}
              className="absolute top-4 right-4 size-10 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              <X className="size-5" />
            </button>

            {/* Prev / Next */}
            {allImages.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="รูปก่อน"
                  onClick={() => lightboxNav(-1)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 size-10 grid place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  type="button"
                  aria-label="รูปถัดไป"
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

function SlotLabel({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="mb-2 flex items-baseline gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{text}</span>
      {hint && <span className="text-[11px] text-muted-foreground/70">{hint}</span>}
    </div>
  );
}

function Thumb({ src, alt, canAct, onOpen, onRemove, className }: {
  src: string; alt: string; canAct: boolean; onOpen: () => void; onRemove: () => void; className?: string;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
      className={cn(
        "relative group overflow-hidden rounded-2xl border border-border bg-muted transition-all cursor-pointer",
        "focus:outline-none focus:ring-2 focus:ring-primary/50 hover:ring-2 hover:ring-primary/30",
        className,
      )}
    >
      <img src={src} alt={alt} loading="lazy" className="size-full object-cover" />
      {canAct && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="absolute top-2 right-2 size-7 grid place-items-center rounded-full bg-background/90 text-foreground shadow opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
          aria-label="ลบรูป"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function UploadTile({ title, hint, className, disabled, dragOver, setDragOver, onPick, onFiles }: {
  title: string; hint?: string; className?: string; disabled?: boolean;
  dragOver: boolean; setDragOver: (v: boolean) => void;
  onPick: () => void; onFiles: (f: FileList | null) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); }}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-3 text-center transition-all",
        disabled
          ? "border-border opacity-60 cursor-default"
          : dragOver
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-border hover:border-primary/50 hover:bg-accent/40",
        className,
      )}
    >
      <span className="grid place-items-center size-10 rounded-full bg-primary/10 text-primary">
        <ImagePlus className="size-5" />
      </span>
      <span className="text-sm font-medium">{title}</span>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </button>
  );
}

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
