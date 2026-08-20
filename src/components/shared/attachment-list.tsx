"use client";

import { useEffect, useState } from "react";
import { FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isImageUrl, isPdfUrl } from "@/components/shared/file-upload";

/**
 * หลักฐานแนบ, read-only — the same list wherever an event's attachments are shown.
 *
 * Files are stored under a UUID and the uploader's own filename is deliberately not kept (it
 * carries personal data often enough — เงินเดือน_นายสมชาย.pdf — and it would end up in a URL),
 * so a document is labelled by position: เอกสาร 1, เอกสาร 2. Images carry their own label.
 *
 * รูป open in a lightbox rather than a new tab: the ask behind this whole feature was
 * "ขนาดเอาให้อ่านได้", and a 64px thumbnail of a damaged part answers nothing.
 */
export function AttachmentList({ urls, className }: { urls: string[]; className?: string }) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const images = urls.filter(isImageUrl);
  const docs = urls.filter((u) => !isImageUrl(u));

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLightbox(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  if (urls.length === 0) return null;

  return (
    <>
      <ul className={cn("flex flex-wrap items-start gap-2", className)}>
        {urls.map((url) => {
          if (isImageUrl(url)) {
            return (
              <li key={url}>
                <button
                  type="button"
                  onClick={() => setLightbox(url)}
                  className="block overflow-hidden rounded-md border border-border transition-colors hover:border-primary"
                  aria-label={`ดูรูปหลักฐาน ${images.indexOf(url) + 1} ขนาดเต็ม`}
                >
                  <img src={url} alt={`รูปภาพ ${images.indexOf(url) + 1}`} className="size-16 object-cover" />
                </button>
              </li>
            );
          }
          return (
            <li key={url}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-16 items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                <FileText className="h-4 w-4 shrink-0" />
                {isPdfUrl(url) ? `เอกสาร ${docs.indexOf(url) + 1}` : `ไฟล์ ${docs.indexOf(url) + 1}`}
              </a>
            </li>
          );
        })}
      </ul>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label="รูปหลักฐานขนาดเต็ม"
        >
          <button
            type="button"
            className="absolute top-4 right-4 rounded-md bg-background/90 p-1.5 text-foreground"
            onClick={() => setLightbox(null)}
            aria-label="ปิด"
          >
            <X className="h-4 w-4" />
          </button>
          <img src={lightbox} alt="รูปหลักฐาน" className="max-h-full max-w-full rounded-md object-contain" />
        </div>
      )}
    </>
  );
}
