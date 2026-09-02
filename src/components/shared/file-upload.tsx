"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, Loader2, Image as ImageIcon, FileText } from "lucide-react";
import { toast } from "sonner";
import { uploadFile } from "@/lib/api";
import { EVIDENCE_ACCEPT, MAX_EVIDENCE_FILES } from "@/lib/uploads";
import { withBase } from "@/lib/base-path";

export const isImageUrl = (url: string) => /\.(jpg|jpeg|png|webp)$/i.test(url);
export const isPdfUrl = (url: string) => /\.pdf$/i.test(url);

/** One file, one request. The endpoint takes them one at a time and says why when it refuses. */
async function putFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const { url } = await uploadFile(formData);
  return url;
}

interface FileUploadProps {
  value: string | null;
  onChange: (url: string | null) => void;
  accept?: string;
  label?: string;
  variant?: "button" | "zone";
}

export function FileUpload({ value, onChange, accept = EVIDENCE_ACCEPT, label = "อัปโหลดไฟล์", variant = "button" }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const isImage = value && /\.(jpg|jpeg|png|webp)$/i.test(value);
  const isPdf = value && /\.pdf$/i.test(value);

  async function uploadSingle(file: File) {
    setUploading(true);
    try {
      onChange(await putFile(file));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) await uploadSingle(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadSingle(file);
  }

  if (variant === "zone") {
    return (
      <div>
        <input ref={inputRef} type="file" accept={accept} onChange={handleFileChange} className="hidden" disabled={uploading} />
        {value ? (
          <div className="relative rounded-lg border border-dashed border-border p-2 bg-muted/30">
            <button
              type="button"
              className="absolute top-1.5 right-1.5 p-1 rounded-md bg-background/80 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              onClick={() => onChange(null)}
              aria-label="ลบรูป"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            {isImage ? (
              <img src={withBase(value)} alt="Preview" className="h-28 w-auto rounded object-contain mx-auto" />
            ) : isPdf ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-2">
                <FileText className="h-5 w-5 shrink-0" />
                <span className="truncate">{value.split("/").pop()}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-2">
                <ImageIcon className="h-5 w-5 shrink-0" />
                <span className="truncate">{value.split("/").pop()}</span>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={[
              "w-full flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-8 transition-colors",
              dragging
                ? "border-primary/60 bg-primary/5"
                : "border-border/40 bg-muted/30 hover:border-border/70 hover:bg-muted/50",
            ].join(" ")}
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
            ) : (
              <Upload className="h-5 w-5 text-muted-foreground/60" />
            )}
            <span className="text-[11px] text-muted-foreground">
              {uploading ? "กำลังอัปโหลด..." : "วางไฟล์หรือคลิกเพื่อเลือก"}
            </span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative rounded-md border p-2">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-1 right-1 h-6 w-6"
            onClick={() => onChange(null)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
          {isImage ? (
            <img src={withBase(value)} alt="Preview" className="h-24 w-auto rounded object-contain" />
          ) : isPdf ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-5 w-5" />
              <span className="truncate">{value.split("/").pop()}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ImageIcon className="h-5 w-5" />
              <span className="truncate">{value.split("/").pop()}</span>
            </div>
          )}
        </div>
      ) : null}
      <div>
        <input ref={inputRef} type="file" accept={accept} onChange={handleFileChange} className="hidden" disabled={uploading} />
        <Button variant="outline" size="sm" className="bg-card" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
          {uploading ? "กำลังอัปโหลด..." : label}
        </Button>
      </div>
    </div>
  );
}


interface FileUploadListProps {
  value: string[];
  onChange: (urls: string[]) => void;
  accept?: string;
  label?: string;
  max?: number;
  /** แจ้ง parent ว่ายังอัปโหลดไม่เสร็จ — ปุ่มบันทึกของ dialog ต้องปิดระหว่างนี้ ไม่งั้นกดทันแล้ว
   *  บันทึกไปด้วยรายการไฟล์ว่าง: onChange เพิ่ง push URL หลัง putFile คืนค่า. */
  onUploadingChange?: (uploading: boolean) => void;
}

/**
 * หลักฐานแนบ — up to `max` files per field, รูป and PDF mixed.
 *
 * Uploads run one at a time and each result is kept on its own: a batch of five where the
 * third is refused leaves the other four attached and names the one that failed. Rolling the
 * batch back would mean deleting files already written to disk and making someone re-pick all
 * five because one was wrong.
 */
export function FileUploadList({
  value,
  onChange,
  accept = EVIDENCE_ACCEPT,
  label = "แนบไฟล์",
  max = MAX_EVIDENCE_FILES,
  onUploadingChange,
}: FileUploadListProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploadingState] = useState(false);
  const room = max - value.length;

  const setUploading = (busy: boolean) => {
    setUploadingState(busy);
    onUploadingChange?.(busy);
  };

  async function addFiles(fileList: FileList | null) {
    const picked = Array.from(fileList ?? []);
    if (picked.length === 0) return;
    const files = picked.slice(0, room);
    if (picked.length > room) toast.error(`แนบได้สูงสุด ${max} ไฟล์`);

    setUploading(true);
    const added: string[] = [];
    const failed: string[] = [];
    for (const file of files) {
      try {
        added.push(await putFile(file));
      } catch (err) {
        failed.push(file.name);
        toast.error(`${file.name}: ${err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ"}`);
      }
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    if (added.length > 0) onChange([...value, ...added]);
    // Only worth saying when some of a batch survived; a single failure already has its toast.
    if (failed.length > 0 && added.length > 0) {
      toast.success(`อัปโหลดสำเร็จ ${added.length} จาก ${files.length} ไฟล์`);
    }
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((url, i) => (
            <li key={url} className="relative">
              <button
                type="button"
                className="absolute -top-1.5 -right-1.5 z-10 rounded-full border border-border bg-background p-0.5 text-muted-foreground shadow-sm transition-colors hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onChange(value.filter((u) => u !== url))}
                aria-label="ลบไฟล์"
              >
                <X className="h-3 w-3" />
              </button>
              {isImageUrl(url) ? (
                <img src={withBase(url)} alt={`หลักฐาน ${i + 1}`} className="size-16 rounded-md border border-border object-cover" />
              ) : (
                <a
                  href={withBase(url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex size-16 flex-col items-center justify-center gap-0.5 rounded-md border border-border bg-muted/30 text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  <FileText className="h-4 w-4" />
                  {isPdfUrl(url) ? "PDF" : "ไฟล์"}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        disabled={uploading || room <= 0}
        onChange={(e) => addFiles(e.target.files)}
      />
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="bg-card"
          disabled={uploading || room <= 0}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
          {uploading ? "กำลังอัปโหลด..." : label}
        </Button>
        <span className="text-[11px] text-muted-foreground">
          {value.length}/{max} · รูปหรือ PDF
        </span>
      </div>
    </div>
  );
}
