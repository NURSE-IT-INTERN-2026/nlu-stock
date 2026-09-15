"use client";

import { useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { uploadAvatar } from "@/lib/api";
import { IMAGE_ACCEPT } from "@/lib/uploads";

// ขนาดที่เก็บจริง: วงกลมบน header ใหญ่สุด 40px, 256 พอสำหรับจอ 3x และยังเล็กเป็นหลัก KB
const OUTPUT_PX = 256;

async function cropToWebp(src: string, area: Area): Promise<Blob> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = OUTPUT_PX;
  canvas.getContext("2d")!.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, OUTPUT_PX, OUTPUT_PX);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("แปลงรูปไม่สำเร็จ"))), "image/webp", 0.9),
  );
}

export function AvatarDialog({
  open, onOpenChange, onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  // ปิด dialog = เริ่มใหม่ทุกครั้ง และคืน blob URL ที่ค้างอยู่
  useEffect(() => {
    if (open) return;
    setSrc(null);
    setZoom(1);
    setCrop({ x: 0, y: 0 });
  }, [open]);
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);

  const pick = (file: File | undefined) => {
    if (!file) return;
    setSrc(URL.createObjectURL(file));
    setZoom(1);
    setCrop({ x: 0, y: 0 });
  };

  const save = async () => {
    if (!src || !area) return;
    setSaving(true);
    try {
      const { url } = await uploadAvatar(await cropToWebp(src, area));
      onSaved(url);
      toast.success("เปลี่ยนรูปโปรไฟล์แล้ว");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>เปลี่ยนรูปโปรไฟล์</DialogTitle>
          <DialogDescription>ลากเพื่อจัดตำแหน่ง และปรับซูมให้พอดีวงกลม</DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          accept={IMAGE_ACCEPT}
          className="hidden"
          onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }}
        />

        {src ? (
          <>
            <div className="relative h-72 overflow-hidden rounded-lg bg-muted">
              <Cropper
                image={src}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, px) => setArea(px)}
              />
            </div>
            <label className="flex items-center gap-3 text-sm">
              <span className="shrink-0 text-muted-foreground">ซูม</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </label>
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-72 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            <ImagePlus className="size-8" />
            <span>เลือกรูป (jpg, png, webp)</span>
          </button>
        )}

        <DialogFooter>
          {src && (
            <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={saving}>
              เลือกรูปใหม่
            </Button>
          )}
          <Button onClick={save} disabled={!src || !area || saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            บันทึก
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
