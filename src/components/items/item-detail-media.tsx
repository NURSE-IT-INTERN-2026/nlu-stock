"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ImagePlus, X, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { uploadFile, updateItem } from "@/lib/api";

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
        const { url } = await uploadFile(formData);
        newUrls.push(url);
      } catch {
        toast.error(`Failed to upload ${p.file.name}`);
      }
    }
    // move from pending → uploaded
    setPendingImages((prev) => prev.filter((p) => !pending.includes(p)));
    pending.forEach((p) => URL.revokeObjectURL(p.localUrl));

    // persist: merge server + newly-uploaded, first slot = cover
    if (newUrls.length > 0) {
      const serverCover = item.imageUrl ? [item.imageUrl] : [];
      const combined = [...serverCover, ...(item.images || []), ...newUrls].slice(0, 8);
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
    <div className="max-w-3xl">
      <SectionHeading title="รูปภาพ" hint={`${allImages.length}/8`} />

      <div className={cn(
        "grid gap-3",
        allImages.length > 0 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1",
      )}>
        {/* Drop zone — staff only, hidden when full */}
        {canAct && allImages.length < 8 && (
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
                <span className="text-sm font-medium">ยังไม่มีรูปภาพ</span>
                <span className="text-[11px] text-muted-foreground">ลากหรือคลิกเพื่ออัปโหลด · PNG, JPG สูงสุด 5MB</span>
              </>
            ) : (
              <>
                <span className="text-sm font-medium">ลากหรือคลิก</span>
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
            <img src={src} alt={`รูปที่ ${i + 1}`} loading="lazy" className="size-full object-cover" />
            {canAct && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                className="absolute top-2 right-2 size-7 grid place-items-center rounded-full bg-background/90 text-foreground shadow opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
                aria-label="ลบรูป"
              >
                <X className="size-3.5" />
              </button>
            )}
            {i === 0 && (
              <span className="absolute bottom-2 left-2 text-[10px] uppercase tracking-wider font-semibold bg-background/90 px-2 py-0.5 rounded-full">
                หน้าปก
              </span>
            )}
          </div>
        ))}
      </div>

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
