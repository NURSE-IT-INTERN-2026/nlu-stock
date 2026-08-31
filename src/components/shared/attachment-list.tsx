"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, X, Upload, Loader2, History, Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isImageUrl, isPdfUrl } from "@/components/shared/file-upload";
import { changeAttachments, getAttachmentLog, uploadFile, type AttachmentLogEntry } from "@/lib/api";
import type { AttachRecordType } from "@/lib/attachments";
import { EVIDENCE_ACCEPT, MAX_EVIDENCE_FILES } from "@/lib/uploads";
import { fmtDate, TH_DATETIME } from "@/lib/format";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ComponentProps } from "react";
import { withBase } from "@/lib/base-path";

export type AttachTarget = { recordType: AttachRecordType; recordId: string };

/**
 * หลักฐานแนบ — the same list wherever an event's attachments are shown.
 *
 * Files are stored under a UUID and the uploader's own filename is deliberately not kept (it
 * carries personal data often enough — เงินเดือน_นายสมชาย.pdf — and it would end up in a URL),
 * so a document is labelled by position: เอกสาร 1, เอกสาร 2. Images carry their own label.
 *
 * รูป open in a lightbox rather than a new tab: the ask behind this whole feature was
 * "ขนาดเอาให้อ่านได้", and a 64px thumbnail of a damaged part answers nothing.
 *
 * Pass `target` and the list stops being read-only: แนบเพิ่ม writes straight into the record that
 * was filed earlier, and every such edit lands in attachment_logs, readable from the ประวัติ
 * popover. Without `target` (a รับเข้า row, a ย้ายที่ row — events with no evidence column of
 * their own) it renders exactly as it always did.
 */
export function AttachmentList({
  urls,
  className,
  target,
  canEdit = false,
  onChange,
}: {
  urls: string[];
  className?: string;
  target?: AttachTarget;
  /** ADMIN/SUPERADMIN. The route enforces it too; this only decides whether buttons render. */
  canEdit?: boolean;
  /** The server's new array, for the caller to store. Never the caller's own optimistic guess. */
  onChange?: (urls: string[]) => void;
}) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const images = urls.filter(isImageUrl);
  const docs = urls.filter((u) => !isImageUrl(u));
  const editable = !!target && canEdit;
  const room = MAX_EVIDENCE_FILES - urls.length;

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLightbox(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  async function addFiles(fileList: FileList | null) {
    if (!target) return;
    const picked = Array.from(fileList ?? []);
    if (picked.length === 0) return;
    const files = picked.slice(0, room);
    if (picked.length > room) toast.error(`แนบได้สูงสุด ${MAX_EVIDENCE_FILES} ไฟล์`);

    setBusy(true);
    // Uploads run one at a time and each survives on its own: a batch of three where the second
    // is refused still attaches the other two and names the one that failed. Same bargain as the
    // create-time picker — rolling back would mean deleting bytes already written to disk.
    const added: string[] = [];
    for (const file of files) {
      try {
        const form = new FormData();
        form.append("file", file);
        const { url } = await uploadFile(form);
        added.push(url);
      } catch (err) {
        toast.error(`${file.name}: ${err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ"}`);
      }
    }
    if (inputRef.current) inputRef.current.value = "";

    if (added.length > 0) {
      try {
        const res = await changeAttachments({ ...target, add: added });
        onChange?.(res.urls);
        toast.success(`แนบเพิ่ม ${added.length} ไฟล์`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "แนบไฟล์ไม่สำเร็จ");
      }
    }
    setBusy(false);
  }

  async function removeFile(url: string) {
    if (!target) return;
    setBusy(true);
    try {
      const res = await changeAttachments({ ...target, remove: [url] });
      onChange?.(res.urls);
      toast.success("ลบไฟล์แนบแล้ว");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ลบไฟล์ไม่สำเร็จ");
    } finally {
      setBusy(false);
      setPendingRemove(null);
    }
  }

  if (urls.length === 0 && !editable) return null;

  return (
    <>
      <div className={cn("space-y-2", className)}>
        {urls.length > 0 && (
          <ul className="flex flex-wrap items-start gap-2">
            {urls.map((url) => (
              <li key={url} className="relative">
                {editable && (
                  <button
                    type="button"
                    disabled={busy}
                    className="absolute -top-1.5 -right-1.5 z-10 rounded-full border border-border bg-background p-0.5 text-muted-foreground shadow-sm transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    onClick={() => setPendingRemove(url)}
                    aria-label="ลบไฟล์แนบ"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
                {isImageUrl(url) ? (
                  <button
                    type="button"
                    onClick={() => setLightbox(url)}
                    className="block overflow-hidden rounded-md border border-border transition-colors hover:border-primary"
                    aria-label={`ดูรูปหลักฐาน ${images.indexOf(url) + 1} ขนาดเต็ม`}
                  >
                    <img src={withBase(url)} alt={`รูปภาพ ${images.indexOf(url) + 1}`} className="size-16 object-cover" />
                  </button>
                ) : (
                  <a
                    href={withBase(url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-16 items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    <FileText className="h-4 w-4 shrink-0" />
                    {isPdfUrl(url) ? `เอกสาร ${docs.indexOf(url) + 1}` : `ไฟล์ ${docs.indexOf(url) + 1}`}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}

        {target && (
          <div className="flex flex-wrap items-center gap-2">
            {editable && (
              <>
                <input
                  ref={inputRef}
                  type="file"
                  accept={EVIDENCE_ACCEPT}
                  multiple
                  className="hidden"
                  disabled={busy || room <= 0}
                  onChange={(e) => void addFiles(e.target.files)}
                />
                <button
                  type="button"
                  disabled={busy || room <= 0}
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {busy ? "กำลังบันทึก..." : "แนบเพิ่ม"}
                </button>
                <span className="text-[11px] text-muted-foreground">
                  {urls.length}/{MAX_EVIDENCE_FILES} · รูปหรือ PDF
                </span>
              </>
            )}
            <AttachmentLogPopover target={target} hasFiles={urls.length > 0} />
          </div>
        )}
      </div>

      {/* หลักฐานที่ลบไปยังตามกลับมาได้ — but only by someone who knows the file was there, so the
          confirm spells out that this is the record's evidence, not a draft attachment. */}
      <AlertDialog open={!!pendingRemove} onOpenChange={(o) => !o && setPendingRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบไฟล์แนบ?</AlertDialogTitle>
            <AlertDialogDescription>
              ไฟล์จะหายจากรายการนี้ และระบบจะบันทึกไว้ว่าใครลบเมื่อไหร่
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={() => void removeFile(pendingRemove!)}>ลบ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
          <img src={withBase(lightbox)} alt="รูปหลักฐาน" className="max-h-full max-w-full rounded-md object-contain" />
        </div>
      )}
    </>
  );
}

/**
 * ประวัติไฟล์แนบ. Fetched when the popover opens and not before — a maintenance page renders
 * dozens of these and none of them is worth a query until somebody asks.
 *
 * Only edits made after the record was written are logged, so an empty list means the evidence
 * has sat untouched since it was filed. The popover says exactly that rather than implying the
 * log failed. It does not say the reverse — that an unlogged file was there from the start —
 * because every row written before this table existed is unlogged too.
 */
function AttachmentLogPopover({ target, hasFiles }: { target: AttachTarget; hasFiles: boolean }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<AttachmentLogEntry[] | null>(null);
  // Distinct from "no entries". A failed fetch used to fall into the same empty state, which
  // told the reader the evidence had never been touched — the one thing this popover exists to
  // answer, answered wrongly, in the confident voice.
  const [failed, setFailed] = useState(false);

  // Fetched on the open, not by an effect watching it: opening is the event, and a stale list
  // from the previous open would show for a frame before the new one lands.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setEntries(null);
    setFailed(false);
    getAttachmentLog(target.recordType, target.recordId)
      .then((r) => setEntries(r.entries))
      .catch(() => setFailed(true));
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={(props: ComponentProps<"button">) => (
          <button
            {...props}
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <History className="h-3.5 w-3.5" />
            ประวัติไฟล์แนบ
          </button>
        )}
      />
      <PopoverContent align="start" className="w-80 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">ประวัติไฟล์แนบ</p>
        {failed ? (
          <p className="text-xs text-destructive dark:text-danger-400">โหลดประวัติไม่สำเร็จ — ลองเปิดใหม่อีกครั้ง</p>
        ) : entries === null ? (
          <p className="text-xs text-muted-foreground">กำลังโหลด...</p>
        ) : entries.length === 0 ? (
          // No log row means no edit after the record was written — which says nothing about
          // files that were never there in the first place. Claiming "แนบไว้ตั้งแต่ตอนบันทึก" on
          // an empty record asserts evidence that does not exist.
          <p className="text-xs text-muted-foreground">
            {hasFiles ? "แนบไว้ตั้งแต่ตอนบันทึก ยังไม่มีการแก้ไข" : "ยังไม่มีไฟล์แนบ"}
          </p>
        ) : (
          <ul className="space-y-2">
            {entries.map((e) => (
              <li key={e.id} className="flex items-start gap-2 text-xs">
                <span
                  className={cn(
                    "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full",
                    e.action === "ADD"
                      ? "bg-success/10 text-success-700 dark:text-success-200"
                      : "bg-destructive/10 text-destructive dark:text-danger-400",
                  )}
                >
                  {e.action === "ADD" ? <Plus className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
                </span>
                <span className="min-w-0">
                  <span className="text-foreground">{e.by}</span>
                  <span className="text-muted-foreground">
                    {e.action === "ADD" ? " แนบไฟล์" : " ลบไฟล์แนบ"}
                  </span>
                  <span className="block tabular-nums text-muted-foreground">
                    {fmtDate(e.at, TH_DATETIME)} น.
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
