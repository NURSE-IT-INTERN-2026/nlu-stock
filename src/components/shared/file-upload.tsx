"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, Loader2, Image as ImageIcon, FileText } from "lucide-react";
import { uploadFile } from "@/lib/api";

interface FileUploadProps {
  value: string | null;
  onChange: (url: string | null) => void;
  accept?: string;
  label?: string;
  variant?: "button" | "zone";
}

export function FileUpload({ value, onChange, accept = "image/*,.pdf", label = "อัปโหลดไฟล์", variant = "button" }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const isImage = value && /\.(jpg|jpeg|png|webp)$/i.test(value);
  const isPdf = value && /\.pdf$/i.test(value);

  async function uploadSingle(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { url } = await uploadFile(formData);
      onChange(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
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
              <img src={value} alt="Preview" className="h-28 w-auto rounded object-contain mx-auto" />
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
            <img src={value} alt="Preview" className="h-24 w-auto rounded object-contain" />
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
        <Button variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
          {uploading ? "กำลังอัปโหลด..." : label}
        </Button>
      </div>
    </div>
  );
}
