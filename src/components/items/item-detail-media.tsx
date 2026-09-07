"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ImagePlus, Camera, X, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { uploadFile, updateItem } from "@/lib/api";

import { IMAGE_ACCEPT } from "@/lib/uploads";
import { withBase } from "@/lib/base-path";
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
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const save = useCallback((data: { imageUrl: string | null; images: string[] }) => {
    const p = onSave ? onSave(item.id, data) : updateItem(item.id, data);
    return Promise.resolve(p).then(() => onRefresh());
  }, [item.id, onSave, onRefresh]);
  const [dragOver, setDragOver] = useState(false);
  const [pendingImages, setPendingImages] = useState<{ localUrl: string; file: File }[]>([]);
  const [uploading, setUploading] = useState(false);

  // capture= only opens a camera where the device has one wired to the file picker — phones and
  // tablets. Desktop browsers ignore it and show the same picker the upload tile already opens,
  // so the button is hidden there rather than lying about what it does. Resolved in an effect:
  // the server has no pointer to match, and rendering false first keeps hydration clean.
  const [hasCamera, setHasCamera] = useState(false);
  useEffect(() => { setHasCamera(window.matchMedia("(pointer: coarse)").matches); }, []);

  const allImages = useMemo(() => {
    const server = item.imageUrl ? [item.imageUrl] : [];
    const serverExtras = item.images || [];
    return [...server, ...serverExtras, ...pendingImages.map((p) => p.localUrl)].slice(0, MAX_IMAGES);
  }, [item.imageUrl, item.images, pendingImages]);

  // Slot 0 is the cover — the same ordering removeImage indexes into.
  const cover = allImages[0] ?? null;

  // cleanup blob URLs on unmount
  useEffect(() => {
    return () => { pendingImages.forEach((p) => URL.revokeObjectURL(p.localUrl)); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    // Trim to the free slots BEFORE uploading — the old cap ran after, so surplus files were
    // written to disk and then dropped from the saved list, leaving them referenced by nothing.
    const room = MAX_IMAGES - allImages.length;
    if (room <= 0) return;
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, room);
    if (imageFiles.length === 0) return;

    // create local previews immediately
    const pending = imageFiles.map((f) => ({
      localUrl: URL.createObjectURL(f),
      file: f,
    }));
    setPendingImages((prev) => [...prev, ...pending]);

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
    }
    setUploading(false);
  }, [item.imageUrl, item.images, allImages.length, save]);

  const removeImage = useCallback((idx: number) => {
    // allImages = [imageUrl?, ...item.images, ...pendingLocal]
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

    // inside pending
    const pendingIdx = serverExtraIdx - serverExtras.length;
    setPendingImages((prev) => {
      const removed = prev[pendingIdx];
      if (removed) URL.revokeObjectURL(removed.localUrl);
      return prev.filter((_, i) => i !== pendingIdx);
    });
  }, [item.imageUrl, item.images, save]);

  // Index awaiting confirmation. null, not 0-is-falsy — slot 0 is the cover and must be
  // removable like any other.
  const [pendingRemove, setPendingRemove] = useState<number | null>(null);

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
        <div className="p-4 sm:p-5">
          <input
            ref={fileInputRef}
            type="file"
            accept={IMAGE_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
            disabled={uploading}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept={IMAGE_ACCEPT}
            capture="environment"
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
            disabled={uploading}
          />

          {/* One 3-col grid: slot 0 is the cover, marked by a badge instead of its own wide row. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            {allImages.map((src, i) => (
              <Thumb
                key={src}
                src={src}
                alt={i === 0 ? "รูปปก" : `รูปประกอบที่ ${i}`}
                badge={i === 0 ? "ปก" : undefined}
                canAct={canAct}
                onOpen={() => setLightboxIdx(i)}
                onRemove={() => setPendingRemove(i)}
              />
            ))}
            {canAct && allImages.length < MAX_IMAGES && (
              <UploadTile
                title={cover ? "เพิ่มรูป" : "เพิ่มรูปปก"}
                hint="PNG, JPG · 5MB"
                disabled={uploading}
                dragOver={dragOver}
                setDragOver={setDragOver}
                onPick={() => fileInputRef.current?.click()}
                onFiles={addFiles}
              />
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">รูปแรกคือรูปปก แสดงในรายการพัสดุและผลค้นหา</p>
            {canAct && hasCamera && allImages.length < MAX_IMAGES && (
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={uploading}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-60"
              >
                <Camera className="size-3.5" />
                ถ่ายรูป
              </button>
            )}
          </div>
        </div>
      </section>

      <AlertDialog open={pendingRemove !== null} onOpenChange={(o) => !o && setPendingRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingRemove === 0 ? "ลบรูปปก?" : "ลบรูปนี้?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemove === 0 && allImages.length > 1
                ? "รูปถัดไปจะขึ้นมาเป็นรูปปกแทน แสดงในรายการพัสดุและผลค้นหา"
                : "รูปจะหายจากพัสดุนี้ กู้คืนไม่ได้"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={() => removeImage(pendingRemove!)}>ลบ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Lightbox ── */}
      <Dialog open={lightboxOpen} onOpenChange={(open) => { if (!open) setLightboxIdx(-1); }}>
        <DialogContent showCloseButton={false} className="max-w-4xl sm:max-w-4xl p-0 overflow-hidden bg-black/95 border-none">
          <div className="relative flex items-center justify-center min-h-[60vh]">
            {lightboxOpen && allImages[lightboxIdx] && (
              <img
                // Same withBase() the thumbnails go through — a stored "/uploads/x.jpg" is
                // app-absolute, and without the basePath the browser asks the server root.
                src={withBase(allImages[lightboxIdx])}
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

function Thumb({ src, alt, canAct, onOpen, onRemove, badge }: {
  src: string; alt: string; canAct: boolean; onOpen: () => void; onRemove: () => void; badge?: string;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
      className={cn(
        "relative group aspect-square overflow-hidden rounded-2xl border border-border bg-muted transition-all cursor-pointer",
        "focus:outline-none focus:ring-2 focus:ring-primary/50 hover:ring-2 hover:ring-primary/30",
      )}
    >
      <img src={withBase(src)} alt={alt} loading="lazy" className="size-full object-cover" />
      {badge && (
        <span className="absolute bottom-2 left-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-semibold text-foreground shadow">
          {badge}
        </span>
      )}
      {canAct && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="absolute top-2 right-2 size-8 grid place-items-center rounded-full bg-background/90 text-foreground shadow transition-opacity hover:bg-destructive hover:text-destructive-foreground opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
          aria-label="ลบรูป"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

function UploadTile({ title, hint, disabled, dragOver, setDragOver, onPick, onFiles }: {
  title: string; hint?: string; disabled?: boolean;
  dragOver: boolean; setDragOver: (v: boolean) => void;
  onPick: () => void; onFiles: (f: FileList | null) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      onDragOver={(e) => { if (disabled) return; e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { if (disabled) return; e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); }}
      className={cn(
        "flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-3 text-center transition-all",
        disabled
          ? "border-border opacity-60 cursor-default"
          : dragOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-accent/40",
      )}
    >
      <span className="grid place-items-center size-9 rounded-full bg-primary/10 text-primary">
        <ImagePlus className="size-4.5" />
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
