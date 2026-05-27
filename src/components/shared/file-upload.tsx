"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, Loader2, Image as ImageIcon, FileText } from "lucide-react";

interface FileUploadProps {
  value: string | null;
  onChange: (url: string | null) => void;
  accept?: string;
  label?: string;
}

export function FileUpload({ value, onChange, accept = "image/*,.pdf", label = "Upload File" }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const isImage = value && /\.(jpg|jpeg|png|webp)$/i.test(value);
  const isPdf = value && /\.pdf$/i.test(value);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }
      const { url } = await res.json();
      onChange(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
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
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleFileChange}
          className="hidden"
          disabled={uploading}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 mr-1" />
          )}
          {uploading ? "Uploading..." : label}
        </Button>
      </div>
    </div>
  );
}
